import { useEffect, useSyncExternalStore } from "react";
import { manager, type Snapshot } from "../lib/call-manager";

/**
 * Starts the signaling poller for the signed-in user and subscribes the
 * component tree to CallManager's snapshot.
 */
export function useCallManager(meId: number | null): Snapshot {
    useEffect(() => {
        if (meId === null) return;
        manager.start(meId);
        return () => manager.stop();
    }, [meId]);

    return useSyncExternalStore(manager.subscribe, manager.getSnapshot, manager.getSnapshot);
}

export { manager };
