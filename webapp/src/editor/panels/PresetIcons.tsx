/**
 * Custom SVG preset icons.
 * White line-art style, viewBox 0 0 40 40, stroke currentColor, strokeWidth 1.5, fill none.
 * For presets where a lucide icon exists, we use that instead (see PromptPresets.tsx).
 */

export function ScreenToRenderIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      {/* Dashed cube */}
      <path d="M10 14 L20 8 L30 14 L30 26 L20 32 L10 26 Z" strokeDasharray="3 2" />
      <path d="M20 8 L20 20" strokeDasharray="3 2" />
      <path d="M10 14 L20 20 L30 14" strokeDasharray="3 2" />
      {/* Arrow */}
      <path d="M32 20 L38 20 M35 17 L38 20 L35 23" strokeDasharray="none" />
    </svg>
  )
}

export function ImageToSketchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      {/* Cube outline */}
      <path d="M8 16 L18 10 L28 16 L28 26 L18 32 L8 26 Z" />
      <path d="M18 10 L18 22" />
      <path d="M8 16 L18 22 L28 16" />
      {/* Pencil */}
      <path d="M30 8 L36 14 L32 18 L26 12 Z" />
      <path d="M26 12 L24 20" />
    </svg>
  )
}

export function TopViewIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      {/* Top-down square */}
      <path d="M10 15 L20 10 L30 15 L20 20 Z" />
      {/* Depth lines */}
      <path d="M10 15 L10 25 L20 30 L30 25 L30 15" />
      <path d="M20 20 L20 30" />
      {/* Down arrow */}
      <path d="M20 2 L20 8 M17 5 L20 8 L23 5" />
    </svg>
  )
}

export function SideViewIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      {/* Side elevation */}
      <rect x="10" y="10" width="20" height="20" rx="1" />
      <path d="M10 20 L30 20" />
      <path d="M20 10 L20 30" />
      {/* Side arrow */}
      <path d="M34 20 L38 20 M36 17 L38 20 L36 23" />
    </svg>
  )
}

export function AnotherViewIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      {/* Cube */}
      <path d="M12 16 L20 12 L28 16 L28 24 L20 28 L12 24 Z" />
      <path d="M20 12 L20 20" />
      <path d="M12 16 L20 20 L28 16" />
      {/* Rotation arrow */}
      <path d="M32 10 C36 14, 36 22, 32 26" />
      <path d="M30 8 L32 10 L34 8" />
    </svg>
  )
}

export function EnhanceRealismIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      {/* Cube */}
      <path d="M10 16 L18 12 L26 16 L26 24 L18 28 L10 24 Z" />
      <path d="M18 12 L18 20" />
      <path d="M10 16 L18 20 L26 16" />
      {/* Sparkles */}
      <path d="M32 8 L32 14 M29 11 L35 11" />
      <path d="M34 22 L34 26 M32 24 L36 24" />
    </svg>
  )
}

export function MakeBrighterIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      {/* Brightness slider bars */}
      <rect x="8" y="12" width="24" height="4" rx="2" />
      <rect x="8" y="20" width="18" height="4" rx="2" />
      <rect x="8" y="28" width="12" height="4" rx="2" />
      {/* Sun rays */}
      <circle cx="33" cy="8" r="3" />
      <path d="M33 3 L33 4 M33 12 L33 13 M28 8 L29 8 M37 8 L38 8" />
    </svg>
  )
}

export function AxonometryIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      {/* Axonometric cube */}
      <path d="M20 6 L34 14 L34 28 L20 36 L6 28 L6 14 Z" />
      <path d="M20 6 L20 20" />
      <path d="M6 14 L20 22 L34 14" />
      <path d="M20 22 L20 36" />
    </svg>
  )
}

export function TechnicalDrawingsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      {/* Grid pattern */}
      <rect x="6" y="6" width="28" height="28" rx="1" />
      <path d="M6 15.3 L34 15.3 M6 24.7 L34 24.7" />
      <path d="M15.3 6 L15.3 34 M24.7 6 L24.7 34" />
      {/* Dimension line */}
      <path d="M8 38 L32 38 M8 36 L8 38 M32 36 L32 38" />
    </svg>
  )
}

export function LogoIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      {/* Chain link / logo shape */}
      <rect x="8" y="12" width="10" height="16" rx="5" />
      <rect x="22" y="12" width="10" height="16" rx="5" />
      <path d="M18 20 L22 20" />
    </svg>
  )
}

export function AddBlurredPeopleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      {/* Blurred person silhouette */}
      <circle cx="20" cy="12" r="5" strokeDasharray="2 2" />
      <path d="M12 34 L15 22 L20 20 L25 22 L28 34" strokeDasharray="2 2" />
      {/* Motion lines */}
      <path d="M6 16 L10 16 M6 24 L10 24 M6 32 L10 32" opacity="0.5" />
    </svg>
  )
}

export function AddBlurredCarsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      {/* Car body */}
      <path d="M8 22 L12 16 L28 16 L32 22 L34 22 L34 28 L6 28 L6 22 Z" strokeDasharray="2 2" />
      {/* Wheels */}
      <circle cx="13" cy="28" r="3" strokeDasharray="2 2" />
      <circle cx="27" cy="28" r="3" strokeDasharray="2 2" />
      {/* Motion lines */}
      <path d="M2 18 L6 18 M2 22 L6 22 M2 26 L6 26" opacity="0.5" />
    </svg>
  )
}

export function ZoomInVideoIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      {/* Mountain landscape */}
      <path d="M4 32 L14 16 L22 26 L28 18 L36 32 Z" />
      {/* Sun */}
      <circle cx="30" cy="10" r="4" />
      {/* Zoom arrows pointing inward */}
      <path d="M4 4 L12 12 M4 4 L10 4 M4 4 L4 10" />
      <path d="M36 4 L28 12 M36 4 L30 4 M36 4 L36 10" />
    </svg>
  )
}

export function MoveForwardIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      {/* Perspective lines (road vanishing point) */}
      <path d="M4 36 L20 12 L36 36" />
      <path d="M12 36 L20 18 L28 36" />
      {/* Forward arrow */}
      <path d="M20 4 L20 14 M16 8 L20 4 L24 8" />
    </svg>
  )
}

export function OrbitIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      {/* Orbit circle */}
      <ellipse cx="20" cy="20" rx="14" ry="8" />
      {/* Center dot */}
      <circle cx="20" cy="20" r="3" />
      {/* Arrow on orbit */}
      <path d="M34 20 L32 16 M34 20 L30 20" />
    </svg>
  )
}

export function PanLeftIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      {/* Camera frame */}
      <rect x="10" y="10" width="20" height="20" rx="2" />
      {/* Left arrow */}
      <path d="M2 20 L8 20 M5 17 L2 20 L5 23" />
      {/* Scene lines */}
      <path d="M14 16 L26 16 M14 20 L26 20 M14 24 L26 24" opacity="0.5" />
    </svg>
  )
}

export function UpscaleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      {/* Small frame */}
      <rect x="6" y="14" width="16" height="16" rx="1" />
      {/* Large frame */}
      <rect x="16" y="6" width="20" height="20" rx="1" strokeDasharray="3 2" />
      {/* Magnifier */}
      <circle cx="30" cy="30" r="5" />
      <path d="M34 34 L38 38" />
      {/* Plus inside magnifier */}
      <path d="M28 30 L32 30 M30 28 L30 32" />
    </svg>
  )
}
