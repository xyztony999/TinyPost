type LogoProps = {
  className?: string;
  title?: string;
};

/** TinyPost mark: a path slash, the / in a URL. */
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
        d="M41 90 87 38"
        fill="none"
        stroke="var(--logo-fg)"
        strokeWidth="20"
        strokeLinecap="round"
      />
    </svg>
  );
}
