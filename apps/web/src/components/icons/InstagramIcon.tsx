import { SVGProps } from 'react';

/**
 * Inline Instagram brand glyph. lucide-react v1.14 ships without an
 * Instagram icon, so we draw our own from the lucide source path data
 * (camera body + lens + viewfinder dot). Stroked, not filled, to match
 * the rest of the lucide set.
 */
export function InstagramIcon({
  size = 16,
  className,
  ...rest
}: SVGProps<SVGSVGElement> & { size?: number | string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}
