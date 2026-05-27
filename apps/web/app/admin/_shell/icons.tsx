import type { SVGProps } from 'react';

// Lucide-style line icons used by the admin shell. Stroke 1.6, currentColor.
// Inline SVG (no icon dependency on the web app today — see
// memory/feedback note that lucide-react is intentionally not installed).
//
// Each icon accepts standard SVG props and forwards them. Default size 18px;
// the consumer overrides via `size={20}` or by setting className/style.

// `stroke` is omitted from SVGProps (its base type is `string`) so we can
// redeclare it as `number` for the stroke-width pass-through used inside.
interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children' | 'stroke'> {
  /** Pixel size for both width + height. Defaults to 18. */
  size?: number;
  /** Stroke width. Defaults to 1.6 — matches the design's editorial weight. */
  stroke?: number;
}

function Icon({
  size = 18,
  stroke = 1.6,
  children,
  ...rest
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function LayoutIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </Icon>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </Icon>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.5a3.5 3.5 0 0 1 0 7M22 20a6.5 6.5 0 0 0-5-6.3" />
    </Icon>
  );
}

export function StaffIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </Icon>
  );
}

export function HourglassIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 3h12M6 21h12" />
      <path d="M7 3v3a5 5 0 0 0 10 0V3M7 21v-3a5 5 0 0 1 10 0v3" />
    </Icon>
  );
}

export function SparkIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
    </Icon>
  );
}

export function GridIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </Icon>
  );
}

export function TagIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 12.5 12 4h7v7l-8.5 8.5a2 2 0 0 1-2.8 0L3.5 15.3a2 2 0 0 1 0-2.8z" />
      <circle cx="15.5" cy="8.5" r="1.25" />
    </Icon>
  );
}

export function ClipboardIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <rect x="9" y="2.5" width="6" height="3.5" rx="1" />
      <path d="M8.5 11h7M8.5 15h5" />
    </Icon>
  );
}

export function ClipboardCheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <rect x="9" y="2.5" width="6" height="3.5" rx="1" />
      <path d="M8.5 13l2.5 2.5L15.5 11" />
    </Icon>
  );
}

export function ImageIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m3 17 5-5 5 5 3-3 5 5" />
    </Icon>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="2.8" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.11-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.65 8.7a1.7 1.7 0 0 0-.34-1.87l-.06-.06A2 2 0 1 1 7.08 3.94l.06.06a1.7 1.7 0 0 0 1.87.34h.07A1.7 1.7 0 0 0 10.1 2.83V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </Icon>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </Icon>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M18 16V11a6 6 0 1 0-12 0v5l-2 3h16z" />
      <path d="M10 21a2 2 0 0 0 4 0" />
    </Icon>
  );
}

export function InboxIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 13h4l2 3h4l2-3h4" />
      <path d="M5 5h14l1 8v6H4v-6z" />
    </Icon>
  );
}

export function LeafIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 20c0-9 6-15 16-15-1 11-7 16-16 15z" />
      <path d="M4 20c4-5 8-8 14-10" />
    </Icon>
  );
}

export function PanelLeftIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </Icon>
  );
}

export function PanelRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M15 4v16" />
    </Icon>
  );
}

// Dashboard / overview-specific icons. Ported from the design's icons.jsx.

export function TrendUpIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 17 9 11l4 4 8-8" />
      <path d="M15 7h6v6" />
    </Icon>
  );
}

export function TrendDownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 7 9 13l4-4 8 8" />
      <path d="M15 17h6v-6" />
    </Icon>
  );
}

export function WarnIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 4 2 20h20z" />
      <path d="M12 11v4M12 18.5v.01" />
    </Icon>
  );
}

export function DollarIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3v18M16 7H10a2.5 2.5 0 0 0 0 5h4a2.5 2.5 0 0 1 0 5H8" />
    </Icon>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Icon>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 4v12M7 11l5 5 5-5M5 20h14" />
    </Icon>
  );
}

export function ZapIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
    </Icon>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Icon>
  );
}

export function MessageIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M21 12a8 8 0 0 1-12 7l-5 1 1-4A8 8 0 1 1 21 12z" />
    </Icon>
  );
}

export function UserPlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2 20a7 7 0 0 1 14 0" />
      <path d="M19 8v6M22 11h-6" />
    </Icon>
  );
}

// Three horizontal dots — filled circles so the dock dock reads as a glyph,
// not three stroked rings. Stroke is dropped to 0 on the inner svg via
// strokeWidth=0 on each circle so currentColor fills only.
export function MoreIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="6" cy="12" r="1.6" fill="currentColor" strokeWidth="0" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" strokeWidth="0" />
      <circle cx="18" cy="12" r="1.6" fill="currentColor" strokeWidth="0" />
    </Icon>
  );
}

export function StarIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 2.5l2.8 6.4 6.7.6-5 4.6 1.5 6.7-6-3.4-6 3.4 1.5-6.7-5-4.6 6.7-.6z" />
    </Icon>
  );
}

// Single-user head + shoulders. Visually identical to StaffIcon — exported
// under a separate semantic name for use in the Contact section header so
// the import reads as intent ("user") rather than role ("staff").
export function UserIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </Icon>
  );
}

export function XIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Icon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 12l4 4 10-10" />
    </Icon>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" />
    </Icon>
  );
}

export function FilterIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 5h18l-7 8v6l-4-2v-4z" />
    </Icon>
  );
}

export function FileTextIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </Icon>
  );
}

export function PinIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 17v5M9 3h6l-1 6 4 3v2H6v-2l4-3-1-6z" />
    </Icon>
  );
}

export function ArchiveIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4" />
    </Icon>
  );
}

export function CheckCircleIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12l3 3 5-6" />
    </Icon>
  );
}

export function EyeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M1.5 12s4-7.5 10.5-7.5S22.5 12 22.5 12 18.5 19.5 12 19.5 1.5 12 1.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7h16M10 11v6M14 11v6" />
      <path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
      <path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
    </Icon>
  );
}

export function CloudIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7 18a4.5 4.5 0 0 1 .5-8.97A6 6 0 0 1 19 11.5a3.5 3.5 0 0 1-1 6.5z" />
    </Icon>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3l8 3v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z" />
    </Icon>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M15 6l-6 6 6 6" />
    </Icon>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 6l6 6-6 6" />
    </Icon>
  );
}
