import { useId, type ReactNode } from "react";
import type { ProductArt as Art } from "../lib/types";

interface Props {
  art: Art;
  label: string;
  /** 0 = studio, 1 = close detail, 2 = in a room. */
  view?: 0 | 1 | 2;
  className?: string;
}

/**
 * Procedurally drawn product imagery (original artwork, no external image files). Each shape is a
 * simple vector illustration tinted by the product's palette.
 */
function Shape({ shape, colors }: { shape: Art["shape"]; colors: [string, string, string] }): ReactNode {
  const [a, b, c] = colors;
  switch (shape) {
    case "vase":
      return (
        <g>
          <path d="M168 392 C122 338 126 252 164 206 L172 150 L228 150 L236 206 C274 252 278 338 232 392 Z" fill={a} />
          <path d="M168 392 C122 338 126 252 164 206 L172 150 L186 150 C176 230 160 320 190 392 Z" fill={b} opacity="0.35" />
          <path d="M214 160 C226 230 252 320 226 388" stroke={c} strokeWidth="9" strokeLinecap="round" fill="none" opacity="0.55" />
          <ellipse cx="200" cy="150" rx="28" ry="8" fill={c} />
          <ellipse cx="200" cy="150" rx="20" ry="4.5" fill={b} opacity="0.7" />
        </g>
      );
    case "lamp":
      return (
        <g>
          <ellipse cx="200" cy="200" rx="110" ry="80" fill={c} opacity="0.35" />
          <path d="M150 392 C140 340 152 300 200 296 C248 300 260 340 250 392 Z" fill={a} />
          <rect x="195" y="230" width="10" height="70" fill={b} />
          <path d="M142 232 L258 232 L232 124 L168 124 Z" fill={c} />
          <path d="M142 232 L258 232 L248 190 L152 190 Z" fill={b} opacity="0.18" />
          <ellipse cx="200" cy="124" rx="32" ry="6" fill={b} opacity="0.4" />
        </g>
      );
    case "bowl":
      return (
        <g>
          <path d="M104 290 Q200 450 296 290 Z" fill={a} />
          <path d="M104 290 Q150 400 196 412 Q130 392 104 290 Z" fill={b} opacity="0.35" />
          <ellipse cx="200" cy="290" rx="96" ry="18" fill={c} />
          <ellipse cx="200" cy="292" rx="82" ry="12" fill={b} opacity="0.55" />
        </g>
      );
    case "mug":
      return (
        <g>
          <path d="M252 210 C312 200 312 306 250 312" stroke={b} strokeWidth="18" fill="none" strokeLinecap="round" />
          <path d="M138 190 H262 V340 C262 372 240 392 200 392 C160 392 138 372 138 340 Z" fill={a} />
          <path d="M138 190 H168 V380 C148 372 138 360 138 340 Z" fill={b} opacity="0.3" />
          <ellipse cx="200" cy="190" rx="62" ry="12" fill={c} />
          <ellipse cx="200" cy="192" rx="52" ry="8" fill={b} opacity="0.6" />
        </g>
      );
    case "candle":
      return (
        <g>
          <path d="M152 250 H248 V366 C248 386 232 394 200 394 C168 394 152 386 152 366 Z" fill={a} />
          <path d="M152 250 H178 V390 C160 386 152 378 152 366 Z" fill={b} opacity="0.3" />
          <ellipse cx="200" cy="250" rx="48" ry="10" fill={c} />
          <rect x="198" y="212" width="4" height="38" rx="2" fill={b} />
          <path d="M200 160 C214 182 216 204 200 214 C184 204 186 182 200 160 Z" fill="#f4b860" />
          <path d="M200 182 C207 194 207 204 200 210 C193 204 193 194 200 182 Z" fill="#fff4d6" />
        </g>
      );
    case "throw":
      return (
        <g>
          <rect x="96" y="330" width="208" height="56" rx="10" fill={b} />
          <rect x="104" y="284" width="196" height="52" rx="10" fill={a} />
          <rect x="112" y="240" width="184" height="50" rx="10" fill={c} />
          <g stroke={b} strokeWidth="3" opacity="0.5">
            <path d="M120 300 H292 M120 312 H292 M120 260 H288 M120 272 H288" />
          </g>
          <g stroke={a} strokeWidth="2.5" opacity="0.8">
            <path d="M104 386 v14 M116 386 v14 M128 386 v14 M140 386 v14 M152 386 v14 M164 386 v14 M176 386 v14 M188 386 v14 M200 386 v14 M212 386 v14 M224 386 v14 M236 386 v14 M248 386 v14 M260 386 v14 M272 386 v14 M284 386 v14 M296 386 v14" />
          </g>
        </g>
      );
    case "tray":
      return (
        <g>
          <rect x="82" y="316" width="236" height="64" rx="14" fill={b} />
          <rect x="82" y="306" width="236" height="60" rx="14" fill={a} />
          <rect x="100" y="318" width="200" height="34" rx="8" fill={c} opacity="0.45" />
          <rect x="164" y="330" width="72" height="9" rx="4.5" fill={b} opacity="0.8" />
        </g>
      );
    case "pillow":
      return (
        <g>
          <path d="M104 240 Q200 214 296 240 Q316 316 296 392 Q200 414 104 392 Q84 316 104 240 Z" fill={a} />
          <path d="M104 240 Q150 320 104 392 Q84 316 104 240 Z" fill={b} opacity="0.3" />
          <path d="M296 240 Q250 320 296 392 Q316 316 296 240 Z" fill={c} opacity="0.4" />
          <path d="M120 316 Q200 330 280 316" stroke={b} strokeWidth="3" fill="none" opacity="0.5" strokeLinecap="round" />
        </g>
      );
  }
}

export function ProductArt({ art, label, view = 0, className }: Props) {
  const id = useId().replace(/:/g, "");
  const [a, b, c] = art.palette;
  const scale = view === 1 ? 1.7 : 1;
  return (
    <svg
      className={className}
      viewBox="0 0 400 480"
      role="img"
      aria-label={label}
      preserveAspectRatio="xMidYMid slice"
      style={{ width: "100%", height: "auto", aspectRatio: "5 / 6" }}
    >
      <defs>
        <linearGradient id={`bg-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={view === 2 ? "#e9dfce" : "#f1ebe0"} />
          <stop offset="1" stopColor={view === 2 ? "#cfc2ac" : "#e4d9c6"} />
        </linearGradient>
        <radialGradient id={`glow-${id}`} cx="0.5" cy="0.35" r="0.7">
          <stop offset="0" stopColor={c} stopOpacity="0.55" />
          <stop offset="1" stopColor={c} stopOpacity="0" />
        </radialGradient>
        <filter id={`blur-${id}`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>
      <rect width="400" height="480" fill={`url(#bg-${id})`} />
      <rect width="400" height="480" fill={`url(#glow-${id})`} />
      {view === 2 && (
        <g>
          <path d="M70 420 V190 a60 60 0 0 1 120 0 V420" fill="#f7f1e5" opacity="0.8" />
          <path d="M70 300 H190 M130 130 V420" stroke="#cdbfa6" strokeWidth="3" />
          <rect x="0" y="392" width="400" height="88" fill={b} opacity="0.22" />
        </g>
      )}
      <ellipse cx="200" cy={view === 1 ? 420 : 396} rx={view === 1 ? 150 : 96} ry="12" fill="#1d1a17" opacity="0.22" filter={`url(#blur-${id})`} />
      <g transform={`translate(200 ${view === 1 ? 420 : 400}) scale(${scale}) translate(-200 -400)`}>
        <Shape shape={art.shape} colors={art.palette} />
      </g>
      {view === 1 && (
        <g stroke={a} strokeWidth="1" opacity="0.18">
          {Array.from({ length: 12 }, (_, i) => (
            <path key={i} d={`M0 ${40 * i} L400 ${40 * i + 20}`} />
          ))}
        </g>
      )}
    </svg>
  );
}
