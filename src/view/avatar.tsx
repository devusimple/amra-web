import { useState } from "react";

const PALETTES = [
    ["#f59e0b", "#ef4444"],
    ["#10b981", "#0ea5e9"],
    ["#8b5cf6", "#ec4899"],
    ["#f97316", "#eab308"],
    ["#06b6d4", "#3b82f6"],
    ["#a3e635", "#059669"],
    ["#f43f5e", "#8b5cf6"],
];

function hashOf(value: string): number {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
        hash = (hash * 31 + value.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
}

type AvatarProps = {
    id: number;
    name?: string | null;
    src?: string | null;
    size?: number;
    className?: string;
};

/**
 * Avatar with a deterministic gradient fallback, so the contact list looks
 * intentional even when nobody has uploaded an image.
 */
export function Avatar({ id, name, src, size = 40, className = "" }: AvatarProps) {
    const [failedSrc, setFailedSrc] = useState<string | null>(null);

    const label = (name ?? "").trim() || `User ${id}`;
    const initial = label.replace(/^@/, "").charAt(0).toUpperCase() || "?";
    const [from, to] = PALETTES[hashOf(`${id}:${label}`) % PALETTES.length];
    const rounded = size >= 64 ? "rounded-3xl" : "rounded-full";

    if (src && failedSrc !== src) {
        return (
            <img
                src={src}
                alt={label}
                width={size}
                height={size}
                onError={() => setFailedSrc(src)}
                className={`shrink-0 object-cover ${rounded} ${className}`}
                style={{ width: size, height: size }}
            />
        );
    }

    return (
        <span
            role="img"
            aria-label={label}
            className={`shrink-0 grid place-content-center font-semibold text-white select-none ${rounded} ${className}`}
            style={{
                width: size,
                height: size,
                fontSize: Math.max(12, Math.round(size * 0.4)),
                backgroundImage: `linear-gradient(135deg, ${from}, ${to})`,
            }}
        >
            {initial}
        </span>
    );
}
