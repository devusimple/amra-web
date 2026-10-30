import { client } from "../api/client";
import { db, type FileMeta, type Message } from "../db";
import { createPeer, hasMediaSdp, hasVideoSdp } from "./webrtc";

/* ------------------------------------------------------------------ *
 *  Types
 * ------------------------------------------------------------------ */

export type ChatPhase = "idle" | "connecting" | "open" | "closed";

export type IncomingCall = {
    callId: number;
    peerId: number;
    peerName: string;
    video: boolean;
    offerSdp: string;
    at: number;
};

export type ActiveCall = {
    callId: number;
    peerId: number;
    peerName: string;
    role: "caller" | "callee";
    state: "ringing" | "active";
    video: boolean;
    micOn: boolean;
    camOn: boolean;
    localStream: MediaStream | null;
    remoteStream: MediaStream | null;
};

export type Snapshot = {
    chat: Record<number, ChatPhase>;
    incoming: IncomingCall | null;
    call: ActiveCall | null;
    toast: string | null;
    /** Live file transfers, keyed by message id. */
    transfers: Record<string, FileTransfer>;
};

/** Progress of one attachment moving over the data channel. */
export type FileTransfer = {
    id: string;
    peerId: number;
    name: string;
    size: number;
    bytes: number;
    dir: "in" | "out";
    status: "active" | "done" | "error";
    error?: string;
};

/** Largest attachment we accept (kept in memory while transferring). */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

/** JSON frames exchanged over the peer-to-peer data channel. */
type WireMessage = { id: string; from: number; to: number; body: string; ts: number; file?: FileMeta };
type Wire =
    | { t: "sync"; msgs: WireMessage[] }
    | { t: "msg"; m: WireMessage }
    | { t: "ack"; ids: string[] }
    | { t: "file-start"; f: FileMeta }
    | { t: "file-end"; id: string }
    | { t: "file-ack"; id: string; ok: boolean; error?: string };

/** Bytes buffered per chunk — small enough for every browser's SCTP limits. */
const FILE_CHUNK_BYTES = 16 * 1024;
/** Pause sending while the channel has more than this queued. */
const MAX_BUFFERED_BYTES = 4 * 1024 * 1024;

type IncomingFile = FileMeta & {
    chunks: Uint8Array[];
    received: number;
    rejected: boolean;
};

type Session = {
    key: string;
    kind: "chat" | "call";
    peerId: number;
    callId: number | null;
    role: "caller" | "callee";
    pc: RTCPeerConnection;
    dc: RTCDataChannel | null;
    state: ChatPhase;
    iceCursor: number;
    answered: boolean;
    answeredAt: number | null;
    closed: boolean;
    startedAt: number;
    video: boolean;
    localStream: MediaStream | null;
    remoteStream: MediaStream | null;
    /** ICE candidates gathered before the call row existed (caller only) */
    buffered: RTCIceCandidate[];
    intervals: Set<ReturnType<typeof setInterval>>;
    answerPollId: ReturnType<typeof setInterval> | null;
    icePollId: ReturnType<typeof setInterval> | null;
    statusPollId: ReturnType<typeof setInterval> | null;
};

const RING_TIMEOUT_MS = 30_000;
const INCOMING_TIMEOUT_MS = 30_000;
const CHAT_ANSWER_TIMEOUT_MS = 120_000;
const STALE_SESSION_MS = 15_000;
const PENDING_POLL_MS = 2_000;

/* ------------------------------------------------------------------ *
 *  CallManager
 *
 *  Owns every RTCPeerConnection in the app:
 *   - "chat" sessions: data-channel-only, auto-offered when you open a
 *     conversation and auto-answered by the remote app (offer SDP has no
 *     audio/video m-line), carrying text messages peer-to-peer.
 *   - "call" sessions: audio/video media, ring the callee for real.
 *
 *  Signaling goes through the REST API (offer/answer + trickled ICE with
 *  cursor paging), polled on timers.
 * ------------------------------------------------------------------ */

export class CallManager {
    private me: number | null = null;
    private sessions = new Map<string, Session>();
    private handledOffers = new Set<number>();
    private incomingQueue: IncomingCall[] = [];
    private activeCall: ActiveCall | null = null;
    private toast: string | null = null;
    private toastTimer: ReturnType<typeof setTimeout> | null = null;
    private globalIntervals = new Set<ReturnType<typeof setInterval>>();
    private callerTasks = new Map<string, Promise<void>>();
    /** Bumped on stop() so in-flight negotiations can abort cleanly. */
    private generation = 0;
    private listeners = new Set<() => void>();
    private transfers: Record<string, FileTransfer> = {};
    private incomingFiles = new Map<number, IncomingFile>();
    /** Message ids currently being written to the wire (avoid double sends). */
    private transferring = new Set<string>();
    /** Attachments fully sent but not yet acked, keyed by message id → peer. */
    private awaitingAck = new Map<string, number>();
    /** Serializes delivery per peer so chunks never interleave. */
    private deliverTasks = new Map<number, Promise<void>>();
    private lastProgressAt = 0;
    private snapshot: Snapshot = { chat: {}, incoming: null, call: null, toast: null, transfers: {} };

    /* --------------------------- react glue --------------------------- */

    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    };

    getSnapshot = (): Snapshot => this.snapshot;

    private emit(): void {
        const chat: Record<number, ChatPhase> = {};
        for (const session of this.sessions.values()) {
            if (session.kind === "chat") chat[session.peerId] = session.state;
        }
        this.snapshot = {
            chat,
            incoming: this.incomingQueue[0] ?? null,
            call: this.activeCall,
            toast: this.toast,
            transfers: this.transfers,
        };
        for (const listener of this.listeners) listener();
    }

    private showToast(message: string): void {
        this.toast = message;
        if (this.toastTimer) clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => {
            this.toast = null;
            this.emit();
        }, 4000);
        this.emit();
    }

    /* --------------------------- timers ------------------------------ */

    private every(
        target: Session | "global",
        ms: number,
        fn: () => Promise<void>,
    ): ReturnType<typeof setInterval> {
        const id = setInterval(() => {
            fn().catch((err) => console.error("[amra] interval task failed", err));
        }, ms);
        if (target === "global") this.globalIntervals.add(id);
        else target.intervals.add(id);
        return id;
    }

    private stopInterval(
        target: Session | "global",
        id: ReturnType<typeof setInterval>,
    ): void {
        clearInterval(id);
        if (target === "global") this.globalIntervals.delete(id);
        else target.intervals.delete(id);
    }

    /* --------------------------- lifecycle --------------------------- */

    start(meId: number): void {
        if (this.me !== null && this.me !== meId) this.stop();
        this.me = meId;
        if (this.globalIntervals.size > 0) return;
        this.pollPending().catch(() => {});
        this.every("global", PENDING_POLL_MS, () => this.pollPending());
    }

    stop(): void {
        this.generation += 1;
        for (const id of this.globalIntervals) clearInterval(id);
        this.globalIntervals.clear();
        for (const session of [...this.sessions.values()]) {
            this.endSession(session, { endRemote: true });
        }
        this.incomingQueue = [];
        this.handledOffers.clear();
        this.activeCall = null;
        this.incomingFiles.clear();
        this.transfers = {};
        this.transferring.clear();
        this.awaitingAck.clear();
        this.deliverTasks.clear();
        if (this.toastTimer) clearTimeout(this.toastTimer);
        this.toast = null;
        this.me = null;
        this.emit();
    }

    /* ------------------- incoming offers (callee side) --------------- */

    private async pollPending(): Promise<void> {
        if (this.me === null) return;

        // Ring timeout for the call currently shown to the user.
        const head = this.incomingQueue[0];
        if (head && Date.now() - head.at > INCOMING_TIMEOUT_MS) {
            this.incomingQueue = this.incomingQueue.slice(1);
            this.handledOffers.add(head.callId);
            client
                .POST("/api/signal/calls/{id}/decline", { params: { path: { id: head.callId } } })
                .catch(() => {});
            this.emit();
        }

        const { data } = await client.GET("/api/signal/calls/pending");
        for (const offer of data?.offers ?? []) {
            const callId = offer.id;
            const callerId = offer.caller_id;
            const sdp = offer.offer_sdp;
            if (callId == null || callerId == null || !sdp) continue;
            if (this.handledOffers.has(callId)) continue;
            this.handledOffers.add(callId);

            if (hasMediaSdp(sdp)) {
                // A real audio/video call → ring the user.
                this.incomingQueue.push({
                    callId,
                    peerId: callerId,
                    peerName: offer.caller_name || `User ${callerId}`,
                    video: hasVideoSdp(sdp),
                    offerSdp: sdp,
                    at: Date.now(),
                });
                this.emit();
            } else {
                // Data-channel-only offer → it's a chat session, answer silently.
                await this.handleChatOffer({ callId, peerId: callerId, offerSdp: sdp });
            }
        }
    }

    /**
     * Both peers may open a chat session at the same time (glare). Tie-break:
     * the peer with the higher user id yields — it drops its own offer and
     * answers the incoming one. The lower id keeps its offer, and the other
     * side ignores it (exactly one session survives).
     */
    private async handleChatOffer(args: { callId: number; peerId: number; offerSdp: string }): Promise<void> {
        const key = `chat:${args.peerId}`;
        const existing = this.sessions.get(key);
        if (existing) {
            if (existing.state === "open" || existing.callId === args.callId) return;
            const stale = Date.now() - existing.startedAt > STALE_SESSION_MS;
            const yields = this.me !== null && this.me > args.peerId;
            if (!stale && !yields) return; // we keep ours, the peer will drop theirs
            this.endSession(existing, { endRemote: true });
        }
        await this.acceptSession({
            kind: "chat",
            callId: args.callId,
            peerId: args.peerId,
            peerName: "",
            offerSdp: args.offerSdp,
            video: false,
        });
    }

    /* --------------------------- answering --------------------------- */

    private async acceptSession(args: {
        kind: "chat" | "call";
        callId: number;
        peerId: number;
        peerName: string;
        offerSdp: string;
        video: boolean;
    }): Promise<boolean> {
        const key = `${args.kind}:${args.peerId}`;
        const pc = createPeer();
        const sess: Session = {
            key,
            kind: args.kind,
            peerId: args.peerId,
            callId: args.callId,
            role: "callee",
            pc,
            dc: null,
            state: "connecting",
            iceCursor: 0,
            answered: true,
            answeredAt: null,
            closed: false,
            startedAt: Date.now(),
            video: args.video,
            localStream: null,
            remoteStream: null,
            buffered: [],
            intervals: new Set(),
            answerPollId: null,
            icePollId: null,
            statusPollId: null,
        };
        this.wirePeer(sess);
        this.sessions.set(key, sess);

        try {
            await pc.setRemoteDescription({ type: "offer", sdp: args.offerSdp });
            if (sess.closed) return false;

            if (args.kind === "call") {
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: true,
                    video: args.video,
                });
                if (sess.closed) {
                    stream.getTracks().forEach((track) => track.stop());
                    return false;
                }
                sess.localStream = stream;
                for (const track of stream.getTracks()) pc.addTrack(track, stream);
            }

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            const answerSdp = pc.localDescription?.sdp ?? answer.sdp;
            if (!answerSdp) throw new Error("Could not create an SDP answer");

            const { error } = await client.PUT("/api/signal/calls/{id}/answer", {
                params: { path: { id: args.callId } },
                body: { answer_sdp: answerSdp },
            });
            if (error) throw new Error(error.error);

            // Hung up / signed out while the answer was in flight.
            if (sess.closed) return false;

            sess.answeredAt = Date.now();
            sess.state = "connecting";
            this.startIcePoll(sess);
            if (sess.kind === "call") {
                this.startStatusPoll(sess);
                this.activeCall = {
                    callId: args.callId,
                    peerId: args.peerId,
                    peerName: args.peerName,
                    role: "callee",
                    state: "active",
                    video: args.video,
                    micOn: true,
                    camOn: args.video,
                    localStream: sess.localStream,
                    remoteStream: null,
                };
            }
            this.emit();
            return true;
        } catch (err) {
            console.error("[amra] failed to answer", err);
            // Tell the caller we could not connect instead of leaving them ringing.
            this.endSession(sess, { endRemote: true });
            this.showToast(args.kind === "call" ? "Could not answer the call" : "Could not connect");
            return false;
        }
    }

    async acceptIncoming(): Promise<void> {
        const incoming = this.incomingQueue[0];
        if (!incoming) return;
        if (this.activeCall) {
            this.showToast("You're already in a call");
            return;
        }
        this.incomingQueue = this.incomingQueue.slice(1);
        // Show the call screen right away (permission prompt / SDP setup takes a moment).
        this.activeCall = {
            callId: incoming.callId,
            peerId: incoming.peerId,
            peerName: incoming.peerName,
            role: "callee",
            state: "active",
            video: incoming.video,
            micOn: true,
            camOn: incoming.video,
            localStream: null,
            remoteStream: null,
        };
        this.emit();
        await this.acceptSession({
            kind: "call",
            callId: incoming.callId,
            peerId: incoming.peerId,
            peerName: incoming.peerName,
            offerSdp: incoming.offerSdp,
            video: incoming.video,
        });
    }

    declineIncoming(): void {
        const incoming = this.incomingQueue[0];
        if (!incoming) return;
        this.incomingQueue = this.incomingQueue.slice(1);
        client
            .POST("/api/signal/calls/{id}/decline", { params: { path: { id: incoming.callId } } })
            .catch(() => {});
        this.emit();
    }

    /* ---------------------- starting sessions ------------------------ */

    /** Open (or reuse) the peer-to-peer data channel used for messaging. */
    async openChat(peerId: number): Promise<void> {
        if (this.me === null) return;
        const key = `chat:${peerId}`;
        const existing = this.sessions.get(key);
        if (existing) {
            if (existing.state === "open") return;
            if (existing.role === "caller") return; // our offer is already in flight
            // Callee side that never finished connecting: replace it when stale.
            if (Date.now() - existing.startedAt < STALE_SESSION_MS) return;
            this.endSession(existing, { endRemote: true });
        }
        await this.createCallerSession({ kind: "chat", peerId });
    }

    /** Drop a stuck/offline chat session and try a fresh offer. */
    async retryChat(peerId: number): Promise<void> {
        if (this.me === null) return;
        const existing = this.sessions.get(`chat:${peerId}`);
        if (existing) this.endSession(existing, { endRemote: true });
        await this.createCallerSession({ kind: "chat", peerId });
    }

    async startCall(peerId: number, peerName: string, video: boolean): Promise<void> {
        if (this.me === null) return;
        if (this.activeCall) {
            this.showToast("You're already in a call");
            return;
        }
        if (this.sessions.get(`call:${peerId}`)) {
            this.showToast("You're already in a call with this contact");
            return;
        }

        let stream: MediaStream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true, video });
        } catch {
            this.showToast(video ? "Camera / microphone permission denied" : "Microphone permission denied");
            return;
        }

        this.activeCall = {
            callId: 0,
            peerId,
            peerName,
            role: "caller",
            state: "ringing",
            video,
            micOn: true,
            camOn: video,
            localStream: stream,
            remoteStream: null,
        };
        this.emit();

        await this.createCallerSession({ kind: "call", peerId, localStream: stream });
    }

    private async createCallerSession(args: {
        kind: "chat" | "call";
        peerId: number;
        localStream?: MediaStream | null;
    }): Promise<void> {
        const key = `${args.kind}:${args.peerId}`;

        // Two entry points (opening a chat + sending a queued message, React
        // StrictMode double effects) can race here. Share the in-flight task.
        const inFlight = this.callerTasks.get(key);
        if (inFlight) {
            await inFlight;
            if (this.sessions.has(key)) return;
        }

        const task = this.startCallerSession(args);
        this.callerTasks.set(key, task);
        try {
            await task;
        } finally {
            if (this.callerTasks.get(key) === task) this.callerTasks.delete(key);
        }
    }

    private async startCallerSession(args: {
        kind: "chat" | "call";
        peerId: number;
        localStream?: MediaStream | null;
    }): Promise<void> {
        const key = `${args.kind}:${args.peerId}`;
        const generation = this.generation;
        const pc = createPeer();
        const sess: Session = {
            key,
            kind: args.kind,
            peerId: args.peerId,
            callId: null,
            role: "caller",
            pc,
            dc: null,
            state: "connecting",
            iceCursor: 0,
            answered: false,
            answeredAt: null,
            closed: false,
            startedAt: Date.now(),
            video: !!args.localStream?.getVideoTracks().length,
            localStream: args.localStream ?? null,
            remoteStream: null,
            buffered: [],
            intervals: new Set(),
            answerPollId: null,
            icePollId: null,
            statusPollId: null,
        };
        this.wirePeer(sess);

        try {
            if (args.kind === "chat") {
                this.bindDataChannel(sess, pc.createDataChannel("chat"));
            } else if (args.localStream) {
                // Without tracks the offer would be a track-less SDP, which the
                // callee classifies as a chat session instead of ringing.
                for (const track of args.localStream.getTracks()) {
                    pc.addTrack(track, args.localStream);
                }
            }

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            const offerSdp = pc.localDescription?.sdp ?? offer.sdp;
            if (!offerSdp) throw new Error("Could not create an SDP offer");

            // Signed out / stopped while gathering ICE.
            if (sess.closed || generation !== this.generation) {
                this.endSession(sess, {});
                return;
            }

            // Register before POST so ICE candidates gathered in the meantime
            // can be flushed once the call row exists.
            this.sessions.set(key, sess);

            const { data, error } = await client.POST("/api/signal/calls", {
                body: { callee_id: args.peerId, offer_sdp: offerSdp },
            });
            if (error || !data?.call?.id) throw new Error(error?.error ?? "Could not start the session");
            sess.callId = data.call.id;

            // Stopped, retried or hung up while we were still negotiating.
            const stale = sess.closed
                || generation !== this.generation
                || (args.kind === "call" && (!this.activeCall || this.activeCall.peerId !== args.peerId));

            if (stale) {
                client
                    .POST("/api/signal/calls/{id}/end", { params: { path: { id: sess.callId } } })
                    .catch(() => {});
                this.endSession(sess, {});
                return;
            }

            for (const candidate of sess.buffered) this.postCandidate(sess.callId, candidate);
            sess.buffered = [];

            if (args.kind === "call" && this.activeCall && this.activeCall.peerId === args.peerId) {
                this.activeCall = { ...this.activeCall, callId: sess.callId };
            }

            this.startAnswerPoll(sess);
            this.startIcePoll(sess);
            this.emit();
        } catch (err) {
            console.error("[amra] could not create session", err);
            this.endSession(sess, { endRemote: true });
            if (generation !== this.generation) return;
            if (args.kind === "call") {
                this.activeCall = null;
                this.showToast("Could not start the call");
            } else {
                this.showToast("Could not open the conversation");
            }
        }
    }

    /* --------------------------- polling ----------------------------- */

    private startAnswerPoll(sess: Session): void {
        if (sess.answerPollId !== null) return;
        sess.answerPollId = this.every(sess, sess.kind === "chat" ? 2000 : 1000, async () => {
            if (sess.closed || sess.callId === null || sess.answered) return;
            const { data, error } = await client.GET("/api/signal/calls/{id}", {
                params: { path: { id: sess.callId } },
            });
            if (error || !data?.call) {
                this.endSession(sess, { toast: sess.kind === "call" ? "Call failed" : undefined });
                return;
            }
            const call = data.call;

            if (call.answer_sdp) {
                await sess.pc.setRemoteDescription({ type: "answer", sdp: call.answer_sdp });
                sess.answered = true;
                sess.answeredAt = Date.now();
                this.stopAnswerPoll(sess);
                this.startIcePoll(sess);
                if (sess.kind === "call") this.startStatusPoll(sess);
                sess.state = "connecting";
                this.emit();
                return;
            }
            if (call.status === "declined") {
                this.endSession(sess, { toast: sess.kind === "call" ? "Call declined" : undefined });
                return;
            }
            if (call.status === "ended") {
                this.endSession(sess, { toast: sess.kind === "call" ? "Call ended" : undefined });
                return;
            }

            const elapsed = Date.now() - sess.startedAt;
            if (sess.kind === "call" && elapsed > RING_TIMEOUT_MS) {
                if (sess.callId !== null) {
                    client
                        .POST("/api/signal/calls/{id}/end", { params: { path: { id: sess.callId } } })
                        .catch(() => {});
                }
                this.endSession(sess, { toast: "No answer" });
                return;
            }
            if (sess.kind === "chat" && elapsed > CHAT_ANSWER_TIMEOUT_MS) {
                // Peer's app is not around — drop our pending offer so it does
                // not get answered by a dead connection later. Sending another
                // message (or reopening the chat) starts a fresh attempt.
                this.endSession(sess, { endRemote: true });
            }
        });
    }

    private stopAnswerPoll(sess: Session): void {
        if (sess.answerPollId === null) return;
        this.stopInterval(sess, sess.answerPollId);
        sess.answerPollId = null;
    }

    private startIcePoll(sess: Session): void {
        if (sess.icePollId !== null) return;
        sess.icePollId = this.every(sess, 1000, async () => {
            if (sess.closed || sess.callId === null) return;

            // STUN-only negotiation can stall forever on hostile NATs. Give up
            // a while after the answer so the UI offers a retry instead of
            // spinning — but never cut off an offer the peer has not seen yet.
            const connection = sess.pc.connectionState;
            if (
                sess.answeredAt !== null
                && connection !== "connected"
                && Date.now() - sess.answeredAt > 20_000
            ) {
                this.endSession(sess, {
                    endRemote: true,
                    toast: sess.kind === "call" ? "Could not connect the call" : undefined,
                });
                return;
            }

            const { data } = await client.GET("/api/signal/calls/{id}/candidates", {
                params: { path: { id: sess.callId }, query: { after: sess.iceCursor } },
            });
            if (!data) return;
            if (typeof data.cursor === "number") sess.iceCursor = data.cursor;
            for (const c of data.candidates ?? []) {
                if (!c.candidate) continue;
                try {
                    await sess.pc.addIceCandidate({
                        candidate: c.candidate,
                        sdpMid: c.sdp_mid ?? undefined,
                        sdpMLineIndex: c.sdp_mline_index ?? undefined,
                    });
                } catch {
                    // A late/duplicate candidate is harmless — skip it.
                }
            }
            if (sess.pc.connectionState === "connected") this.stopIcePoll(sess);
        });
    }

    private stopIcePoll(sess: Session): void {
        if (sess.icePollId === null) return;
        this.stopInterval(sess, sess.icePollId);
        sess.icePollId = null;
    }

    /** Detects the remote side hanging up / declining a media call. */
    private startStatusPoll(sess: Session): void {
        if (sess.statusPollId !== null) return;
        sess.statusPollId = this.every(sess, 2000, async () => {
            if (sess.closed || sess.callId === null) return;
            const { data, error } = await client.GET("/api/signal/calls/{id}", {
                params: { path: { id: sess.callId } },
            });
            if (error) {
                this.endSession(sess, { toast: "Call ended" });
                return;
            }
            const status = data?.call?.status;
            if (status === "ended" || status === "declined") {
                this.endSession(sess, { toast: status === "declined" ? "Call declined" : "Call ended" });
            }
        });
    }

    /* --------------------- peer connection wiring --------------------- */

    private wirePeer(sess: Session): void {
        const pc = sess.pc;

        pc.onicecandidate = (e) => {
            if (!e.candidate || !e.candidate.candidate) return;
            if (sess.callId === null) {
                sess.buffered.push(e.candidate);
                return;
            }
            this.postCandidate(sess.callId, e.candidate).catch(() => {});
        };

        pc.ondatachannel = (e) => this.bindDataChannel(sess, e.channel);

        pc.ontrack = (e) => {
            const stream = e.streams[0] ?? new MediaStream([e.track]);
            sess.remoteStream = stream;
            if (sess.kind === "call" && this.activeCall && this.activeCall.peerId === sess.peerId) {
                this.activeCall = { ...this.activeCall, remoteStream: stream };
                this.emit();
            }
        };

        pc.onconnectionstatechange = () => {
            const state = pc.connectionState;
            if (state === "connected") {
                if (sess.kind === "chat" && sess.dc?.readyState !== "open" && sess.state !== "open") {
                    // Chat becomes "open" only when the data channel is usable.
                    return;
                }
                if (sess.state !== "open") {
                    sess.state = "open";
                    if (sess.kind === "call" && this.activeCall && this.activeCall.peerId === sess.peerId) {
                        this.activeCall = { ...this.activeCall, state: "active" };
                    }
                    this.emit();
                }
                this.stopIcePoll(sess);
            } else if (state === "failed" || state === "closed") {
                this.endSession(sess, {
                    endRemote: true,
                    toast: sess.kind === "call" ? "Call lost" : undefined,
                });
            }
        };
    }

    private async postCandidate(callId: number, candidate: RTCIceCandidate | RTCIceCandidateInit): Promise<void> {
        const init = "toJSON" in candidate ? candidate.toJSON() : candidate;
        if (!init.candidate) return;
        await client.POST("/api/signal/calls/{id}/candidates", {
            params: { path: { id: callId } },
            body: {
                candidate: init.candidate,
                sdpMid: init.sdpMid ?? undefined,
                sdpMLineIndex: init.sdpMLineIndex ?? undefined,
            },
        });
    }

    private endSession(sess: Session, opts: { endRemote?: boolean; toast?: string } = {}): void {
        if (sess.closed) return;
        sess.closed = true;

        if (this.sessions.get(sess.key) === sess) this.sessions.delete(sess.key);
        for (const id of sess.intervals) clearInterval(id);
        sess.intervals.clear();
        sess.answerPollId = null;
        sess.icePollId = null;
        sess.statusPollId = null;

        if (sess.kind === "chat") {
            // A dropped channel means "send again on reconnect" for any file
            // that has not been acked yet, and any partial download is void.
            for (const [id, peer] of this.awaitingAck) {
                if (peer === sess.peerId) this.awaitingAck.delete(id);
            }
            for (const [id, transfer] of Object.entries(this.transfers)) {
                if (transfer.peerId === sess.peerId && transfer.status === "active") {
                    delete this.transfers[id];
                }
            }
            this.incomingFiles.delete(sess.peerId);
        }

        try {
            sess.dc?.close();
        } catch {
            /* already closed */
        }
        try {
            sess.pc.close();
        } catch {
            /* already closed */
        }
        sess.localStream?.getTracks().forEach((track) => track.stop());

        if (opts.endRemote && sess.callId !== null && this.me !== null) {
            client
                .POST("/api/signal/calls/{id}/end", { params: { path: { id: sess.callId } } })
                .catch(() => {});
        }

        if (sess.kind === "call" && this.activeCall && this.activeCall.peerId === sess.peerId) {
            this.activeCall = null;
        }

        this.emit();
        if (opts.toast) this.showToast(opts.toast);
    }

    /* --------------------------- calling UI -------------------------- */

    endCall(): void {
        const call = this.activeCall;
        if (!call) return;
        const sess = this.sessions.get(`call:${call.peerId}`);
        if (sess && sess.callId !== null) {
            client
                .POST("/api/signal/calls/{id}/end", { params: { path: { id: sess.callId } } })
                .catch(() => {});
        }
        this.activeCall = null;
        if (sess) this.endSession(sess, {});
        else this.emit();
        this.showToast("Call ended");
    }

    setMic(on: boolean): void {
        const call = this.activeCall;
        if (!call) return;
        call.localStream?.getAudioTracks().forEach((track) => {
            track.enabled = on;
        });
        this.activeCall = { ...call, micOn: on };
        this.emit();
    }

    setCam(on: boolean): void {
        const call = this.activeCall;
        if (!call) return;
        call.localStream?.getVideoTracks().forEach((track) => {
            track.enabled = on;
        });
        this.activeCall = { ...call, camOn: on };
        this.emit();
    }

    /* --------------------------- messaging --------------------------- */

    async send(peerId: number, body: string): Promise<Message | null> {
        const text = body.trim();
        if (!text || this.me === null) return null;
        const msg: Message = {
            id: crypto.randomUUID(),
            peerId,
            from: this.me,
            to: peerId,
            body: text,
            ts: Date.now(),
            dir: "out",
            status: "pending",
        };
        await db.messages.put(msg);
        this.deliverPending(peerId).catch((err) => console.error("[amra] deliver failed", err));
        return msg;
    }

    /**
     * Queue a file for peer-to-peer delivery. The blob is kept in IndexedDB so
     * it survives reloads and is retried whenever the data channel reopens.
     */
    async sendFile(peerId: number, file: File): Promise<Message | null> {
        if (this.me === null) return null;
        if (file.size === 0) {
            this.showToast("That file is empty");
            return null;
        }
        if (file.size > MAX_FILE_BYTES) {
            this.showToast(`File is too large (max ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB)`);
            return null;
        }

        const id = crypto.randomUUID();
        const meta: FileMeta = {
            id,
            name: file.name || "file",
            type: file.type || "application/octet-stream",
            size: file.size,
        };
        const msg: Message = {
            id,
            peerId,
            from: this.me,
            to: peerId,
            body: "",
            ts: Date.now(),
            dir: "out",
            status: "pending",
            file: meta,
        };
        await db.transaction("rw", db.messages, db.files, async () => {
            await db.files.put({ ...meta, peerId, blob: file, ts: msg.ts });
            await db.messages.put(msg);
        });
        this.transfers[id] = {
            id,
            peerId,
            name: meta.name,
            size: meta.size,
            bytes: 0,
            dir: "out",
            status: "active",
        };
        this.emit();
        this.deliverPending(peerId).catch((err) => console.error("[amra] deliver failed", err));
        return msg;
    }

    private deliverPending(peerId: number, filesOnly = false): Promise<void> {
        // Serialize per peer: overlapping runs would interleave file chunks.
        const previous = this.deliverTasks.get(peerId) ?? Promise.resolve();
        const task = previous.catch(() => {}).then(() => this.runDeliver(peerId, filesOnly));
        this.deliverTasks.set(peerId, task);
        task.catch(() => {}).then(() => {
            if (this.deliverTasks.get(peerId) === task) this.deliverTasks.delete(peerId);
        });
        return task;
    }

    private async runDeliver(peerId: number, filesOnly: boolean): Promise<void> {
        const sess = this.sessions.get(`chat:${peerId}`);
        if (!sess || sess.state !== "open" || sess.dc?.readyState !== "open") {
            // Not connected yet — (re)start the session; everything, including
            // these messages, is flushed when the channel opens.
            if (!filesOnly) await this.openChat(peerId);
            return;
        }
        const rows = await db.messages
            .where("peerId")
            .equals(peerId)
            .filter((row) => row.dir === "out"
                && row.status !== "delivered"
                && row.status !== "failed"
                && (!filesOnly || !!row.file))
            .sortBy("ts");

        for (const row of rows) {
            if (sess.closed || sess.dc?.readyState !== "open") return;
            if (row.file) {
                if (this.transferring.has(row.id) || this.awaitingAck.has(row.id)) continue;
                await this.sendFileMessage(sess, row);
            } else if (!filesOnly) {
                const ok = this.sendWire(peerId, {
                    t: "msg",
                    m: { id: row.id, from: row.from, to: row.to, body: row.body, ts: row.ts },
                });
                if (ok) await db.messages.update(row.id, { status: "sent" });
            }
        }
    }

    /** Stream one stored attachment down the session's data channel. */
    private async sendFileMessage(sess: Session, row: Message): Promise<void> {
        const meta = row.file;
        const dc = sess.dc;
        if (!meta || !dc) return;

        const stored = await db.files.get(row.id);
        if (!stored?.blob) {
            await db.messages.update(row.id, { status: "failed", error: "File data is unavailable" });
            this.finishTransfer(row.id, "error", "File data is unavailable");
            return;
        }

        this.transferring.add(row.id);
        try {
            if (!this.sendWire(row.peerId, { t: "file-start", f: meta })) return;
            await db.messages.update(row.id, { status: "sent" });
            this.setTransfer({
                id: row.id,
                peerId: row.peerId,
                name: meta.name,
                size: meta.size,
                bytes: 0,
                dir: "out",
                status: "active",
            }, true);

            const buffer = await stored.blob.arrayBuffer();
            let offset = 0;
            while (offset < buffer.byteLength) {
                if (sess.closed || dc.readyState !== "open") return;
                const end = Math.min(offset + FILE_CHUNK_BYTES, buffer.byteLength);
                try {
                    dc.send(buffer.slice(offset, end));
                } catch {
                    return;
                }
                offset = end;
                this.setTransferBytes(row.id, offset);
                await this.waitForDrain(dc);
            }

            if (sess.closed || dc.readyState !== "open") return;
            if (!this.sendWire(row.peerId, { t: "file-end", id: row.id })) return;

            // Do not mark delivered yet — the peer acks once the blob is stored.
            this.awaitingAck.set(row.id, row.peerId);
            setTimeout(() => {
                // A lost ack should not pin the file forever.
                if (this.awaitingAck.get(row.id) === row.peerId) this.awaitingAck.delete(row.id);
            }, 60_000);
            this.finishTransfer(row.id, "done");
        } catch (err) {
            console.error("[amra] file send failed", err);
            this.finishTransfer(row.id, "error", "Could not send the file");
        } finally {
            this.transferring.delete(row.id);
        }
    }

    private waitForDrain(dc: RTCDataChannel): Promise<void> {
        if (dc.readyState !== "open" || dc.bufferedAmount <= MAX_BUFFERED_BYTES) {
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            let settled = false;
            let timer: ReturnType<typeof setTimeout> | undefined;
            const finish = () => {
                if (settled) return;
                settled = true;
                dc.removeEventListener("bufferedamountlow", finish);
                if (timer) clearTimeout(timer);
                resolve();
            };
            dc.addEventListener("bufferedamountlow", finish);
            timer = setTimeout(finish, 2_000);
        });
    }

    private setTransfer(transfer: FileTransfer, force = false): void {
        this.transfers[transfer.id] = transfer;
        this.emitProgress(force);
    }

    private setTransferBytes(id: string, bytes: number): void {
        const current = this.transfers[id];
        if (!current) return;
        this.transfers[id] = { ...current, bytes };
        this.emitProgress();
    }

    private emitProgress(force = false): void {
        const now = Date.now();
        if (!force && now - this.lastProgressAt < 80) return;
        this.lastProgressAt = now;
        this.emit();
    }

    /** Reset a failed attachment so the next delivery pass sends it again. */
    async retryFile(id: string): Promise<void> {
        const row = await db.messages.get(id);
        if (!row?.file || this.me === null) return;
        await db.messages.update(id, { status: "pending", error: undefined });
        this.awaitingAck.delete(id);
        this.deliverPending(row.peerId).catch((err) => console.error("[amra] file retry failed", err));
    }

    private finishTransfer(id: string, status: "done" | "error", error?: string): void {
        const current = this.transfers[id];
        if (!current) return;
        this.transfers[id] = {
            ...current,
            bytes: status === "done" ? current.size : current.bytes,
            status,
            error,
        };
        this.emit();
        setTimeout(() => {
            if (this.transfers[id]?.status === status) {
                delete this.transfers[id];
                this.emit();
            }
        }, 3_000);
    }

    private sendWire(peerId: number, wire: Wire): boolean {
        const sess = this.sessions.get(`chat:${peerId}`);
        if (!sess || sess.dc?.readyState !== "open") return false;
        try {
            sess.dc.send(JSON.stringify(wire));
            return true;
        } catch {
            return false;
        }
    }

    private bindDataChannel(sess: Session, dc: RTCDataChannel): void {
        sess.dc = dc;
        dc.binaryType = "arraybuffer";
        dc.bufferedAmountLowThreshold = MAX_BUFFERED_BYTES / 2;
        dc.onopen = () => {
            if (sess.closed) return;
            sess.state = "open";
            this.emit();
            this.syncToPeer(sess.peerId).catch((err) => console.error("[amra] sync failed", err));
        };
        dc.onmessage = (e) => {
            if (typeof e.data === "string") {
                this.handleWire(sess.peerId, e.data).catch((err) => console.error("[amra] wire failed", err));
            } else if (e.data instanceof ArrayBuffer) {
                this.handleFileChunk(sess.peerId, e.data);
            }
        };
        dc.onclose = () => {
            this.endSession(sess, { endRemote: true });
        };
    }

    /** Full state exchange — runs whenever a channel opens. */
    private async syncToPeer(peerId: number): Promise<void> {
        const rows = await db.messages.where("peerId").equals(peerId).toArray();
        if (rows.length) {
            this.sendWire(peerId, {
                t: "sync",
                msgs: rows.map((r) => ({
                    id: r.id,
                    from: r.from,
                    to: r.to,
                    body: r.body,
                    ts: r.ts,
                    ...(r.file ? { file: r.file } : {}),
                })),
            });
        }
        for (const row of rows) {
            if (row.dir === "out" && row.status === "pending") {
                await db.messages.update(row.id, { status: "sent" });
            }
        }
        // Text is covered by the sync frame; attachments still need their bytes.
        await this.deliverPending(peerId, true);
    }

    private async handleWire(peerId: number, raw: string): Promise<void> {
        if (!raw) return;
        let wire: Wire;
        try {
            wire = JSON.parse(raw) as Wire;
        } catch {
            return;
        }

        if (wire?.t === "msg" && wire.m) {
            await this.ingest(peerId, wire.m);
            await this.ackIncoming(peerId, wire.m);
        } else if (wire?.t === "sync" && Array.isArray(wire.msgs)) {
            const ackIds: string[] = [];
            for (const m of wire.msgs) {
                await this.ingest(peerId, m);
                // Only ack what the peer sent us — that marks it delivered on
                // their side. Attachments are acked after their bytes arrive.
                if (m.from === this.me) continue;
                if (m.file) await this.ackIncoming(peerId, m);
                else ackIds.push(m.id);
            }
            if (ackIds.length) this.sendWire(peerId, { t: "ack", ids: ackIds });
        } else if (wire?.t === "ack" && Array.isArray(wire.ids)) {
            for (const id of wire.ids) {
                const row = await db.messages.get(id);
                // Attachments use file-ack, which also confirms the blob exists.
                if (row && !row.file && row.dir === "out" && row.peerId === peerId && row.status !== "delivered") {
                    await db.messages.update(id, { status: "delivered" });
                }
            }
        } else if (wire?.t === "file-start" && wire.f) {
            this.handleFileStart(peerId, wire.f);
        } else if (wire?.t === "file-end" && typeof wire.id === "string") {
            await this.handleFileEnd(peerId, wire.id);
        } else if (wire?.t === "file-ack" && typeof wire.id === "string") {
            await this.handleFileAck(peerId, wire.id, wire.ok, wire.error);
        }
    }

    /** Ack a message the peer sent us (files only once their bytes are stored). */
    private async ackIncoming(peerId: number, m: WireMessage): Promise<void> {
        if (m.from === this.me) return;
        if (m.file) {
            const stored = await db.files.get(m.id);
            if (stored?.blob) this.sendWire(peerId, { t: "file-ack", id: m.id, ok: true });
            return;
        }
        this.sendWire(peerId, { t: "ack", ids: [m.id] });
    }

    private handleFileStart(peerId: number, incoming: FileMeta): void {
        if (!incoming || typeof incoming.id !== "string") return;

        const meta: FileMeta = {
            id: incoming.id,
            name: typeof incoming.name === "string" ? incoming.name.slice(0, 255) : "file",
            type: typeof incoming.type === "string" ? incoming.type : "",
            size: Number(incoming.size) || 0,
        };
        const rejected = meta.size > MAX_FILE_BYTES;

        // Register synchronously: binary chunks follow immediately on the same
        // channel and must find this entry, before any IndexedDB work awaits.
        this.incomingFiles.set(peerId, { ...meta, chunks: [], received: 0, rejected });
        this.setTransfer({
            id: meta.id,
            peerId,
            name: meta.name,
            size: meta.size,
            bytes: 0,
            dir: "in",
            status: rejected ? "error" : "active",
            error: rejected ? "File is too large" : undefined,
        }, true);

        if (rejected) {
            this.sendWire(peerId, { t: "file-ack", id: meta.id, ok: false, error: "File is too large" });
            this.finishTransfer(meta.id, "error", "File is too large");
            return;
        }

        // Already have the bytes (e.g. the sender retried after a lost ack).
        db.files.get(meta.id).then((existing) => {
            if (!existing?.blob) return;
            const current = this.incomingFiles.get(peerId);
            if (current?.id === meta.id) this.incomingFiles.delete(peerId);
            this.sendWire(peerId, { t: "file-ack", id: meta.id, ok: true });
            this.finishTransfer(meta.id, "done");
        }).catch(() => { /* a lookup failure is harmless — the transfer proceeds */ });
    }

    private handleFileChunk(peerId: number, data: ArrayBuffer): void {
        const current = this.incomingFiles.get(peerId);
        if (!current || current.rejected) return;
        if (current.received + data.byteLength > current.size) {
            current.rejected = true;
            current.chunks = [];
            return;
        }
        current.chunks.push(new Uint8Array(data));
        current.received += data.byteLength;
        this.setTransferBytes(current.id, current.received);
    }

    private async handleFileEnd(peerId: number, id: string): Promise<void> {
        const current = this.incomingFiles.get(peerId);
        this.incomingFiles.delete(peerId);
        if (!current || current.id !== id) return;

        if (current.rejected) {
            this.sendWire(peerId, { t: "file-ack", id, ok: false, error: "File could not be received" });
            return;
        }
        if (current.received !== current.size) {
            this.finishTransfer(id, "error", "Incomplete file");
            this.sendWire(peerId, { t: "file-ack", id, ok: false, error: "Incomplete file" });
            return;
        }

        const meta: FileMeta = { id, name: current.name, type: current.type, size: current.size };
        const blob = new Blob(current.chunks as BlobPart[], {
            type: current.type || "application/octet-stream",
        });
        const existing = await db.messages.get(id);
        const ts = existing?.ts ?? Date.now();

        try {
            await db.transaction("rw", db.messages, db.files, async () => {
                await db.files.put({ ...meta, peerId, blob, ts });
                const message: Message = existing
                    ? { ...existing, file: meta }
                    : {
                        id,
                        peerId,
                        from: peerId,
                        to: this.me ?? peerId,
                        body: "",
                        ts,
                        dir: "in",
                        status: "delivered",
                        file: meta,
                    };
                await db.messages.put(message);
            });
        } catch (err) {
            console.error("[amra] could not store the received file", err);
            this.finishTransfer(id, "error", "Could not store the file");
            this.sendWire(peerId, { t: "file-ack", id, ok: false, error: "Could not store the file" });
            return;
        }

        this.sendWire(peerId, { t: "file-ack", id, ok: true });
        this.finishTransfer(id, "done");
    }

    private async handleFileAck(peerId: number, id: string, ok: boolean, error?: string): Promise<void> {
        this.awaitingAck.delete(id);
        const row = await db.messages.get(id);
        if (row && row.dir === "out" && row.peerId === peerId) {
            if (ok) {
                await db.messages.update(id, { status: "delivered", error: undefined });
            } else {
                await db.messages.update(id, {
                    status: "failed",
                    error: error || "The peer could not receive the file",
                });
            }
        }
        if (ok) {
            this.finishTransfer(id, "done");
        } else {
            this.finishTransfer(id, "error", error || "Transfer failed");
            this.showToast(error || "The peer could not receive the file");
        }
        this.emit();
    }

    private async ingest(peerId: number, m: WireMessage): Promise<void> {
        if (!m?.id || (typeof m.body !== "string" && !m.file)) return;
        const dir: Message["dir"] = m.from === this.me ? "out" : "in";
        const file: FileMeta | undefined = m.file
            ? {
                id: m.id,
                name: typeof m.file.name === "string" ? m.file.name.slice(0, 255) : "file",
                type: typeof m.file.type === "string" ? m.file.type : "",
                size: Number(m.file.size) || 0,
            }
            : undefined;
        const existing = await db.messages.get(m.id);
        if (existing) {
            // Already stored (dedup by uuid). A synced copy of one of our own
            // text messages means the peer has it — files need file-ack instead.
            if (dir === "out" && !existing.file && existing.status !== "delivered") {
                await db.messages.update(m.id, { status: "delivered" });
            } else if (file && !existing.file) {
                await db.messages.update(m.id, { file });
            }
            return;
        }
        await db.messages.put({
            id: m.id,
            peerId,
            from: m.from,
            to: m.to,
            body: typeof m.body === "string" ? m.body : "",
            ts: typeof m.ts === "number" ? m.ts : Date.now(),
            dir,
            status: "delivered",
            ...(file ? { file } : {}),
        });
    }
}

export const manager = new CallManager();
