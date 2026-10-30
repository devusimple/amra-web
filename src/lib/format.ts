export function formatClock(ts: number): string {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function isSameDay(a: number, b: number): boolean {
    const da = new Date(a);
    const db = new Date(b);
    return da.getFullYear() === db.getFullYear()
        && da.getMonth() === db.getMonth()
        && da.getDate() === db.getDate();
}

export function formatDay(ts: number): string {
    const now = Date.now();
    if (isSameDay(ts, now)) return "Today";
    if (isSameDay(ts, now - 86_400_000)) return "Yesterday";
    return new Date(ts).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

/** Compact timestamp for the conversation list ("2m", "3h", "Mon"). */
export function formatRelative(ts: number): string {
    const diff = Date.now() - ts;
    if (diff < 60_000) return "now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
    if (isSameDay(ts, Date.now())) return `${Math.floor(diff / 3_600_000)}h`;
    if (isSameDay(ts, Date.now() - 86_400_000)) return "Yesterday";
    return new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });
}

/** Human readable byte size ("820 B", "1.4 MB"). */
export function formatBytes(bytes: number): string {
    const value = Math.max(0, bytes);
    if (value < 1024) return `${Math.round(value)} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let size = value / 1024;
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) {
        size /= 1024;
        unit += 1;
    }
    const digits = size >= 100 ? 0 : size >= 10 ? 1 : 2;
    return `${size.toFixed(digits).replace(/\.?0+$/, "")} ${units[unit]}`;
}

export type FileKind = "image" | "video" | "audio" | "file";

/** Classify an attachment by MIME type, falling back to its extension. */
export function fileKind(type: string | undefined, name = ""): FileKind {
    const mime = (type || "").toLowerCase();
    if (mime.startsWith("image/")) return "image";
    if (mime.startsWith("video/")) return "video";
    if (mime.startsWith("audio/")) return "audio";
    const ext = name.toLowerCase().split(".").pop() ?? "";
    if (["png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "bmp", "heic"].includes(ext)) return "image";
    if (["mp4", "webm", "mov", "m4v", "ogv", "mkv"].includes(ext)) return "video";
    if (["mp3", "wav", "ogg", "m4a", "aac", "flac", "opus"].includes(ext)) return "audio";
    return "file";
}

/** One-line label for an attachment, used in conversation previews. */
export function filePreview(file: { name: string; type: string }): string {
    switch (fileKind(file.type, file.name)) {
        case "image":
            return "📷 Photo";
        case "video":
            return "🎬 Video";
        case "audio":
            return "🎵 Audio";
        default:
            return `📎 ${file.name || "File"}`;
    }
}

/** Call timer, "mm:ss" / "h:mm:ss". */
export function formatDuration(seconds: number): string {
    const s = Math.max(0, Math.floor(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}
