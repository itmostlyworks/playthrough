// A key that answers, drawn on its button: faint and outlined, at the button's right edge. One pressed more than once
// is the key and its count, as two alike side by side read as one drawn twice ("Esc ×2"): the two are one badge.

import type { ReactNode, Ref } from "react";

const KEY =
  "min-w-4 flex-none rounded-[3px] whitespace-nowrap pointer-coarse:hidden px-[3px] text-center font-ui text-[11px] leading-4 font-normal text-faint shadow-[0_0_0_1px_var(--line)] in-aria-pressed:text-inherit in-aria-pressed:opacity-60 in-aria-pressed:shadow-[0_0_0_1px_currentColor]";

export function Key({ children, times, className = "", ref }: { children: ReactNode; times?: number; className?: string; ref?: Ref<HTMLSpanElement> }) {
  if (!times) return <kbd data-part="key" className={`${KEY} ${className}`}>{children}</kbd>;
  return (
    <span ref={ref} data-part="key" className={`flex items-center gap-1 pointer-coarse:hidden ${className}`}>
      <kbd className={KEY}>{children}</kbd>
      <span className="text-[11px] leading-4 text-[color-mix(in_srgb,var(--faint)_55%,var(--soft))]">×{times}</span>
    </span>
  );
}
