export const RTC_CONFIG: RTCConfiguration = {
    iceServers: [
        {
            urls: [
                "stun:stun.l.google.com:19302",
                "stun:stun1.l.google.com:19302",
            ],
        },
    ],
};

export function createPeer(): RTCPeerConnection {
    return new RTCPeerConnection(RTC_CONFIG);
}

/**
 * A data-channel-only offer contains only an `m=application` line, while an
 * audio/video call offer starts with `m=audio` / `m=video` lines. This is how
 * the callee decides whether to ring the user or silently answer a chat
 * session request.
 */
export function hasMediaSdp(sdp?: string | null): boolean {
    return !!sdp && /^m=(audio|video)\b/m.test(sdp);
}

export function hasVideoSdp(sdp?: string | null): boolean {
    return !!sdp && /^m=video\b/m.test(sdp);
}
