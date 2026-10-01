import { useId } from "react";

// Same artwork as app/icon.svg, inlined so it needs no file path and scales crisply.
export function AppLogo({ className = "h-14 w-14" }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" className={className} role="img" aria-label="Kanban Workspace logo">
      <defs>
        <linearGradient id={`bg-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#818cf8" />
          <stop offset="1" stopColor="#4338ca" />
        </linearGradient>
        <filter id={`sh-${id}`} x="-30%" y="-30%" width="160%" height="170%">
          <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#1e1b4b" floodOpacity="0.45" />
        </filter>
      </defs>
      <rect width="512" height="512" rx="112" fill={`url(#bg-${id})`} />
      <g fill="#fff" fillOpacity="0.2">
        <rect x="100" y="100" width="92" height="312" rx="24" />
        <rect x="210" y="100" width="92" height="312" rx="24" />
        <rect x="320" y="100" width="92" height="312" rx="24" />
      </g>
      <g fill="#fff">
        <rect x="112" y="124" width="68" height="44" rx="12" />
        <rect x="112" y="180" width="68" height="44" rx="12" />
        <rect x="112" y="236" width="68" height="44" rx="12" />
        <rect x="222" y="124" width="68" height="44" rx="12" />
        <rect x="222" y="180" width="68" height="44" rx="12" />
        <rect x="332" y="124" width="68" height="44" rx="12" />
      </g>
      <g transform="rotate(8 366 250)" filter={`url(#sh-${id})`}>
        <rect x="332" y="222" width="68" height="44" rx="12" fill="#fbbf24" />
      </g>
    </svg>
  );
}
