import { Link } from "react-router-dom";

/** The Oriel mark is an arched bay window (an "oriel"): a quiet nod to the light the store sells. */
export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="15" fill="#1d1a17" />
      <path d="M19 47V30a13 13 0 0 1 26 0v17" fill="none" stroke="#e9a27c" strokeWidth="4" strokeLinecap="round" />
      <path d="M32 17v30M19 35h26" stroke="#f7f3ec" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link to="/" className="logo" aria-label="Oriel home">
      <LogoMark />
      <span>Oriel</span>
    </Link>
  );
}
