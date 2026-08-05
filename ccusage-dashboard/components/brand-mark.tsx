type BrandMarkProps = {
  className?: string;
};

export function BrandMark({ className }: BrandMarkProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 40 40"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect fill="#0A0A0A" height="40" rx="11" width="40" />
      <path d="M10 27.5 20 10l10 17.5h-4.8L20 18.7l-5.2 8.8H10Z" fill="white" />
      <path d="M16.7 25.2h6.6" stroke="white" strokeLinecap="round" strokeWidth="2.2" />
      <circle cx="29.5" cy="10.5" fill="#85F3C2" r="2.5" />
    </svg>
  );
}
