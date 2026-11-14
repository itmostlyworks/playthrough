// A key that answers, drawn on its button: faint and outlined, at the button's right edge.

import type { ReactNode } from "react";

export function Key({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <kbd className={`min-w-4 flex-none rounded-[3px] whitespace-nowrap pointer-coarse:hidden px-[3px] text-center font-ui text-[11px] leading-4 font-normal text-faint shadow-[0_0_0_1px_var(--line)] in-aria-pressed:text-inherit in-aria-pressed:opacity-60 in-aria-pressed:shadow-[0_0_0_1px_currentColor] ${className}`}>{children}</kbd>;
}
