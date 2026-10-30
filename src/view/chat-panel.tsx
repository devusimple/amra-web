import { Fragment, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { conversationMessages, db, type CachedUser, type Message } from "../db";
import { fileKind, formatBytes, formatClock, formatDay, isSameDay } from "../lib/format";
import type { ChatPhase, FileTransfer } from "../lib/call-manager";
import { MAX_FILE_BYTES } from "../lib/call-manager";
import { manager } from "../hooks/use-call-manager";
import { Avatar } from "./avatar";
import {
    AlertCircleIcon,
    ArrowLeftIcon,
    CheckCheckIcon,
    CheckIcon,
    ClockIcon,
    DownloadIcon,
    FileIcon,
    FilmIcon,
    ImageIcon,
    MusicIcon,
    PaperclipIcon,
    PhoneIcon,
    RefreshIcon,
    SendIcon,
    VideoIcon,
} from "./icons";

type ChatPanelProps = {
    peer: CachedUser;
    meId: number;
    phase: ChatPhase | undefined;
    transfers: Record<string, FileTransfer>;
    onBack: () => void;
    onCall: (video: boolean) => void;
};

function DeliveryTicks({ status }: { status: Message["status"] }) {
    if (status === "failed") {
        return (
            <span title="Failed">
                <AlertCircleIcon className="h-3 w-3 text-red-200" />
            </span>
        );
    }
    if (status === "pending") {
        return <span title="Sending"><ClockIcon className="h-3 w-3 opacity-60" /></span>;
    }
    if (status === "sent") {
        return <span title="Sent"><CheckIcon className="h-3 w-3 opacity-80" /></span>;
    }
    return <span title="Delivered"><CheckCheckIcon className="h-3 w-3 opacity-80" /></span>;
}

function useObjectUrl(blob: Blob | undefined): string | null {
    // Object URLs are derived from the blob; revoke the previous one when it
    // changes or the bubble unmounts.
    const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
    useEffect(() => {
        if (!url) return;
        return () => URL.revokeObjectURL(url);
    }, [url]);
    return url;
}

function Bubble({ message, mine }: { message: Message; mine: boolean }) {
    return (
        <div className={`flex w-full ${mine ? "justify-end" : "justify-start"}`}>
            <div
                className={[
                    "max-w-[78%] px-3.5 py-2 text-[15px] leading-relaxed shadow-sm whitespace-pre-wrap break-words",
                    mine
                        ? "bg-emerald-600 text-white rounded-2xl rounded-br-md"
                        : "bg-neutral-800 text-neutral-100 rounded-2xl rounded-bl-md",
                ].join(" ")}
            >
                <p>{message.body}</p>
                <div className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${mine ? "text-emerald-100/80" : "text-neutral-400"}`}>
                    <span>{formatClock(message.ts)}</span>
                    {mine && <DeliveryTicks status={message.status} />}
                </div>
            </div>
        </div>
    );
}

function AttachmentBubble({
    message,
    mine,
    transfer,
}: {
    message: Message;
    mine: boolean;
    transfer?: FileTransfer;
}) {
    const file = message.file!;
    const stored = useLiveQuery(() => db.files.get(file.id), [file.id], undefined);
    const url = useObjectUrl(stored?.blob);
    const kind = fileKind(file.type, file.name);
    const Icon = kind === "image" ? ImageIcon : kind === "video" ? FilmIcon : kind === "audio" ? MusicIcon : FileIcon;

    const failed = message.status === "failed" || transfer?.status === "error";
    const error = transfer?.error || message.error;
    const active = transfer?.status === "active";
    const bytes = transfer?.bytes ?? (stored?.blob ? file.size : 0);
    const pct = file.size > 0
        ? Math.min(100, Math.round((bytes / file.size) * 100))
        : stored?.blob ? 100 : 0;

    return (
        <div className={`flex w-full ${mine ? "justify-end" : "justify-start"}`}>
            <div
                className={[
                    "max-w-[85%] overflow-hidden rounded-2xl shadow-sm",
                    mine
                        ? "bg-emerald-600 text-white rounded-br-md"
                        : "bg-neutral-800 text-neutral-100 rounded-bl-md",
                ].join(" ")}
            >
                {url && kind === "image" && (
                    <div className="bg-black/20">
                        <img src={url} alt={file.name} className="max-h-72 w-full object-contain" />
                    </div>
                )}

                {url && kind === "video" && (
                    <video src={url} controls playsInline className="max-h-72 w-full bg-black" />
                )}

                {url && kind === "audio" && (
                    <div className="px-3 pt-3">
                        <audio src={url} controls className="w-full min-w-56" />
                    </div>
                )}

                <div className="px-3 py-2">
                    <div className="flex items-center gap-2.5">
                        {(!url || kind === "file") && (
                            <span className={`grid h-9 w-9 shrink-0 place-content-center rounded-lg ${mine ? "bg-black/20" : "bg-neutral-700/70"}`}>
                                <Icon className="h-4.5 w-4.5 opacity-90" />
                            </span>
                        )}
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{file.name || "File"}</p>
                            <p className={`truncate text-[11px] ${failed ? "text-red-200" : mine ? "text-emerald-100/80" : "text-neutral-400"}`}>
                                {formatBytes(file.size)}
                                {failed
                                    ? ` · ${error || "Transfer failed"}`
                                    : !stored?.blob
                                        ? " · Waiting for file…"
                                        : ""}
                            </p>
                        </div>
                        {url && (
                            <a
                                href={url}
                                download={file.name}
                                aria-label={`Download ${file.name}`}
                                title="Download"
                                className={`grid h-8 w-8 shrink-0 place-content-center rounded-lg transition ${mine ? "text-white/90 hover:bg-black/20" : "text-neutral-300 hover:bg-neutral-700 hover:text-neutral-100"}`}
                            >
                                <DownloadIcon className="h-4 w-4" />
                            </a>
                        )}
                    </div>

                    {active && (
                        <div className="mt-2">
                            <div className={`h-1.5 w-full overflow-hidden rounded-full ${mine ? "bg-black/20" : "bg-black/30"}`}>
                                <div
                                    className={`h-full rounded-full transition-[width] duration-150 ${mine ? "bg-white/85" : "bg-emerald-400"}`}
                                    style={{ width: `${pct}%` }}
                                />
                            </div>
                            <p className={`mt-1 text-[10px] ${mine ? "text-emerald-100/80" : "text-neutral-400"}`}>
                                {pct}% · {formatBytes(bytes)} of {formatBytes(file.size)}
                            </p>
                        </div>
                    )}

                    <div className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${mine ? "text-emerald-100/80" : "text-neutral-400"}`}>
                        <span>{formatClock(message.ts)}</span>
                        {mine && <DeliveryTicks status={message.status} />}
                    </div>
                </div>
            </div>
        </div>
    );
}

export function ChatPanel({ peer, meId, phase, transfers, onBack, onCall }: ChatPanelProps) {
    const messages = useLiveQuery(() => conversationMessages(peer.id), [peer.id], []);
    const [draft, setDraft] = useState("");
    const [sending, setSending] = useState(false);
    const [attaching, setAttaching] = useState(false);
    const listRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const lastId = messages.length ? messages[messages.length - 1].id : null;

    // Keep the newest message in view.
    useEffect(() => {
        const el = listRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [lastId, peer.id]);

    // Try to bring the peer's data channel up as soon as the chat opens.
    useEffect(() => {
        void manager.openChat(peer.id);
    }, [peer.id]);

    const online = phase === "open";

    const submit = async () => {
        const text = draft.trim();
        if (!text || sending) return;
        setSending(true);
        setDraft("");
        try {
            await manager.send(peer.id, text);
        } catch (err) {
            console.error("[amra] could not save the message", err);
            setDraft(text);
        } finally {
            setSending(false);
        }
    };

    const attach = async (event: ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files ?? []);
        event.target.value = "";
        if (!files.length) return;
        setAttaching(true);
        try {
            for (const file of files) {
                await manager.sendFile(peer.id, file);
            }
        } catch (err) {
            console.error("[amra] could not attach the file", err);
        } finally {
            setAttaching(false);
        }
    };

    return (
        <div className="flex h-full min-h-0 flex-col">
            {/* header */}
            <header className="flex items-center gap-3 border-b border-neutral-800 bg-neutral-900/80 px-3 py-2.5 backdrop-blur sm:px-4">
                <button
                    type="button"
                    onClick={onBack}
                    aria-label="Back to conversations"
                    className="grid h-9 w-9 place-content-center rounded-full text-neutral-300 hover:bg-neutral-800 md:hidden"
                >
                    <ArrowLeftIcon className="h-5 w-5" />
                </button>

                <Avatar id={peer.id} name={peer.display_name} src={peer.avatar_url} size={40} />

                <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-neutral-100">
                        {peer.display_name || `User ${peer.id}`}
                    </p>
                    <p className="flex items-center gap-1.5 text-xs">
                        <span
                            className={`h-1.5 w-1.5 rounded-full ${online ? "bg-emerald-400" : phase === "connecting" ? "bg-amber-400 animate-pulse" : "bg-neutral-500"}`}
                        />
                        <span className={online ? "text-emerald-400" : "text-neutral-400"}>
                            {online ? "Connected" : phase === "connecting" ? "Connecting…" : "Offline"}
                        </span>
                    </p>
                </div>

                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        onClick={() => onCall(false)}
                        title="Audio call"
                        aria-label="Start audio call"
                        className="grid h-10 w-10 place-content-center rounded-full text-neutral-200 transition hover:bg-neutral-800 hover:text-emerald-400"
                    >
                        <PhoneIcon className="h-5 w-5" />
                    </button>
                    <button
                        type="button"
                        onClick={() => onCall(true)}
                        title="Video call"
                        aria-label="Start video call"
                        className="grid h-10 w-10 place-content-center rounded-full text-neutral-200 transition hover:bg-neutral-800 hover:text-emerald-400"
                    >
                        <VideoIcon className="h-5 w-5" />
                    </button>
                </div>
            </header>

            {!online && (
                <div className="flex items-center justify-between gap-3 border-b border-amber-500/20 bg-amber-500/10 px-4 py-1.5 text-xs text-amber-200">
                    <span>
                        {phase === "connecting"
                            ? "Connecting to the peer — messages are queued and send automatically."
                            : "Peer is offline. Messages are saved and delivered once they come online."}
                    </span>
                    <button
                        type="button"
                        onClick={() => void manager.retryChat(peer.id)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 font-medium text-amber-100 hover:bg-amber-500/20"
                    >
                        <RefreshIcon className="h-3.5 w-3.5" />
                        Retry
                    </button>
                </div>
            )}

            {/* messages */}
            <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5">
                {messages.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                        <Avatar id={peer.id} name={peer.display_name} src={peer.avatar_url} size={72} />
                        <div>
                            <p className="font-semibold text-neutral-100">{peer.display_name || `User ${peer.id}`}</p>
                            <p className="mt-1 max-w-xs text-sm text-neutral-400">
                                {peer.bio?.trim() || "No messages yet — say hi to start the conversation."}
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col gap-1.5">
                        {messages.map((message, index) => {
                            const previous = messages[index - 1];
                            const showDay = !previous || !isSameDay(previous.ts, message.ts);
                            const mine = message.dir === "out" && message.from === meId;
                            return (
                                <Fragment key={message.id}>
                                    {showDay && (
                                        <div className="my-2 flex justify-center">
                                            <span className="rounded-full bg-neutral-800/80 px-3 py-1 text-[11px] font-medium text-neutral-400">
                                                {formatDay(message.ts)}
                                            </span>
                                        </div>
                                    )}
                                    {message.file
                                        ? <AttachmentBubble message={message} mine={mine} transfer={transfers[message.id]} />
                                        : <Bubble message={message} mine={mine} />}
                                </Fragment>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* composer */}
            <form
                className="flex items-center gap-1.5 border-t border-neutral-800 bg-neutral-900/80 p-2.5 sm:p-3"
                onSubmit={(event) => {
                    event.preventDefault();
                    void submit();
                }}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(event) => void attach(event)}
                />
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={attaching}
                    aria-label="Attach files"
                    title={`Attach files (up to ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB)`}
                    className={`grid h-11 w-11 shrink-0 place-content-center rounded-full text-neutral-300 transition hover:bg-neutral-800 hover:text-emerald-400 disabled:cursor-wait disabled:opacity-50 ${attaching ? "animate-pulse" : ""}`}
                >
                    <PaperclipIcon className="h-5 w-5" />
                </button>
                <input
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder={`Message ${peer.display_name || `User ${peer.id}`}…`}
                    className="min-w-0 flex-1 rounded-full border border-neutral-700 bg-neutral-800 px-4 py-2.5 text-[15px] text-neutral-100 placeholder:text-neutral-500 outline-none transition focus:border-emerald-500/70 focus:ring-2 focus:ring-emerald-500/20"
                    autoComplete="off"
                />
                <button
                    type="submit"
                    disabled={!draft.trim()}
                    aria-label="Send message"
                    className="grid h-11 w-11 shrink-0 place-content-center rounded-full bg-emerald-600 text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-500"
                >
                    <SendIcon className="h-5 w-5" />
                </button>
            </form>
        </div>
    );
}
