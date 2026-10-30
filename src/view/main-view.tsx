import { useCallback, useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { apiErrorMessage, client } from "../api/client";
import { db, lastMessagesByPeer, type CachedUser, type Message } from "../db";
import { useAuth } from "../hooks/use-auth";
import { displayNameOf } from "../lib/display-name";
import { manager, useCallManager } from "../hooks/use-call-manager";
import { ActiveCallOverlay, IncomingCallOverlay } from "./call-overlay";
import { ChatPanel } from "./chat-panel";
import { ContactsSidebar } from "./contacts-sidebar";
import { ProfileDialog } from "./profile-dialog";
import { PhoneIcon, VideoIcon } from "./icons";

function toCachedUser(row: {
    id?: number;
    display_name?: string;
    bio?: string;
    avatar_url?: string | null;
    created_at?: string;
}): CachedUser | null {
    if (typeof row.id !== "number") return null;
    return {
        id: row.id,
        display_name: row.display_name?.trim() || `User ${row.id}`,
        bio: row.bio ?? "",
        avatar_url: row.avatar_url ?? null,
        created_at: row.created_at,
    };
}

const EMPTY_USERS: CachedUser[] = [];
const EMPTY_LAST_MESSAGES: Record<number, Message> = {};

function EmptyState() {
    return (
        <div className="grid h-full place-content-center px-6 text-center">
            <div className="mx-auto mb-6 grid h-24 w-24 place-content-center rounded-[2rem] bg-gradient-to-br from-emerald-400/20 to-cyan-500/10 ring-1 ring-inset ring-emerald-400/20">
                <span className="bg-gradient-to-br from-emerald-300 to-cyan-400 bg-clip-text text-4xl font-black text-transparent">
                    amra
                </span>
            </div>
            <h1 className="text-2xl font-semibold text-neutral-100">Pick a conversation</h1>
            <p className="mx-auto mt-2 max-w-sm text-sm text-neutral-400">
                Chat directly over a peer-to-peer data channel, then jump into an audio or
                video call whenever you like. Messages never touch a server.
            </p>
            <div className="mt-6 flex items-center justify-center gap-3 text-xs text-neutral-500">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-800 px-3 py-1">
                    <PhoneIcon className="h-3.5 w-3.5 text-emerald-400" /> Audio
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-800 px-3 py-1">
                    <VideoIcon className="h-3.5 w-3.5 text-emerald-400" /> Video
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-800 px-3 py-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> P2P
                </span>
            </div>
        </div>
    );
}

export default function MainView() {
    const { session, profile, signout, updateProfile } = useAuth();
    const meId = session?.user.id ?? null;
    const snapshot = useCallManager(meId);

    const [loadingUsers, setLoadingUsers] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [selectedUser, setSelectedUser] = useState<CachedUser | null>(null);
    const [profileOpen, setProfileOpen] = useState(false);

    const cachedUsers = useLiveQuery(() => db.users.toArray(), [], EMPTY_USERS);
    const users = cachedUsers ?? EMPTY_USERS;
    const lastMessages = useLiveQuery(() => lastMessagesByPeer(), [], EMPTY_LAST_MESSAGES);

    const loadUsers = useCallback(async () => {
        try {
            const { data, error } = await client.GET("/api/users");
            if (error) {
                setLoadError(apiErrorMessage(error, "Could not load people"));
                return;
            }
            const rows = (data?.data ?? [])
                .map(toCachedUser)
                .filter((row): row is CachedUser => row !== null);

            setLoadError(null);
            if (rows.length) {
                await db.users.bulkPut(rows);
                const ids = rows.map((row) => row.id);
                const stale = await db.users.where("id").noneOf(ids).primaryKeys();
                if (stale.length) await db.users.bulkDelete(stale);
            } else {
                await db.users.clear();
            }
        } catch (err) {
            setLoadError(apiErrorMessage(err, "Could not load people"));
        }
    }, []);

    // Fetch on mount, then refresh quietly so newly registered people show up.
    useEffect(() => {
        let active = true;
        const run = async () => {
            try {
                await loadUsers();
            } finally {
                if (active) setLoadingUsers(false);
            }
        };
        void run();
        const id = setInterval(() => void run(), 30_000);
        return () => {
            active = false;
            clearInterval(id);
        };
    }, [loadUsers]);

    const me = useMemo<CachedUser | null>(() => {
        if (meId === null) return null;
        return {
            id: meId,
            display_name: displayNameOf(profile, session),
            bio: profile?.bio ?? "",
            avatar_url: profile?.avatar_url ?? null,
            created_at: session?.user.created_at,
        };
    }, [meId, profile, session]);

    // Keep the open conversation fresh when the cached row is refreshed.
    const selected = useMemo(() => {
        if (!selectedUser) return null;
        return users.find((user) => user.id === selectedUser.id) ?? selectedUser;
    }, [users, selectedUser]);

    const startCall = useCallback((video: boolean) => {
        if (!selected) return;
        void manager.startCall(
            selected.id,
            selected.display_name || `User ${selected.id}`,
            video,
        );
    }, [selected]);

    const handleSignout = () => {
        manager.stop();
        setSelectedUser(null);
        signout();
    };

    return (
        <div className="h-dvh w-full bg-neutral-950 text-neutral-100 md:p-4">
            <div className="mx-auto flex h-full w-full max-w-7xl overflow-hidden border-neutral-800 bg-neutral-900 md:rounded-2xl md:border md:shadow-2xl">
                {/* conversations */}
                <aside
                    className={[
                        "h-full w-full shrink-0 flex-col border-neutral-800 bg-neutral-900 md:flex md:w-80 md:border-r",
                        selected ? "hidden" : "flex",
                    ].join(" ")}
                >
                    <ContactsSidebar
                        users={users}
                        me={me}
                        profileName={me?.display_name ?? "You"}
                        avatarUrl={me?.avatar_url ?? null}
                        selectedId={selected?.id ?? null}
                        lastMessages={lastMessages}
                        phases={snapshot.chat}
                        loading={loadingUsers}
                        onSelect={setSelectedUser}
                        onEditProfile={() => setProfileOpen(true)}
                        onSignout={handleSignout}
                    />
                </aside>

                {/* conversation */}
                <main className={`h-full min-w-0 flex-1 ${selected ? "flex" : "hidden md:flex"}`}>
                    {selected ? (
                        <div className="h-full w-full">
                            <ChatPanel
                                key={selected.id}
                                peer={selected}
                                meId={meId ?? 0}
                                phase={snapshot.chat[selected.id]}
                                onBack={() => setSelectedUser(null)}
                                onCall={startCall}
                            />
                        </div>
                    ) : (
                        <EmptyState />
                    )}
                </main>
            </div>

            {loadError && (
                <div className="fixed bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-lg border border-red-500/30 bg-red-500/15 px-4 py-2 text-sm text-red-200 backdrop-blur">
                    {loadError}
                </div>
            )}

            {snapshot.incoming && (
                <IncomingCallOverlay
                    incoming={snapshot.incoming}
                    onAccept={() => void manager.acceptIncoming()}
                    onDecline={() => manager.declineIncoming()}
                />
            )}

            {snapshot.call && (
                <ActiveCallOverlay
                    key={snapshot.call.peerId}
                    call={snapshot.call}
                    onEnd={() => manager.endCall()}
                    onMic={(on) => manager.setMic(on)}
                    onCam={(on) => manager.setCam(on)}
                />
            )}

            {snapshot.toast && (
                <div role="status" aria-live="polite" className="pointer-events-none fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full border border-neutral-700 bg-neutral-800/95 px-5 py-2 text-sm font-medium text-neutral-100 shadow-xl backdrop-blur">
                    {snapshot.toast}
                </div>
            )}

            {profileOpen && (
                <ProfileDialog
                    onClose={() => setProfileOpen(false)}
                    userId={meId ?? 0}
                    email={session?.user.email ?? ""}
                    createdAt={session?.user.created_at}
                    profile={profile}
                    fallbackName={me?.display_name ?? "You"}
                    onSave={async (patch) => {
                        await updateProfile(patch);
                        await loadUsers();
                    }}
                />
            )}
        </div>
    );
}
