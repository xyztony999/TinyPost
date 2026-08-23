type LogoProps = {
  className?: string;
  title?: string;
};

/** TinyPost mark: envelope + send arrow */
export function TinyPostLogo({ className, title = "TinyPost" }: LogoProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 128 128"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <rect width="128" height="128" fill="var(--logo-bg)" />
      <path
        fill="none"
        stroke="var(--logo-fg)"
        strokeWidth="8"
        strokeLinejoin="round"
        strokeLinecap="round"
        d="M30 46h52v36H30z"
      />
      <path
        fill="none"
        stroke="var(--logo-fg)"
        strokeWidth="8"
        strokeLinejoin="round"
        strokeLinecap="round"
        d="M30 46l26 18 26-18"
      />
      <path fill="var(--logo-fg)" d="M78 72h18l-1 8 16-12-16-12 1 8H78z" />
    </svg>
  );
}
