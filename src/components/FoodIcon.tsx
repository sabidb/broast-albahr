import type { FoodKind } from '../lib/items';

/** Consistent, device-independent food icons (SVG) — replaces emojis. */
export default function FoodIcon({
  kind,
  size = 40,
  className,
}: {
  kind: FoodKind;
  size?: number;
  className?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden="true">
      {ICONS[kind] || ICONS.chicken}
    </svg>
  );
}

const ICONS: Record<FoodKind, JSX.Element> = {
  chicken: (
    <g>
      <path
        d="M30 8c6 0 10 4 10 9 0 4-3 7-7 8-1 3-4 5-7 5-5 0-9-4-9-9 0-1 0-2 .3-3-1-1-1.6-2.4-1.6-4 0-3.6 3-6.4 6.6-6.4 1.3 0 2.5.4 3.5 1 1.2-.4 2.5-.6 3.7-.6Z"
        fill="#E0A24A"
      />
      <path d="M35 24c-1 3-4 5-7 5-3.6 0-6.7-2.2-8.2-5.3 4 1.6 10.5 2 15.2.3Z" fill="#C97B3C" />
      <rect x="10" y="30" width="16" height="5.4" rx="2.7" transform="rotate(-40 10 30)" fill="#FBE7C6" />
      <circle cx="9.5" cy="38.5" r="3.4" fill="#FBE7C6" />
      <circle cx="14.5" cy="41" r="3.1" fill="#FBE7C6" />
      <circle cx="30" cy="16" r="1.5" fill="#fff" opacity=".5" />
    </g>
  ),
  fish: (
    <g>
      <path d="M8 24c6-8 18-11 28-8-3 3-3 13 0 16-10 3-22 0-28-8Z" fill="#66B9E6" />
      <path d="M8 24c6-8 18-11 28-8-4 2-7 6-7 8 0 2 3 6 7 8-10 3-22 0-28-8Z" fill="#8FCBEE" />
      <path d="M44 16c-3 3-3 13 0 16-4-1-7-4-8-8 1-4 4-7 8-8Z" fill="#4E93BD" />
      <circle cx="16" cy="21" r="2.3" fill="#fff" />
      <circle cx="16" cy="21" r="1.1" fill="#1E1206" />
      <path d="M22 27c3 2 7 2 10 0" stroke="#3A78A0" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </g>
  ),
  shrimp: (
    <g>
      <path
        d="M34 12c-9 0-16 6-16 14 0 5 4 9 9 9 2 0 4-1 5-2-6 0-10-4-10-9s5-9 12-9c3 0 5-1 5-2s-2-1-5-1Z"
        fill="#F0805E"
      />
      <path d="M25 33c2 1 5 1 7-1-4 .3-7-1-8-4-1 2 0 4 1 5Z" fill="#E1483C" />
      <path d="M36 11l6-3-2 5 4 1-5 2Z" fill="#FFB79F" />
      <circle cx="31" cy="16" r="1.3" fill="#7A241A" />
      <circle cx="24" cy="21" r="1.2" fill="#E1483C" />
      <circle cx="21" cy="26" r="1.2" fill="#E1483C" />
    </g>
  ),
  burger: (
    <g>
      <path d="M9 17c0-6 6-9 15-9s15 3 15 9Z" fill="#E0A96D" />
      <ellipse cx="18" cy="13.5" rx="1.6" ry="1" fill="#fff" opacity=".7" />
      <ellipse cx="27" cy="12.5" rx="1.6" ry="1" fill="#fff" opacity=".7" />
      <rect x="8" y="17" width="32" height="4" rx="2" fill="#5BA84F" />
      <rect x="9" y="20.5" width="30" height="5" rx="2.5" fill="#7A4A2B" />
      <rect x="8" y="25" width="32" height="3.2" rx="1.6" fill="#F5B400" />
      <path d="M9 30c0 5 6 8 15 8s15-3 15-8c0-1.6-1-2-2-2H11c-1 0-2 .4-2 2Z" fill="#D9975A" />
    </g>
  ),
  club: (
    <g>
      <path d="M6 34L22 10l4 6-12 18Z" fill="#EBC98A" />
      <path d="M22 10l16 24H14l12-18Z" fill="#E0B673" />
      <path d="M12 26h24l-2 3H14Z" fill="#7A4A2B" />
      <path d="M15 21h18l-1.5 2.4H16.5Z" fill="#5BA84F" />
      <rect x="24" y="4" width="1.8" height="9" rx=".9" fill="#E10600" />
      <circle cx="24.9" cy="4" r="2.2" fill="#E10600" />
    </g>
  ),
  sandwich: (
    <g>
      <path d="M12 40 34 10c3-2 7-1 8 2 1.4 3-.2 6-3 8L18 44Z" fill="#EAD0A3" />
      <path d="M12 40 34 10c3-2 7-1 8 2L14 44Z" fill="#F0DCB6" />
      <path d="M13 39l6-8c3 1 6 1 9-1l-6 8c-3 2-6 2-9 1Z" fill="#5BA84F" />
      <circle cx="20" cy="33" r="1.4" fill="#E1483C" />
      <circle cx="24" cy="28" r="1.4" fill="#E1483C" />
    </g>
  ),
  fries: (
    <g>
      <rect x="12" y="6" width="4" height="20" rx="2" fill="#F5C24A" />
      <rect x="18" y="4" width="4" height="22" rx="2" fill="#FBD36B" />
      <rect x="24" y="6" width="4" height="20" rx="2" fill="#F5C24A" />
      <rect x="30" y="8" width="4" height="18" rx="2" fill="#FBD36B" />
      <path d="M11 22h26l-3 18a3 3 0 0 1-3 2.6H17A3 3 0 0 1 14 40Z" fill="#E10600" />
      <path d="M11 22h26l-1 6H12Z" fill="#B00000" />
      <rect x="19" y="30" width="10" height="3" rx="1.5" fill="#fff" opacity=".85" />
    </g>
  ),
  nuggets: (
    <g>
      <path d="M10 20c-3 0-5 3-4 6 0 3 3 5 6 4 2 3 6 3 8 1 3 2 7 0 8-3 3-1 4-5 2-7 1-3-2-6-5-5-2-2-6-2-8 1-3-1-6 1-6 2Z" fill="#E0A24A" />
      <circle cx="15" cy="24" r="1.3" fill="#C97B3C" />
      <circle cx="24" cy="21" r="1.3" fill="#C97B3C" />
      <circle cx="30" cy="26" r="1.3" fill="#C97B3C" />
      <circle cx="20" cy="28" r="1.3" fill="#C97B3C" />
    </g>
  ),
  drink: (
    <g>
      <rect x="14" y="12" width="20" height="4" rx="2" fill="#B00000" />
      <path d="M15 16h18l-2 24a2 2 0 0 1-2 1.8H19A2 2 0 0 1 17 40Z" fill="#E10600" />
      <path d="M15 16h18l-.5 6H15.5Z" fill="#F26" opacity=".5" />
      <rect x="26" y="4" width="2.6" height="14" rx="1.3" transform="rotate(12 26 4)" fill="#FBD36B" />
      <rect x="19" y="24" width="10" height="8" rx="1" fill="#fff" opacity=".85" />
    </g>
  ),
  sauce: (
    <g>
      <path d="M8 22h32l-2 12a4 4 0 0 1-4 3.4H14A4 4 0 0 1 10 34Z" fill="#EBD9B8" />
      <ellipse cx="24" cy="22" rx="16" ry="4.5" fill="#F3E7CE" />
      <ellipse cx="24" cy="22" rx="10" ry="2.8" fill="#E0A24A" />
      <path d="M20 21c2-1 5-1 7 0" stroke="#C97B3C" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </g>
  ),
  hotdog: (
    <g>
      <rect x="6" y="20" width="36" height="10" rx="5" fill="#E0A96D" />
      <rect x="9" y="21.5" width="30" height="7" rx="3.5" fill="#C0492E" />
      <path d="M11 25c3-2 5 2 8 0s5 2 8 0 5 2 8 0" stroke="#F5C24A" strokeWidth="2" fill="none" strokeLinecap="round" />
    </g>
  ),
  onion: (
    <g>
      <circle cx="24" cy="24" r="16" fill="#E0A24A" />
      <circle cx="24" cy="24" r="12" fill="#F3E7CE" />
      <circle cx="24" cy="24" r="9" fill="#E0A24A" />
      <circle cx="24" cy="24" r="5.5" fill="#F3E7CE" />
      <circle cx="24" cy="24" r="3" fill="#E0A24A" />
    </g>
  ),
};
