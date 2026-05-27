'use client';

// SignaturePad — wraps react-signature-canvas for the public form filler.
//
// The component is dynamic-imported with ssr:false from the parent renderer
// because react-signature-canvas relies on the browser <canvas> + document
// APIs. SSR-rendering it crashes Next at build time.
//
// Public API:
//   onChange(imageBase64)   — fires when the user finishes a stroke; null
//                             on clear.
//   disabled                — disables drawing + the Clear button.
//   initialBase64           — optional, restores a previously captured
//                             signature (e.g. autosave reload).

import { useEffect, useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';

import { cn } from '@/lib/cn';

export interface SignaturePadProps {
  onChange: (imageBase64: string | null) => void;
  disabled?: boolean;
  initialBase64?: string | null;
  ariaLabel?: string;
}

export default function SignaturePad({
  onChange,
  disabled = false,
  initialBase64,
  ariaLabel = 'Signature pad',
}: SignaturePadProps) {
  const sigRef = useRef<SignatureCanvas | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hasContent, setHasContent] = useState(false);
  const [dims, setDims] = useState<{ width: number; height: number }>({
    width: 320,
    height: 180,
  });

  // Track container width so the canvas matches its parent. react-signature
  // -canvas reads fixed canvas dims at mount; we re-render with the right
  // size via state.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const sync = () => {
      const rect = el.getBoundingClientRect();
      setDims({ width: Math.max(200, Math.floor(rect.width)), height: 180 });
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Restore initial signature if provided.
  useEffect(() => {
    if (!initialBase64) return;
    const sig = sigRef.current;
    if (!sig) return;
    try {
      sig.fromDataURL(initialBase64);
      setHasContent(true);
    } catch {
      // Bad initial value — ignore, leave pad empty.
    }
  }, [initialBase64]);

  const handleEnd = () => {
    const sig = sigRef.current;
    if (!sig) return;
    if (sig.isEmpty()) {
      setHasContent(false);
      onChange(null);
      return;
    }
    try {
      const dataUrl = sig.toDataURL('image/png');
      setHasContent(true);
      onChange(dataUrl);
    } catch {
      // Defensive — canvas should never be tainted (no cross-origin images).
    }
  };

  const clear = () => {
    const sig = sigRef.current;
    if (!sig) return;
    sig.clear();
    setHasContent(false);
    onChange(null);
  };

  return (
    <div className="flex flex-col gap-s2">
      <div
        ref={containerRef}
        className={cn(
          'relative rounded-md border-[1.5px] border-surface-3 bg-white overflow-hidden',
          disabled && 'opacity-60 cursor-not-allowed',
        )}
        style={{ height: dims.height }}
      >
        <SignatureCanvas
          ref={sigRef}
          penColor="#1A2B22"
          canvasProps={{
            width: dims.width,
            height: dims.height,
            className: cn(
              'block touch-none',
              disabled ? 'pointer-events-none' : 'cursor-crosshair',
            ),
            'aria-label': ariaLabel,
            role: 'img',
          }}
          onEnd={handleEnd}
        />
        {!hasContent ? (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center t-caption text-placeholder">
            Draw your signature
          </p>
        ) : null}
      </div>
      <div className="flex items-center justify-between">
        <p className="t-caption text-ink-soft">
          By signing, you agree this is your legal signature.
        </p>
        <button
          type="button"
          onClick={clear}
          disabled={disabled || !hasContent}
          className={cn(
            't-body-sm text-ink-soft underline-offset-2',
            !disabled && hasContent && 'hover:underline hover:text-ink',
            (disabled || !hasContent) && 'opacity-50 cursor-not-allowed',
          )}
        >
          Clear
        </button>
      </div>
    </div>
  );
}
