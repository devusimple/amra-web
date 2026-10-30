import type { components } from "./schema";

export type Session = components["schemas"]["AuthResponse"];

export const AUTH_STORAGE_KEY = "@session";

/** Fired when the API rejects our token, so the UI can drop back to the auth screen. */
export const UNAUTHORIZED_EVENT = "amra:unauthorized";

export function readSession(): Session | null {
    try {
        const raw = localStorage.getItem(AUTH_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Session;
        if (!parsed || typeof parsed.token !== "string") return null;
        return parsed;
    } catch {
        return null;
    }
}

export function writeSession(session: Session): void {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
    localStorage.removeItem(AUTH_STORAGE_KEY);
}
