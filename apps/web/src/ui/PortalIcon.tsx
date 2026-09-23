/**
 * Classical gate / portal arch. Lucide has doors, but nothing that reads as a
 * land gate at badge size, so this sits beside the other counter glyphs.
 */
export function PortalIcon({
  size = 18,
  className,
}: {
  size?: number;
  className?: string;
}) {
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
      aria-hidden
      className={className}
    >
      <path d="M4 21V10a8 8 0 0 1 16 0v11" />
      <path d="M9 21v-7a3 3 0 0 1 6 0v7" />
      <path d="M2 21h20" />
    </svg>
  );
}
