import { useEffect, useRef, useState } from "react";
import type { ActiveCall, IncomingCall } from "../lib/call-manager";
import { formatDuration } from "../lib/format";
import { Avatar } from "./avatar";
import { MicIcon, MicOffIcon, PhoneIcon, PhoneOffIcon, VideoIcon, VideoOffIcon } from "./icons";

function useVideoStream(stream: MediaStream | null) {
    const ref = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        if (el.srcObject !== stream) el.srcObject = stream;
        if (stream) el.play().catch(() => { /* autoplay is best-effort */ });
        return () => {
            if (el.srcObject === stream) el.srcObject = null;
        };
    }, [stream]);

    return ref;
}

/* ------------------------------- incoming ------------------------------- */

type IncomingProps = {
    incoming: IncomingCall;
    onAccept: () => void;
    onDecline: () => void;
};

export function IncomingCallOverlay({ incoming, onAccept, onDecline }: IncomingProps) {
    return (
        <div className="fixed inset-0 z-50 grid place-content-center bg-neutral-950/80 p-4 backdrop-blur-md">
            <div
                role="dialog"
                aria-modal="true"
                aria-label={`Incoming ${incoming.video ? "video" : "audio"} call from ${incoming.peerName}`}
                className="w-[min(92vw,360px)] rounded-3xl border border-neutral-800 bg-neutral-900 p-7 text-center shadow-2xl"
            >
                <div className="relative mx-auto mb-5 h-28 w-28">
                    <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/20" />
                    <span className="absolute inset-2 animate-pulse rounded-full bg-emerald-500/10" />
                    <div className="relative grid h-full w-full place-content-center">
                        <Avatar id={incoming.peerId} name={incoming.peerName} size={96} />
                    </div>
                </div>

                <p className="text-xl font-semibold text-neutral-50">{incoming.peerName}</p>
                <p className="mt-1 text-sm text-neutral-400">
                    Incoming {incoming.video ? "video" : "audio"} call…
                </p>

                <div className="mt-8 flex items-center justify-center gap-8">
                    <div className="flex flex-col items-center gap-2">
                        <button
                            type="button"
                            onClick={onDecline}
                            aria-label="Decline call"
                            className="grid h-16 w-16 place-content-center rounded-full bg-red-500 text-white shadow-lg shadow-red-500/30 transition hover:bg-red-400"
                        >
                            <PhoneOffIcon className="h-7 w-7" />
                        </button>
                        <span className="text-[11px] uppercase tracking-wider text-neutral-500">Decline</span>
                    </div>
                    <div className="flex flex-col items-center gap-2">
                        <button
                            type="button"
                            onClick={onAccept}
                            aria-label="Accept call"
                            className="grid h-16 w-16 animate-bounce place-content-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400"
                            style={{ animationDuration: "1.6s" }}
                        >
                            <PhoneIcon className="h-7 w-7" />
                        </button>
                        <span className="text-[11px] uppercase tracking-wider text-neutral-500">Accept</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

/* -------------------------------- active -------------------------------- */

type ActiveProps = {
    call: ActiveCall;
    onEnd: () => void;
    onMic: (on: boolean) => void;
    onCam: (on: boolean) => void;
};

export function ActiveCallOverlay({ call, onEnd, onMic, onCam }: ActiveProps) {
    const remoteRef = useVideoStream(call.remoteStream);
    const localRef = useVideoStream(call.localStream);
    const [seconds, setSeconds] = useState(0);

    useEffect(() => {
        if (call.state !== "active") return;
        const id = setInterval(() => setSeconds((value) => value + 1), 1000);
        return () => clearInterval(id);
    }, [call.state, call.peerId]);

    const connected = call.state === "active";
    const status = !connected
        ? call.role === "caller" ? "Ringing…" : "Connecting…"
        : call.remoteStream ? formatDuration(seconds) : "Connecting…";

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-neutral-950" role="dialog" aria-modal="true" aria-label={`Call with ${call.peerName}`}>
            {/* remote media */}
            <div className="relative min-h-0 flex-1 overflow-hidden">
                <video
                    ref={remoteRef}
                    autoPlay
                    playsInline
                    className={`h-full w-full object-cover transition-opacity duration-300 ${call.video ? "opacity-100" : "opacity-0"}`}
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-neutral-950/70 via-transparent to-neutral-950/80" />

                {!call.video && (
                    <div className="absolute inset-0 grid place-content-center">
                        <div className="flex flex-col items-center gap-4">
                            <Avatar id={call.peerId} name={call.peerName} size={128} />
                            <div className="flex items-end gap-1">
                                {[0, 1, 2, 3, 4].map((bar) => (
                                    <span
                                        key={bar}
                                        className="w-1.5 animate-pulse rounded-full bg-emerald-400/80"
                                        style={{
                                            height: `${12 + ((bar * 7) % 20)}px`,
                                            animationDelay: `${bar * 120}ms`,
                                        }}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* top bar */}
                <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-3 p-4 sm:p-6">
                    <div className="flex items-center gap-3">
                        <Avatar id={call.peerId} name={call.peerName} size={40} />
                        <div>
                            <p className="font-semibold text-white drop-shadow">{call.peerName}</p>
                            <p className="text-xs text-neutral-300">
                                {status}
                                {!call.micOn && " · muted"}
                            </p>
                        </div>
                    </div>
                    <span className="rounded-full bg-neutral-900/70 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-neutral-300 backdrop-blur">
                        {call.video ? "Video" : "Audio"}
                    </span>
                </div>

                {/* local preview */}
                {call.video && call.localStream && (
                    <div className="absolute bottom-4 right-4 h-32 w-24 overflow-hidden rounded-2xl border border-white/15 bg-neutral-900 shadow-xl sm:h-40 sm:w-30">
                        <video
                            ref={localRef}
                            autoPlay
                            playsInline
                            muted
                            className="h-full w-full -scale-x-100 object-cover"
                        />
                        {!call.camOn && (
                            <div className="absolute inset-0 grid place-content-center bg-neutral-900/80">
                                <VideoOffIcon className="h-5 w-5 text-neutral-400" />
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* controls */}
            <div className="flex items-center justify-center gap-4 border-t border-neutral-800/60 bg-neutral-950/95 px-4 py-5">
                <button
                    type="button"
                    onClick={() => onMic(!call.micOn)}
                    aria-label={call.micOn ? "Mute microphone" : "Unmute microphone"}
                    className={[
                        "grid h-14 w-14 place-content-center rounded-full transition",
                        call.micOn
                            ? "bg-neutral-800 text-neutral-100 hover:bg-neutral-700"
                            : "bg-white text-neutral-950 hover:bg-neutral-200",
                    ].join(" ")}
                >
                    {call.micOn ? <MicIcon className="h-6 w-6" /> : <MicOffIcon className="h-6 w-6" />}
                </button>

                {call.video && (
                    <button
                        type="button"
                        onClick={() => onCam(!call.camOn)}
                        aria-label={call.camOn ? "Turn camera off" : "Turn camera on"}
                        className={[
                            "grid h-14 w-14 place-content-center rounded-full transition",
                            call.camOn
                                ? "bg-neutral-800 text-neutral-100 hover:bg-neutral-700"
                                : "bg-white text-neutral-950 hover:bg-neutral-200",
                        ].join(" ")}
                    >
                        {call.camOn ? <VideoIcon className="h-6 w-6" /> : <VideoOffIcon className="h-6 w-6" />}
                    </button>
                )}

                <button
                    type="button"
                    onClick={onEnd}
                    aria-label="End call"
                    className="grid h-14 w-16 place-content-center rounded-full bg-red-500 text-white shadow-lg shadow-red-500/30 transition hover:bg-red-400"
                >
                    <PhoneOffIcon className="h-6 w-6" />
                </button>
            </div>
        </div>
    );
}
