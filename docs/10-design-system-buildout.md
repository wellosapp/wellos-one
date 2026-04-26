# 10 — Design System Buildout
**Project:** Velura (Mindbody Rebuild)
**Document:** 10 — Design System Implementation
**Status:** Ready for build
**Version:** 1.0
**Date:** April 21, 2026
**Audience:** Frontend developer (solo or agency)
**Source spec:** `01-design-system.md` (UX spec, v1.0)
**Companion docs:** `09-dev-handoff.md`, `11-onboarding-buildout.md`, `12-dashboard-buildout.md`

---

## How to read this document

This is the translation layer between the design spec and the frontend codebase. It exists because every UI epic in the handoff doc assumes a working design system — colors, typography, spacing, and the core components (button, input, card, badge, avatar, toggle) — are already built. Doing the design system as "part of" the first feature epic is the most common reason solo-dev UIs end up inconsistent by week 4.

Read this before Epic 1 of the handoff doc. Build the design system first, then build features on top of it. The whole thing is roughly 3–5 days of work for one frontend developer and pays for itself by the end of Epic 2.

---

## Stack reconciliation note

The dev handoff doc (`09-dev-handoff.md`) specifies **Next.js 14 (App Router) + shadcn/ui + Tailwind** as the frontend stack. The deployment docs (`digitalocean-droplets.md`, `push-to-production.md`) describe a DigitalOcean Droplet + Container Registry path. These two are compatible — Next.js can deploy to the Droplet via Docker just as well as it can to Vercel. The design tokens in this document are framework-agnostic (CSS custom properties + a Tailwind preset) so the choice of host does not affect them.

If the team decides to move from Vercel/Railway to the DO Droplet path, nothing in this document changes. The tokens, components, and build artifacts are identical either way.

---

## Design principle recap

The single sentence to tape to the monitor: **warm professional — not clinical, not techy, not corporate**. When a component has a choice between "looks like a SaaS dashboard" and "looks like a well-run boutique business," pick the boutique every time. Subtle shadows over heavy ones. Warm off-white over cold grey. Sage accent over corporate blue.

---

## 1. Build order

The design system ships in this order. Earlier items are dependencies for later items — do not skip ahead.

| # | Layer | Est. effort |
|---|---|---|
| 1 | Design tokens (CSS variables + Tailwind preset) | 0.5 day |
| 2 | Typography (fonts loaded, utility classes) | 0.25 day |
| 3 | Primitive components (Button, Input, Select, Textarea) | 1 day |
| 4 | Container components (Card, Badge, Avatar, Toggle) | 0.75 day |
| 5 | Layout shell (Sidebar, Bottom Nav, Topbar, Page wrapper) | 1 day |
| 6 | Feedback components (Alert banner, Toast, Skeleton) | 0.5 day |
| 7 | Form composition (FormField, FormRow, ErrorText, HelpText) | 0.5 day |
| 8 | Storybook or component gallery page | 0.5 day |

Total: **~5 days solo**. Do not compress below 3 days — the payoff is every future UI ticket being 30% faster.

---

## 2. Design tokens

Tokens are the single source of truth. Every color, spacing value, shadow, and border radius used in the app must reference a token. No arbitrary hex codes in component files, ever.

### 2.1 CSS custom properties (`app/globals.css`)

```css
:root {
  /* ==== Color: Core ==== */
  --ink: #0F0F12;
  --ink-soft: #1C1C22;
  --surface: #F7F6F3;
  --surface-2: #EDECEA;
  --surface-3: #E2E0DC;
  --white: #FFFFFF;

  /* ==== Color: Accent ==== */
  --accent: #3D7A5E;
  --accent-mid: #4E9A77;
  --accent-pale: #D4EDE1;

  /* ==== Color: Status ==== */
  --red: #D64545;
  --red-pale: #FDEAEA;
  --amber: #C87C2A;
  --amber-pale: #FDF3E3;
  --green: #2D7A4F;
  --green-pale: #E2F5EC;

  /* ==== Spacing ==== */
  --s1: 4px;
  --s2: 8px;
  --s3: 12px;
  --s4: 16px;
  --s5: 20px;
  --s6: 24px;
  --s8: 32px;
  --s10: 40px;
  --s12: 48px;

  /* ==== Radius ==== */
  --r-sm: 8px;
  --r-md: 14px;
  --r-lg: 20px;
  --r-xl: 28px;

  /* ==== Elevation ==== */
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.07), 0 1px 2px rgba(0, 0, 0, 0.04);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.04);
  --shadow-lg: 0 12px 32px rgba(0, 0, 0, 0.10), 0 4px 8px rgba(0, 0, 0, 0.05);

  /* ==== Motion ==== */
  --t-fast: 0.15s ease;
  --t-base: 0.2s ease;
  --t-slow: 0.35s ease;

  /* ==== Focus ring ==== */
  --focus-ring: 0 0 0 3px rgba(61, 122, 94, 0.12);
}

/* Baseline */
*, *::before, *::after {
  box-sizing: border-box;
}

html, body {
  background: var(--surface);
  color: var(--ink);
  font-family: 'DM Sans', system-ui, sans-serif;
  font-size: 16px; /* never go below 16px base */
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

h1, h2, h3, h4, h5, h6 {
  font-family: 'Sora', system-ui, sans-serif;
  line-height: 1.2;
  letter-spacing: -0.4px;
  font-weight: 700;
}
```

### 2.2 Tailwind preset (`tailwind.config.ts`)

```ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: 'var(--ink)',
        'ink-soft': 'var(--ink-soft)',
        surface: {
          DEFAULT: 'var(--surface)',
          2: 'var(--surface-2)',
          3: 'var(--surface-3)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          mid: 'var(--accent-mid)',
          pale: 'var(--accent-pale)',
        },
        red: {
          DEFAULT: 'var(--red)',
          pale: 'var(--red-pale)',
        },
        amber: {
          DEFAULT: 'var(--amber)',
          pale: 'var(--amber-pale)',
        },
        green: {
          DEFAULT: 'var(--green)',
          pale: 'var(--green-pale)',
        },
      },
      spacing: {
        s1: 'var(--s1)',
        s2: 'var(--s2)',
        s3: 'var(--s3)',
        s4: 'var(--s4)',
        s5: 'var(--s5)',
        s6: 'var(--s6)',
        s8: 'var(--s8)',
        s10: 'var(--s10)',
        s12: 'var(--s12)',
      },
      borderRadius: {
        sm: 'var(--r-sm)',
        md: 'var(--r-md)',
        lg: 'var(--r-lg)',
        xl: 'var(--r-xl)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        display: ['Sora', 'system-ui', 'sans-serif'],
      },
      transitionDuration: {
        fast: '150ms',
        base: '200ms',
        slow: '350ms',
      },
    },
  },
  plugins: [],
};

export default config;
```

### 2.3 Token rules (enforceable in code review)

1. No hex codes in component files. If you need a color, add a token.
2. No hardcoded pixel spacing in `className` strings (e.g., `p-[13px]`). Use a spacing token or extend Tailwind's scale.
3. No inline styles with color or spacing values, ever. Exception: dynamic values computed from data (progress bars, avatar initials positioning).
4. Font sizes always match the type scale — no `text-[15.5px]` arbitrary overrides.

A simple ESLint rule or a pre-commit grep can catch most violations: `grep -r '#[0-9a-fA-F]\{6\}' components/ app/` should return nothing but token definitions.

---

## 3. Typography

### 3.1 Font loading

Load in `app/layout.tsx` using Next.js Font Optimization:

```tsx
import { Sora, DM_Sans } from 'next/font/google';

const sora = Sora({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sora',
  display: 'swap',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-dm-sans',
  display: 'swap',
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sora.variable} ${dmSans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

Then update the CSS variables to reference the Next.js font variables:

```css
html, body {
  font-family: var(--font-dm-sans), system-ui, sans-serif;
}

h1, h2, h3, h4, h5, h6 {
  font-family: var(--font-sora), system-ui, sans-serif;
}
```

Do not use the `<link>` tag from the spec doc — it works but it's slower than Next.js font optimization and blocks initial render.

### 3.2 Type utility classes

Create reusable classes in `globals.css` or as Tailwind components for the type scale. These are the only text size classes used in the app.

```css
.t-display-xl { font-family: var(--font-sora); font-size: 34px; font-weight: 700; line-height: 1.2; letter-spacing: -0.5px; }
.t-display-lg { font-family: var(--font-sora); font-size: 28px; font-weight: 700; line-height: 1.2; letter-spacing: -0.4px; }
.t-display-md { font-family: var(--font-sora); font-size: 22px; font-weight: 700; line-height: 1.25; letter-spacing: -0.4px; }
.t-display-sm { font-family: var(--font-sora); font-size: 17px; font-weight: 700; line-height: 1.3; letter-spacing: -0.3px; }

.t-body-lg   { font-size: 16px; font-weight: 400; line-height: 1.5; }
.t-body-md   { font-size: 14px; font-weight: 400; line-height: 1.5; }
.t-body-sm   { font-size: 13px; font-weight: 500; line-height: 1.45; }

.t-caption   { font-size: 12px; font-weight: 600; line-height: 1.3; }
.t-eyebrow   { font-size: 11px; font-weight: 600; line-height: 1.3; text-transform: uppercase; letter-spacing: 1.2px; }
```

**Rule:** Never use raw `text-[Npx]` in component files. If a new size is needed, add it here with a proper name and a reason.

---

## 4. Primitive components

These are the building blocks. Every higher-level component (onboarding forms, dashboard widgets, modals) composes from these.

All primitives live in `components/ui/` and are fully typed with TypeScript.

### 4.1 Button

```tsx
// components/ui/Button.tsx
type ButtonVariant = 'primary' | 'accent' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
}
```

**Implementation rules:**

- Default: `variant="accent"`, `size="md"`. Accent is the primary CTA color.
- Loading state replaces label with a spinner; button width does not change (use `min-width` = current content width).
- Disabled state: `opacity: 0.4`, `cursor: not-allowed`, no hover lift.
- Hover lift: `translateY(-1px)` + `shadow-md`, transition `var(--t-fast)`.
- Icon + label gap: `var(--s2)`.
- Focus ring visible on keyboard focus only (`:focus-visible`).

**Size tokens:**

| Size | Padding | Font size | Radius |
|---|---|---|---|
| sm | 7px 14px | 13px | `--r-sm` |
| md | 10px 20px | 14px | `--r-md` |
| lg | 14px 28px | 15px | `--r-lg` |

**Variant tokens:**

| Variant | Background | Text | Hover bg |
|---|---|---|---|
| primary | `--ink` | white | `--ink-soft` |
| accent | `--accent` | white | `--accent-mid` |
| ghost | transparent | `--ink` | `--surface-2` |

### 4.2 Input

```tsx
// components/ui/Input.tsx
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
  icon?: React.ReactNode;
}
```

**Implementation rules:**

- Border: `1.5px solid var(--surface-3)`.
- Padding: `13px 16px`.
- Border radius: `var(--r-md)`.
- Focus: border color `var(--accent)`, box-shadow `var(--focus-ring)`.
- Error: border color `var(--red)`.
- Placeholder color: `#aaa`.
- Font size: 16px minimum (prevents iOS auto-zoom).
- With icon: left-pad to `48px`, icon absolutely positioned at `16px` from left, vertically centered.

### 4.3 Select

Use a custom wrapper — **do not** ship default browser select styling. Options:

- **Recommended:** Radix UI's `Select` primitive, styled with design tokens.
- **Alternative:** `react-select` with a custom theme (heavier bundle, more features).

Both support keyboard navigation, proper ARIA, and consistent styling across browsers. Native `<select>` renders inconsistently on iOS vs Android vs desktop and is a no-go.

**Visual target:** same border, padding, radius, and focus behavior as Input. Chevron icon right-aligned, 16px from right edge.

### 4.4 Textarea

Same visual rules as Input, but:

- Default min-height: 96px (equivalent to ~3 lines).
- `resize: vertical` only — no horizontal resize.
- Character counter optional via `maxLength` prop; shown bottom-right in `--surface-3` color, turns `--amber` at 90% full, `--red` at 100%.

### 4.5 Checkbox & Radio

Both use Radix UI primitives. Visual rules:

- Size: `18×18px`.
- Border: `1.5px solid var(--surface-3)`, radius `4px` (checkbox) or `99px` (radio).
- Checked: background `var(--accent)`, white checkmark/dot.
- Focus ring same as Input.
- Associated label clickable (click on label toggles the input).

---

## 5. Container components

### 5.1 Card

```tsx
// components/ui/Card.tsx
interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'accent' | 'dark';
  padding?: 'sm' | 'md' | 'lg';
}
```

**Base styles:**

```css
.card {
  background: var(--white);
  border-radius: var(--r-lg);
  padding: var(--s6);
  box-shadow: var(--shadow-sm);
  border: 1px solid rgba(0, 0, 0, 0.04);
}
```

**Variants:**

- `accent` → adds `border-left: 3px solid var(--accent)`, slightly lifts emphasis.
- `dark` → background `var(--ink)`, text white. Used for the Quick Book widget on the dashboard.
- `default` → described above.

**Padding:**

| Size | Value |
|---|---|
| sm | `var(--s4)` |
| md | `var(--s6)` (default) |
| lg | `var(--s8)` |

Mobile: reduce default padding from `--s6` to `--s5`. Handle with a Tailwind responsive utility inside the component.

### 5.2 Badge

```tsx
// components/ui/Badge.tsx
type BadgeVariant = 'green' | 'amber' | 'red' | 'soft' | 'accent';

interface BadgeProps {
  variant: BadgeVariant;
  children: React.ReactNode;
}
```

**Style:**

```css
.badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 99px;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
}
```

**Variant colors:**

| Variant | Background | Text |
|---|---|---|
| green | `--green-pale` | `--green` |
| amber | `--amber-pale` | `--amber` |
| red | `--red-pale` | `--red` |
| soft | `--surface-3` | `#555` |
| accent | `--accent-pale` | `--accent` |

### 5.3 Avatar

```tsx
// components/ui/Avatar.tsx
interface AvatarProps {
  name: string;      // "Jane Doe" → "JD"
  src?: string;      // optional photo
  size?: 'sm' | 'md' | 'lg';
}
```

**Sizes:**

| Size | px | Font |
|---|---|---|
| sm | 28 | 11px |
| md | 36 (default) | 13px |
| lg | 52 | 18px |

**Rules:**

- Fallback initials: first letter of first name + first letter of last name. If only one word, use first two letters.
- Background: `var(--accent-pale)`, text color `var(--accent)`.
- Font: Sora 600.
- Full circle: `border-radius: 99px`.
- If `src` provided, show image and fall back to initials on load error.

### 5.4 Toggle Switch

Use Radix UI's `Switch` primitive for accessibility, styled with design tokens.

**Spec:**

- Width: 40px, height: 22px.
- Track: `var(--surface-3)` off, `var(--accent)` on.
- Knob: 16px, white, subtle shadow, translateX(18px) when on.
- Transition: `var(--t-base)`.
- Touch target: min 44×44px (wrap the switch in padding).

---

## 6. Layout shell

### 6.1 App shell structure

```
┌─────────────────────────────────────────────┐
│  (mobile only)  Topbar                      │
├──────────┬──────────────────────────────────┤
│          │                                  │
│ Sidebar  │   <main> content                 │
│ (desktop)│                                  │
│          │                                  │
├──────────┴──────────────────────────────────┤
│  (mobile only)  Bottom Nav                  │
└─────────────────────────────────────────────┘
```

### 6.2 Desktop Sidebar

- Fixed, `240px` wide.
- Background `var(--ink)`, sticky to viewport height.
- Padding: `var(--s6) var(--s5)`.
- Logo at top-left: `Sora 700 20px`, white, with accent-color period (`.`). Implement as:
  ```tsx
  <span className="t-display-md text-white">Velura<span className="text-accent">.</span></span>
  ```
- Nav sections spaced `var(--s8)` apart.
- Section labels: eyebrow style (`t-eyebrow`), color `rgba(255,255,255,0.25)`.
- Nav items: `14px DM Sans 500`, color `rgba(255,255,255,0.7)`, padding `10px 12px`, radius `var(--r-sm)`.
- Active item: `rgba(255,255,255,0.06)` bg + `border-left: 3px solid var(--accent-mid)` (shifted 3px left with `margin-left: -15px; padding-left: 15px` so alignment stays clean).
- Hover: `rgba(255,255,255,0.04)` bg.
- User footer: pinned to bottom, avatar + name + role, padding `var(--s4)`.
- Hides at `max-width: 900px`.

### 6.3 Mobile Bottom Nav

- Fixed to bottom, full width.
- Background `var(--white)`, border-top `1px solid var(--surface-3)`.
- Height: 56px + safe-area-inset-bottom (iOS).
- 5 items: Today, Calendar, Clients, Money, More.
- Each item: icon 20px + label 10px 600, vertically stacked, tap target min 44×44px.
- Active item: icon and label in `var(--accent)`; inactive in `#6B6B72`.
- Shows only at `max-width: 900px`.

### 6.4 Topbar (dashboard only)

Dashboard-specific topbar spec lives in the dashboard buildout doc (`12-dashboard-buildout.md`). The shell just reserves space for it — `height: 72px`, sticky, `z-index: 10`.

### 6.5 Page wrapper

```tsx
// components/layout/PageShell.tsx
interface PageShellProps {
  children: React.ReactNode;
  showSidebar?: boolean;    // default true
  showBottomNav?: boolean;  // default true
}
```

- Desktop: flex row, sidebar `240px`, main fills remaining width.
- Mobile: full-width main, bottom nav fixed.
- Content max-width: 1300px, centered within main with `padding: var(--s6)`.
- Mobile main padding: `var(--s4)` with extra bottom padding equal to bottom nav height.

---

## 7. Feedback components

### 7.1 Alert banner

```tsx
// components/ui/AlertBanner.tsx
interface AlertBannerProps {
  level: 'critical' | 'important';   // 'critical' → red; 'important' → amber
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  onDismiss?: () => void;
}
```

**Rules:**

- Single banner visible at a time globally (managed via a small Zustand store or React context).
- `critical` uses `--red-pale` bg, `--red` accent.
- `important` uses `--amber-pale` bg, `--amber` accent.
- Never stack two critical banners. If two critical conditions exist, the second becomes a blocking modal.
- Layout: icon left, title + description middle, action button right, dismiss X far right.
- Padding: `var(--s4) var(--s6)`.
- Radius: `var(--r-md)`.
- Transition on enter: `opacity 0→1` + `translateY(-8px→0)`, `var(--t-slow)`.

### 7.2 Toast

Use `sonner` (a small, well-designed toast library that works with Next.js). Configure the theme to match design tokens:

- Background: `var(--ink)`, text white — toasts should feel like the sidebar, distinct from page content.
- Border radius: `var(--r-md)`.
- Shadow: `var(--shadow-lg)`.
- Success toast: add `var(--green)` accent icon on left.
- Error toast: add `var(--red)` accent icon on left.
- Position: bottom-right on desktop, top-center on mobile.
- Duration: 4 seconds default, 8 seconds for errors.

### 7.3 Skeleton loader

```tsx
// components/ui/Skeleton.tsx
interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  variant?: 'text' | 'block' | 'circle';
  className?: string;
}
```

**Style:**

```css
.skeleton {
  background: linear-gradient(
    90deg,
    var(--surface-2) 25%,
    var(--surface-3) 50%,
    var(--surface-2) 75%
  );
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.4s ease-in-out infinite;
  border-radius: var(--r-sm);
}

@keyframes skeleton-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

- `variant="circle"` sets `border-radius: 99px`.
- `variant="text"` sets `height: 14px`.
- `variant="block"` is the default, free-form size.

Use skeletons instead of spinners everywhere except inside buttons. This is a hard rule — spinners on whole sections make the app feel slow.

---

## 8. Form composition

Higher-level form components that wrap primitives. These enforce the label-above-input pattern and consistent error handling.

### 8.1 FormField

```tsx
// components/form/FormField.tsx
interface FormFieldProps {
  label: string;
  required?: boolean;
  error?: string;
  help?: string;
  children: React.ReactNode; // the Input/Select/Textarea
  htmlFor: string;
}
```

**Structure:**

```
[Label]  [Required asterisk if required]
[Input]
[Error message in red, OR help text in grey — never both]
```

- Label: `t-body-sm`, color `var(--ink)`, margin-bottom `var(--s2)`.
- Required asterisk: color `var(--red)`, inline with label.
- Error message: color `var(--red)`, font size 13px, margin-top `var(--s2)`.
- Help text: color `#6B6B72`, font size 13px, margin-top `var(--s2)`.

### 8.2 FormRow

Wraps two FormFields side-by-side on desktop, stacks on mobile at `max-width: 560px`.

```tsx
// components/form/FormRow.tsx
interface FormRowProps {
  children: React.ReactNode; // expects 2 FormField children
}
```

Implementation: CSS grid, `grid-template-columns: 1fr 1fr`, gap `var(--s4)`. At `max-width: 560px`, switch to `1fr`.

### 8.3 Validation approach

Use `react-hook-form` + `zod` for every form. The schema defines both the validation and the TypeScript type.

```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const businessInfoSchema = z.object({
  name: z.string().min(1, 'Business name is required').max(80),
  email: z.string().email('Enter a valid email address'),
  phone: z.string().regex(/^\(\d{3}\) \d{3}-\d{4}$/, 'Use format (555) 000-0000'),
});

type BusinessInfo = z.infer<typeof businessInfoSchema>;

function BusinessInfoStep() {
  const { register, handleSubmit, formState: { errors } } = useForm<BusinessInfo>({
    resolver: zodResolver(businessInfoSchema),
  });
  // ...
}
```

Rule: every form in the app uses this pattern. No ad-hoc `useState` for form values, no manual validation in submit handlers.

---

## 9. Motion & animation

The motion language is **calm**. No bounce, no overshoot, no decorative animation that delays interaction.

| Element | Property | Duration | Easing |
|---|---|---|---|
| Page/panel transition | opacity + translateY(16px→0) | 350ms | ease |
| Button hover lift | translateY(-1px) + shadow | 150ms | ease |
| Toggle state | translateX on knob | 200ms | ease |
| Focus ring | box-shadow | 150ms | ease |
| Alert banner enter | opacity + translateY(-8px→0) | 350ms | ease |
| Drawer/sheet enter | translateX or translateY (100%→0) | 300ms | cubic-bezier(0.32, 0.72, 0, 1) |
| Toast enter/exit | opacity + translateY | 200ms | ease |

**Reduced motion:** Respect `prefers-reduced-motion: reduce`. Wrap transitions:

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 10. Accessibility requirements

Every component in `components/ui/` must pass these checks before being marked done:

- [ ] All body text: contrast ratio ≥ 4.5:1 against its background.
- [ ] Interactive elements: tap target ≥ 44×44px.
- [ ] Focus rings visible via keyboard (`:focus-visible`).
- [ ] Form fields have associated `<label>` via `htmlFor` / `id`.
- [ ] Color is never the only signal (pair with icon, label, or text).
- [ ] Input base font size ≥ 16px on mobile.
- [ ] Keyboard navigation works: Tab order logical, Esc closes modals/drawers, Enter submits forms, arrow keys in selects.
- [ ] Screen reader labels present on icon-only buttons (`aria-label`).
- [ ] Loading states announce to screen readers (`aria-live="polite"`).

Automated check: run `@axe-core/react` in dev mode. Any violation in console = fix before commit.

---

## 11. Responsive rules

| Breakpoint | Width | Behavior |
|---|---|---|
| Mobile | ≤560px | Single-column forms, stacked cards, full-width buttons |
| Tablet | ≤900px | Sidebar hides → bottom nav, right-column widgets stack below |
| Desktop | 901–1300px | Full sidebar + main, right column may collapse at narrow end |
| Wide | 1300px+ | Max content width 1300px, content centered |

Implement via Tailwind default breakpoints, mapped to these:

```ts
screens: {
  sm: '561px',    // mobile → tablet
  md: '901px',    // tablet → desktop
  lg: '1100px',   // narrow desktop → full desktop
  xl: '1300px',   // cap
}
```

Mobile-first: default styles are for mobile, `sm:`, `md:`, `lg:` prefixes add desktop enhancements. Do not write desktop-first CSS and try to unwind it for mobile — it breaks in edge cases every time.

---

## 12. Component gallery

Build a `/dev/gallery` page (only visible in dev/staging, 404 in production) that renders every component in every variant and state. This is the single fastest way to catch visual regressions.

Minimum coverage:

- Button: all 3 variants × 3 sizes × (default, hover, loading, disabled) states.
- Input: default, focused, error, disabled, with icon.
- Card: default, accent, dark, all padding sizes.
- Badge: all 5 variants.
- Avatar: all 3 sizes, with and without image.
- Toggle: on, off, disabled.
- Alert banner: critical, important, with and without action.
- Skeleton: text, block, circle.

Does not need to be Storybook unless the team is already using it. A single Next.js route with a few sections is enough at this stage.

---

## 13. Done looks like

- [ ] `app/globals.css` has all tokens defined.
- [ ] `tailwind.config.ts` extends Tailwind with the token names.
- [ ] Both fonts load via Next.js font optimization, no FOUC.
- [ ] Every primitive in `components/ui/` is built, typed, and documented with a JSDoc block.
- [ ] Gallery page renders all components without errors.
- [ ] `axe` reports zero violations on the gallery page.
- [ ] Lighthouse accessibility score on gallery page ≥ 95.
- [ ] No hex codes outside `globals.css` (verified by grep).
- [ ] Mobile viewport test at 375px width: no horizontal scroll, no 14px-or-smaller text.
- [ ] A new developer can import `<Button variant="accent">Save</Button>` and have it work correctly without any additional setup.

---

## 14. Sign-off before Epic 1 begins

- [ ] Design tokens reviewed against spec doc 01.
- [ ] Primitive component API reviewed by whoever will build onboarding.
- [ ] Gallery page accessible to the product reviewer.
- [ ] Mobile + desktop visual check on real devices (not just browser DevTools).

Once these are checked, the design system is ready. Epics 1 onward in `09-dev-handoff.md` assume this foundation exists. Onboarding (`11-onboarding-buildout.md`) and Dashboard (`12-dashboard-buildout.md`) reference these components by name and expect their behavior to match this spec.
