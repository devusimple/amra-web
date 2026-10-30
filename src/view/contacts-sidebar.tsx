import { useMemo, useState } from "react";
import type { CachedUser, Message } from "../db";
import type { ChatPhase } from "../lib/call-manager";
import { formatRelative, filePreview } from "../lib/format";
import { Avatar } from "./avatar";
import { LogOutIcon, PencilIcon, SearchIcon } from "./icons";

type ContactsSidebarProps = {
    users: CachedUser[];
    me: CachedUser | null;
    profileName: string;
    avatarUrl: string | null;
    selectedId: number | null;
    lastMessages: Record<number, Message>;
    phases: Record<number, ChatPhase>;
    loading: boolean;
    onSelect: (user: CachedUser) => void;
    onEditProfile: () => void;
    onSignout: () => void;
};

export function ContactsSidebar({
    users,
    me,
    profileName,
    avatarUrl,
    selectedId,
    lastMessages,
    phases,
    loading,
    onSelect,
    onEditProfile,
    onSignout,
}: ContactsSidebarProps) {
    const [query, setQuery] = useState("");

    const contacts = useMemo(() => {
        const meId = me?.id;
        const needle = query.trim().toLowerCase();
        return users
            .filter((user) => user.id !== meId)
            .filter((user) => {
                if (!needle) return true;
                const name = (user.display_name || "").toLowerCase();
                const bio = (user.bio || "").toLowerCase();
                return name.includes(needle) || bio.includes(needle);
            })
            .sort((a, b) => {
                const at = lastMessages[a.id]?.ts ?? 0;
                const bt = lastMessages[b.id]?.ts ?? 0;
                if (at !== bt) return bt - at;
                return (a.display_name || "").localeCompare(b.display_name || "");
            });
    }, [users, me?.id, query, lastMessages]);

    return (
        <div className="flex h-full min-h-0 flex-col">
            {/* brand */}
            <div className="flex items-center gap-2.5 px-4 pb-3 pt-4">
                <span className="grid h-9 w-9 place-content-center rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 text-lg font-black text-neutral-950 shadow-lg shadow-emerald-500/20">
                    a
                </span>
                <div className="leading-tight">
                    <p className="text-lg font-bold tracking-tight text-neutral-100">amra</p>
                    <p className="text-[11px] uppercase tracking-widest text-neutral-500">peer to peer</p>
                </div>
            </div>

            <div className="px-3 pb-2">
                <div className="relative">
                    <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
                    <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search people"
                        aria-label="Search people"
                        className="w-full rounded-lg border border-neutral-800 bg-neutral-800/60 py-2 pl-9 pr-3 text-sm text-neutral-200 placeholder:text-neutral-500 outline-none transition focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20"
                    />
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
                {loading && contacts.length === 0 && (
                    <p className="px-3 py-6 text-center text-sm text-neutral-500">Loading people…</p>
                )}

                {!loading && contacts.length === 0 && (
                    <p className="px-3 py-6 text-center text-sm text-neutral-500">
                        {query ? "Nobody matches that search." : "No other users yet."}
                    </p>
                )}

                <ul className="flex flex-col gap-0.5">
                    {contacts.map((user) => {
                        const last = lastMessages[user.id];
                        const selected = selectedId === user.id;
                        const online = phases[user.id] === "open";
                        const preview = last
                            ? `${last.dir === "out" ? "You: " : ""}${last.file ? filePreview(last.file) : last.body}`
                            : user.bio?.trim() || "Start a conversation";

                        return (
                            <li key={user.id}>
                                <button
                                    type="button"
                                    onClick={() => onSelect(user)}
                                    className={[
                                        "flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition",
                                        selected
                                            ? "bg-emerald-500/15 ring-1 ring-inset ring-emerald-500/30"
                                            : "hover:bg-neutral-800/70",
                                    ].join(" ")}
                                >
                                    <span className="relative">
                                        <Avatar id={user.id} name={user.display_name} src={user.avatar_url} size={44} />
                                        {online && (
                                            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-neutral-900 bg-emerald-400" />
                                        )}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="flex items-baseline justify-between gap-2">
                                            <span className={`truncate text-[15px] font-medium ${selected ? "text-emerald-100" : "text-neutral-100"}`}>
                                                {user.display_name || `User ${user.id}`}
                                            </span>
                                            {last && (
                                                <span className="shrink-0 text-[10px] text-neutral-500">
                                                    {formatRelative(last.ts)}
                                                </span>
                                            )}
                                        </span>
                                        <span className="mt-0.5 block truncate text-xs text-neutral-400">
                                            {preview}
                                        </span>
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </div>

            {/* me */}
            <div className="border-t border-neutral-800 p-2.5">
                <div className="flex items-center gap-2.5 rounded-xl bg-neutral-800/50 p-2">
                    <Avatar id={me?.id ?? 0} name={profileName} src={avatarUrl} size={36} />
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-neutral-100">{profileName}</p>
                        <p className="truncate text-[11px] text-neutral-500">
                            {me?.id ? `User #${me.id}` : "Signed in"}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onEditProfile}
                        title="Edit profile"
                        aria-label="Edit profile"
                        className="grid h-8 w-8 place-content-center rounded-lg text-neutral-400 transition hover:bg-neutral-700 hover:text-neutral-100"
                    >
                        <PencilIcon className="h-4 w-4" />
                    </button>
                    <button
                        type="button"
                        onClick={onSignout}
                        title="Sign out"
                        aria-label="Sign out"
                        className="grid h-8 w-8 place-content-center rounded-lg text-neutral-400 transition hover:bg-red-500/15 hover:text-red-400"
                    >
                        <LogOutIcon className="h-4 w-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}
