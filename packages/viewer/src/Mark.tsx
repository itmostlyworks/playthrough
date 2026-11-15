// Playthrough's mark, as `public/logo.svg` draws it: the hand-back before and the next, side by side, and a note over
// where they meet, in the page's own colours.

export function Mark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={`flex-none ${className}`} aria-hidden>
      <mask id="around-the-note">
        <rect width="32" height="32" fill="#fff" />
        <circle cx="16" cy="16" r="7" fill="#000" />
      </mask>
      <g mask="url(#around-the-note)" fill="var(--fg)">
        <rect x="2" y="6" width="12" height="20" rx="3" opacity="0.35" />
        <rect x="18" y="6" width="12" height="20" rx="3" />
      </g>
      <circle cx="16" cy="16" r="5" fill="var(--amber)" />
    </svg>
  );
}
