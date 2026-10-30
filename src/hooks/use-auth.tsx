/* oxlint-disable react/only-export-components -- context provider + its hook live together */
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";
import { apiErrorMessage, client } from "../api/client";
import type { components } from "../api/schema";
import {
    clearSession,
    readSession,
    UNAUTHORIZED_EVENT,
    writeSession,
    type Session,
} from "../api/session";

export type Profile = components["schemas"]["Profile"];
export type ProfileUpdate = components["schemas"]["ProfileUpdate"];

export type AuthContextValue = {
    /** Signed-in session (token + user), or null on the auth screen. */
    session: Session | null;
    /** Profile of the signed-in user, when loaded. */
    profile: Profile | null;
    /** True while the stored session is being validated on boot. */
    loading: boolean;
    signin: (email: string, password: string) => Promise<void>;
    signup: (email: string, password: string, name: string) => Promise<void>;
    signout: () => void;
    updateProfile: (patch: ProfileUpdate) => Promise<Profile>;
    refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function AuthProvider({ children }: { children: ReactNode }) {
    const [session, setSession] = useState<Session | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);

    const loadMe = useCallback(async () => {
        const { data, error, response } = await client.GET("/api/users/me");
        if (error) {
            if (response.status === 401 || response.status === 404) {
                clearSession();
                setSession(null);
                setProfile(null);
            }
            throw new Error(apiErrorMessage(error, "Could not load your profile"));
        }
        if (data?.profile) setProfile(data.profile);
        else setProfile(null);

        // Keep the cached user object in sync with the server.
        setSession((current) => {
            if (!current) return current;
            const next: Session = { ...current, user: { ...current.user, ...data?.user } };
            writeSession(next);
            return next;
        });

        return response.status;
    }, []);

    // Validate the stored token once on boot.
    useEffect(() => {
        let cancelled = false;

        const boot = async () => {
            const stored = readSession();
            if (!stored) {
                setLoading(false);
                return;
            }

            try {
                await loadMe();
                if (!cancelled) setSession(stored);
            } catch {
                // Offline or server hiccup: keep the cached session so the app
                // still works with locally stored messages. A real 401 has
                // already been handled by the client response middleware and
                // clears the session + fires UNAUTHORIZED_EVENT.
                if (!cancelled && readSession()) setSession(readSession());
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        void boot();
        return () => {
            cancelled = true;
        };
    }, [loadMe]);

    // The API rejected our token → return to the auth screen.
    useEffect(() => {
        const onUnauthorized = () => {
            setSession(null);
            setProfile(null);
        };
        window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
        return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    }, []);

    const adoptSession = useCallback(async (data: Session) => {
        writeSession(data);
        setSession(data);
        try {
            await loadMe();
        } catch {
            // Profile is cosmetic here — the signed-in state is still valid.
        }
    }, [loadMe]);

    const signin = useCallback(async (email: string, password: string) => {
        const { data, error } = await client.POST("/api/auth/login", {
            body: { email: email.trim(), password },
        });
        if (error || !data) {
            throw new Error(apiErrorMessage(error, "Invalid email or password"));
        }
        await adoptSession(data);
    }, [adoptSession]);

    const signup = useCallback(async (email: string, password: string, name: string) => {
        const display = name.trim();
        const { data, error } = await client.POST("/api/auth/register", {
            body: {
                email: email.trim(),
                password,
                ...(display ? { display_name: display } : {}),
            },
        });
        if (error || !data) {
            throw new Error(apiErrorMessage(error, "Could not create your account"));
        }
        await adoptSession(data);
    }, [adoptSession]);

    const signout = useCallback(() => {
        clearSession();
        setSession(null);
        setProfile(null);
    }, []);

    const updateProfile = useCallback(async (patch: ProfileUpdate) => {
        const { data, error } = await client.PATCH("/api/users/me", { body: patch });
        if (error || !data?.profile) {
            throw new Error(apiErrorMessage(error, "Could not update your profile"));
        }
        setProfile(data.profile);
        return data.profile;
    }, []);

    const refreshProfile = useCallback(async () => {
        try {
            await loadMe();
        } catch {
            /* silent — stale profile is fine */
        }
    }, [loadMe]);

    const value = useMemo<AuthContextValue>(() => ({
        session,
        profile,
        loading,
        signin,
        signup,
        signout,
        updateProfile,
        refreshProfile,
    }), [session, profile, loading, signin, signup, signout, updateProfile, refreshProfile]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used within <AuthProvider>");
    return context;
}

export { AuthProvider };
