import type { components } from "../api/schema";
import type { Session } from "../api/session";

type Profile = components["schemas"]["Profile"];

/** Default display name shown when the profile has none yet. */
export function displayNameOf(profile: Profile | null, session: Session | null): string {
    const name = profile?.display_name?.trim();
    if (name) return name;
    const email = session?.user.email ?? "";
    const local = email.split("@")[0]?.trim();
    return local || "You";
}
