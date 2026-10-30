import { useEffect, useState } from "react";
import { apiErrorMessage } from "../api/client";
import type { Profile } from "../hooks/use-auth";
import { Avatar } from "./avatar";
import { XIcon } from "./icons";

type ProfileDialogProps = {
    onClose: () => void;
    userId: number;
    email: string;
    createdAt?: string;
    profile: Profile | null;
    fallbackName: string;
    onSave: (patch: { display_name?: string; bio?: string; avatar_url?: string | null }) => Promise<void>;
};

export function ProfileDialog({
    onClose,
    userId,
    email,
    createdAt,
    profile,
    fallbackName,
    onSave,
}: ProfileDialogProps) {
    const [name, setName] = useState(profile?.display_name ?? "");
    const [bio, setBio] = useState(profile?.bio ?? "");
    const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? "");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    const previewName = name.trim() || fallbackName;

    const save = async () => {
        const trimmedName = name.trim();
        const trimmedBio = bio.trim();
        const trimmedAvatar = avatarUrl.trim();

        if (!trimmedName) {
            setError("Display name is required");
            return;
        }
        if (trimmedName.length > 50) {
            setError("Display name must be 50 characters or fewer");
            return;
        }
        if (trimmedBio.length > 500) {
            setError("Bio must be 500 characters or fewer");
            return;
        }
        if (trimmedAvatar && !/^https?:\/\//i.test(trimmedAvatar)) {
            setError("Avatar URL must start with http:// or https://");
            return;
        }

        setSaving(true);
        setError(null);
        try {
            await onSave({
                display_name: trimmedName,
                bio: trimmedBio,
                avatar_url: trimmedAvatar || null,
            });
            onClose();
        } catch (err) {
            setError(apiErrorMessage(err, "Could not save your profile"));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-40 grid place-content-center overflow-y-auto bg-neutral-950/70 p-4 backdrop-blur-sm"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="profile-dialog-title"
                className="w-[min(94vw,460px)] rounded-2xl border border-neutral-800 bg-neutral-900 p-5 shadow-2xl"
            >
                <div className="mb-5 flex items-start justify-between">
                    <div>
                        <h2 id="profile-dialog-title" className="text-lg font-semibold text-neutral-50">Your profile</h2>
                        <p className="text-sm text-neutral-400">Visible to everyone on amra.</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="grid h-9 w-9 place-content-center rounded-lg text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-100"
                    >
                        <XIcon className="h-5 w-5" />
                    </button>
                </div>

                <div className="mb-5 flex items-center gap-3">
                    <Avatar id={userId} name={previewName} src={avatarUrl.trim() || null} size={56} />
                    <div className="min-w-0 text-sm">
                        <p className="truncate font-medium text-neutral-100">{previewName}</p>
                        <p className="truncate text-neutral-500">{email}</p>
                        {createdAt && (
                            <p className="text-xs text-neutral-600">Member since {createdAt.slice(0, 10)}</p>
                        )}
                    </div>
                </div>

                <div className="flex flex-col gap-3">
                    <label className="flex flex-col gap-1 text-sm">
                        <span className="text-neutral-300">Display name</span>
                        <input
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            maxLength={50}
                            className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-neutral-100 outline-none focus:border-emerald-500/70 focus:ring-2 focus:ring-emerald-500/20"
                            placeholder="How should people see you?"
                        />
                    </label>

                    <label className="flex flex-col gap-1 text-sm">
                        <span className="flex items-center justify-between text-neutral-300">
                            Bio
                            <span className="text-xs text-neutral-500">{bio.length}/500</span>
                        </span>
                        <textarea
                            value={bio}
                            onChange={(event) => setBio(event.target.value)}
                            maxLength={500}
                            rows={3}
                            className="resize-none rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-neutral-100 outline-none focus:border-emerald-500/70 focus:ring-2 focus:ring-emerald-500/20"
                            placeholder="A short line about you"
                        />
                    </label>

                    <label className="flex flex-col gap-1 text-sm">
                        <span className="text-neutral-300">Avatar URL</span>
                        <input
                            value={avatarUrl}
                            onChange={(event) => setAvatarUrl(event.target.value)}
                            className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-neutral-100 outline-none focus:border-emerald-500/70 focus:ring-2 focus:ring-emerald-500/20"
                            placeholder="https://… (optional)"
                            inputMode="url"
                        />
                    </label>
                </div>

                {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

                <div className="mt-5 flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-300 transition hover:bg-neutral-800"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={() => void save()}
                        disabled={saving}
                        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-800"
                    >
                        {saving ? "Saving…" : "Save changes"}
                    </button>
                </div>
            </div>
        </div>
    );
}
