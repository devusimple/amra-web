import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { title?: string };

const base = {
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
};

export function PhoneIcon(props: IconProps) {
    return (
        <svg {...base} {...props}>
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.2 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />
        </svg>
    );
}

export function PhoneOffIcon(props: IconProps) {
    return (
        <svg {...base} {...props}>
            <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.4 19.4 0 0 1-3.33-2.67m-2.67-3.34a19.8 19.8 0 0 1-3.07-8.66A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91" />
            <path d="m2 2 20 20" />
        </svg>
    );
}

export function VideoIcon(props: IconProps) {
    return (
        <svg {...base} {...props}>
            <path d="m16 13 5.22 3.05A.5.5 0 0 0 22 15.6V8.4a.5.5 0 0 0-.78-.42L16 11" />
            <rect x="2" y="6" width="14" height="12" rx="2" />
        </svg>
    );
}

export function VideoOffIcon(props: IconProps) {
    return (
        <svg {...base} {...props}>
            <path d="M10.66 6H14a2 2 0 0 1 2 2v2.5l5.22-3.05A.5.5 0 0 1 22 7.9v8.2a.5.5 0 0 1-.78.42l-2.51-1.47M16 16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2" />
            <path d="m2 2 20 20" />
        </svg>
    );
}

export function MicIcon(props: IconProps) {
    return (
        <svg {...base} {...props}>
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4M8 22h8" />
        </svg>
    );
}

export function MicOffIcon(props: IconProps) {
    return (
        <svg {...base} {...props}>
            <path d="M9 9v2a3 3 0 0 0 4.24 2.74M15 9.34V5a3 3 0 0 0-5.83-1M5 10v1a7 7 0 0 0 10.54 6.06M19 10v1a7 7 0 0 1-.86 3.36M12 18v4M8 22h8" />
            <path d="m2 2 20 20" />
        </svg>
    );
}

export function SendIcon(props: IconProps) {
    return (
        <svg {...base} {...props}>
            <path d="m22 2-7 20-4-9-9-4Z" />
            <path d="M22 2 11 13" />
        </svg>
    );
}

export function SearchIcon(props: IconProps) {
    return (
        <svg {...base} {...props}>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
        </svg>
    );
}

export function ArrowLeftIcon(props: IconProps) {
    return (
        <svg {...base} {...props}>
            <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
    );
}

export function LogOutIcon(props: IconProps) {
    return (
        <svg {...base} {...props}>
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
        </svg>
    );
}

export function PencilIcon(props: IconProps) {
    return (
        <svg {...base} {...props}>
            <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
        </svg>
    );
}

export function RefreshIcon(props: IconProps) {
    return (
        <svg {...base} {...props}>
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16M3 21v-5h5M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8M21 3v5h-5" />
        </svg>
    );
}

export function XIcon(props: IconProps) {
    return (
        <svg {...base} {...props}>
            <path d="M18 6 6 18M6 6l12 12" />
        </svg>
    );
}

export function CheckIcon(props: IconProps) {
    return (
        <svg {...base} {...props}>
            <path d="m20 6-11 11-5-5" />
        </svg>
    );
}

export function CheckCheckIcon(props: IconProps) {
    return (
        <svg {...base} {...props}>
            <path d="m2 12 5 5L17 7" />
            <path d="m11 15 2 2L23 7" />
        </svg>
    );
}

export function ClockIcon(props: IconProps) {
    return (
        <svg {...base} {...props}>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
        </svg>
    );
}
