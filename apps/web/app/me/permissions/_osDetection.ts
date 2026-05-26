// OS detection + per-OS instructions for the "Open settings" affordance on
// a denied permission. Used by PermissionRow when status === 'denied'.
//
// There's no programmatic way to open the OS settings app from a web page,
// so the best we can do is tell the user the 3-4 step path. Detection is
// best-effort user-agent sniffing — good enough for the major mobile +
// desktop combos. Falls back to generic browser-level wording on 'unknown'.

export type OSKind =
  | 'ios'
  | 'android'
  | 'macos'
  | 'windows'
  | 'linux'
  | 'unknown';

export type PermissionType = 'notifications' | 'location' | 'camera';

export function detectOS(): OSKind {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent;
  // Order matters — iOS check before macOS because iPadOS UA contains
  // "Macintosh" in desktop-class mode on newer iPads.
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
  // iPadOS 13+ identifies as Macintosh + touch-capable. Treat as iOS so
  // the user gets the Safari-style instructions.
  const nav = navigator as Navigator & { maxTouchPoints?: number };
  if (/Macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1) return 'ios';
  if (/Android/.test(ua)) return 'android';
  if (/Macintosh|Mac OS X/.test(ua)) return 'macos';
  if (/Windows/.test(ua)) return 'windows';
  if (/Linux/.test(ua)) return 'linux';
  return 'unknown';
}

// Returns a short list of steps. Kept to 3-4 lines so the popover stays
// scannable. Copy errs toward the dominant browser per OS (Safari on iOS,
// Chrome on Android, browser-agnostic on desktop).
export function settingsInstructions(
  os: OSKind,
  perm: PermissionType,
): { title: string; steps: string[] } {
  const permLabel = labelForPerm(perm);

  switch (os) {
    case 'ios':
      return {
        title: `Allow ${permLabel} on iPhone / iPad`,
        steps: [
          'Open the Settings app.',
          'Scroll down and tap Safari.',
          `Tap ${permLabel === 'location' ? 'Location' : permLabel === 'notifications' ? 'Notifications' : 'Camera'}.`,
          'Choose Allow.',
        ],
      };
    case 'android':
      return {
        title: `Allow ${permLabel} on Android`,
        steps: [
          'Tap the menu in your browser (three dots).',
          'Open Settings, then Site settings.',
          `Tap ${permLabel === 'location' ? 'Location' : permLabel === 'notifications' ? 'Notifications' : 'Camera'}.`,
          'Find wellos.one and switch to Allow.',
        ],
      };
    case 'macos':
    case 'windows':
    case 'linux':
    case 'unknown':
    default:
      return {
        title: `Allow ${permLabel} in your browser`,
        steps: [
          'Click the lock icon in the address bar.',
          `Find the ${permLabel} permission.`,
          'Switch it to Allow.',
          'Reload this page.',
        ],
      };
  }
}

function labelForPerm(perm: PermissionType): string {
  switch (perm) {
    case 'notifications':
      return 'notifications';
    case 'location':
      return 'location';
    case 'camera':
      return 'camera';
  }
}
