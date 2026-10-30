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

/** Call timer, "mm:ss" / "h:mm:ss". */
export function formatDuration(seconds: number): string {
    const s = Math.max(0, Math.floor(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}
