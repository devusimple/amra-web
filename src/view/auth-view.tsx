import { useState, type FormEvent } from "react";
import { apiErrorMessage } from "../api/client";
import { useAuth } from "../hooks/use-auth";
import { PhoneIcon, VideoIcon } from "./icons";

export function AuthView() {
    const { signin, signup } = useAuth();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [name, setName] = useState("");
    const [type, setType] = useState<"signin" | "signup">("signin");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const switchType = (next: "signin" | "signup") => {
        setType(next);
        setError(null);
        setPassword("");
    };

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const mail = email.trim();

        if (!mail || !password) {
            setError("Email and password are required");
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
            setError("Enter a valid email address");
            return;
        }
        if (type === "signup" && password.length < 8) {
            setError("Password must be at least 8 characters");
            return;
        }

        setError(null);
        setLoading(true);
        try {
            if (type === "signin") await signin(mail, password);
            else await signup(mail, password, name);
        } catch (err) {
            setError(apiErrorMessage(err, "Something went wrong, please try again"));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="relative grid min-h-dvh place-content-center overflow-hidden bg-neutral-950 px-4 py-10 text-neutral-100">
            {/* ambient background */}
            <div className="pointer-events-none absolute -left-40 -top-40 h-96 w-96 rounded-full bg-emerald-500/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-cyan-500/20 blur-3xl" />

            <div className="relative w-[min(94vw,420px)]">
                <div className="mb-6 flex items-center gap-3">
                    <span className="grid h-11 w-11 place-content-center rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-500 text-xl font-black text-neutral-950 shadow-lg shadow-emerald-500/25">
                        a
                    </span>
                    <div>
                        <p className="text-2xl font-bold tracking-tight">amra</p>
                        <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">peer to peer</p>
                    </div>
                </div>

                <div className="rounded-3xl border border-neutral-800 bg-neutral-900/80 p-6 shadow-2xl backdrop-blur">
                    <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-neutral-800/70 p-1">
                        <button
                            type="button"
                            onClick={() => switchType("signin")}
                            className={`rounded-lg py-2 text-sm font-semibold transition ${type === "signin" ? "bg-emerald-600 text-white shadow" : "text-neutral-400 hover:text-neutral-200"}`}
                        >
                            Sign in
                        </button>
                        <button
                            type="button"
                            onClick={() => switchType("signup")}
                            className={`rounded-lg py-2 text-sm font-semibold transition ${type === "signup" ? "bg-emerald-600 text-white shadow" : "text-neutral-400 hover:text-neutral-200"}`}
                        >
                            Create account
                        </button>
                    </div>

                    <div className="mb-5">
                        <h1 className="text-xl font-semibold">
                            {type === "signin" ? "Welcome back" : "Join amra"}
                        </h1>
                        <p className="mt-1 text-sm text-neutral-400">
                            {type === "signin"
                                ? "Sign in to chat and call your people."
                                : "Create an account to start chatting directly, peer to peer."}
                        </p>
                    </div>

                    <form className="flex flex-col gap-3.5" onSubmit={submit}>
                        {type === "signup" && (
                            <label className="flex flex-col gap-1.5 text-sm">
                                <span className="text-neutral-300">Display name</span>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(event) => setName(event.target.value)}
                                    maxLength={50}
                                    autoComplete="name"
                                    placeholder="Your name (optional)"
                                    className="rounded-xl border border-neutral-700 bg-neutral-800/80 px-3.5 py-2.5 text-neutral-100 placeholder:text-neutral-500 outline-none transition focus:border-emerald-500/70 focus:ring-2 focus:ring-emerald-500/20"
                                />
                            </label>
                        )}

                        <label className="flex flex-col gap-1.5 text-sm">
                            <span className="text-neutral-300">Email</span>
                            <input
                                type="email"
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                autoComplete="email"
                                placeholder="you@example.com"
                                className="rounded-xl border border-neutral-700 bg-neutral-800/80 px-3.5 py-2.5 text-neutral-100 placeholder:text-neutral-500 outline-none transition focus:border-emerald-500/70 focus:ring-2 focus:ring-emerald-500/20"
                            />
                        </label>

                        <label className="flex flex-col gap-1.5 text-sm">
                            <span className="flex items-center justify-between text-neutral-300">
                                Password
                                {type === "signup" && (
                                    <span className="text-xs font-normal text-neutral-500">8+ characters</span>
                                )}
                            </span>
                            <input
                                type="password"
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                autoComplete={type === "signin" ? "current-password" : "new-password"}
                                placeholder="••••••••"
                                className="rounded-xl border border-neutral-700 bg-neutral-800/80 px-3.5 py-2.5 text-neutral-100 placeholder:text-neutral-500 outline-none transition focus:border-emerald-500/70 focus:ring-2 focus:ring-emerald-500/20"
                            />
                        </label>

                        {error && (
                            <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                                {error}
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="mt-1 grid h-11 place-content-center rounded-xl bg-emerald-600 font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-800"
                        >
                            {loading ? (
                                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                            ) : (
                                type === "signin" ? "Sign in" : "Create account"
                            )}
                        </button>
                    </form>
                </div>

                <div className="mt-5 flex items-center justify-center gap-4 text-xs text-neutral-500">
                    <span className="inline-flex items-center gap-1.5">
                        <PhoneIcon className="h-3.5 w-3.5" /> Audio calls
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                        <VideoIcon className="h-3.5 w-3.5" /> Video calls
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> WebRTC
                    </span>
                </div>
            </div>
        </div>
    );
}
