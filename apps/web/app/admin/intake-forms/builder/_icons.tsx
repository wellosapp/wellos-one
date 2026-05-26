import type { SVGProps } from 'react';

import {
  CalendarIcon,
  ImageIcon,
  StarIcon,
  // CheckIcon — used by yes_no glyph via a custom path; not imported.
} from '@/app/admin/_shell/icons';

import type { FieldType } from '../_schema-utils';

// Icons for the Forms-System field palette. Stroke 1.6, currentColor, 24x24
// viewBox to match the rest of the admin shell. Re-exports a few existing
// icons from the shell where the visual is identical (calendar, image, star)
// and inlines the rest as small stroke-based SVGs.

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children' | 'stroke'> {
  size?: number;
  stroke?: number;
}

function Glyph({
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

function ShortTextIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M4 7h16M4 12h10M4 17h7" />
    </Glyph>
  );
}

function LongTextIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M4 6h16M4 10h16M4 14h16M4 18h10" />
    </Glyph>
  );
}

function YesNoIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <rect x="2.5" y="7" width="19" height="10" rx="5" />
      <circle cx="8" cy="12" r="2.5" fill="currentColor" strokeWidth="0" />
    </Glyph>
  );
}

function CheckboxIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M8 12l3 3 5-6" />
    </Glyph>
  );
}

function MultiSelectIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <path d="M5 6.5l1.5 1.5L9 5.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <path d="M5 17.5l1.5 1.5L9 16.5" />
      <path d="M13 6h8M13 17h8" />
    </Glyph>
  );
}

function DropdownIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M9 11l3 3 3-3" />
    </Glyph>
  );
}

function RadioIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="3.5" fill="currentColor" strokeWidth="0" />
    </Glyph>
  );
}

function HashIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M5 9h14M5 15h14M10 4v16M14 4v16" />
    </Glyph>
  );
}

function PhoneIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A14 14 0 0 1 4 6a2 2 0 0 1 1-2z" />
    </Glyph>
  );
}

function MailIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </Glyph>
  );
}

function PenIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M3 21l4-1 11-11-3-3L4 17z" />
      <path d="M14 6l3 3" />
    </Glyph>
  );
}

function PaperclipIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M21 12.5 12.5 21a5.5 5.5 0 0 1-7.8-7.8l9-9a4 4 0 0 1 5.7 5.7l-9 9a2.5 2.5 0 0 1-3.6-3.6l8-8" />
    </Glyph>
  );
}

function ActivityIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M3 12h4l3-8 4 16 3-8h4" />
    </Glyph>
  );
}

function DragHandleIcon(props: IconProps) {
  return (
    <Glyph {...props} stroke={0}>
      <circle cx="9" cy="6" r="1.4" fill="currentColor" />
      <circle cx="15" cy="6" r="1.4" fill="currentColor" />
      <circle cx="9" cy="12" r="1.4" fill="currentColor" />
      <circle cx="15" cy="12" r="1.4" fill="currentColor" />
      <circle cx="9" cy="18" r="1.4" fill="currentColor" />
      <circle cx="15" cy="18" r="1.4" fill="currentColor" />
    </Glyph>
  );
}

export { DragHandleIcon };

// Map each field type to its palette glyph component.
export const FIELD_TYPE_ICONS: Record<
  FieldType,
  (props: IconProps) => JSX.Element
> = {
  short_text: ShortTextIcon,
  long_text: LongTextIcon,
  date: CalendarIcon,
  yes_no: YesNoIcon,
  checkbox: CheckboxIcon,
  multi_select: MultiSelectIcon,
  dropdown: DropdownIcon,
  radio: RadioIcon,
  number: HashIcon,
  phone: PhoneIcon,
  email: MailIcon,
  signature: PenIcon,
  file_upload: PaperclipIcon,
  image_upload: ImageIcon,
  rating: StarIcon,
  pain_scale: ActivityIcon,
};
