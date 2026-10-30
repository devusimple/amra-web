import createClient from "openapi-fetch";
import type { paths } from "./schema";
import { clearSession, readSession, UNAUTHORIZED_EVENT } from "./session";

export const BASE_URL = "https://amra-signal.devusimple.workers.dev";

export const client = createClient<paths>({
    baseUrl: BASE_URL,
});

// Attach the bearer token to every outgoing request.
client.use({
    onRequest({ request }) {
        const token = readSession()?.token;
        if (token) request.headers.set("Authorization", `Bearer ${token}`);
    },
});

// An expired/invalid token should not leave the app in a broken signed-in state.
client.use({
    onResponse({ response }) {
        if (response.status === 401 && readSession()) {
            clearSession();
            window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
        }
    },
});

/** Pull a human readable message out of an API error payload. */
export function apiErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof TypeError) return "Could not reach the server. Check your connection.";
    if (error instanceof Error && error.message) return error.message;
    if (error && typeof error === "object" && "error" in error) {
        const message = (error as { error?: unknown }).error;
        if (typeof message === "string" && message.trim()) return message;
    }
    return fallback;
}
