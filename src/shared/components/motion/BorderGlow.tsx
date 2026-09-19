import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface BorderGlowProps {
  children: ReactNode;
  /** Distance (px) from the edge at which the glow starts reacting. */
  edgeSensitivity?: number;
  /** RGB triplet, e.g. "40 80 80". */
  glowColor?: string;
  backgroundColor?: string;
  borderRadius?: number;
  glowRadius?: number;
  glowIntensity?: number;
  coneSpread?: number;
  animated?: boolean;
  colors?: string[];
  className?: string;
  style?: React.CSSProperties;
}

/**
 * A spotlight border: the container's edge lights up wherever the pointer
 * approaches. Used on the chat panel so the assistant reads as the centrepiece
 * of the dashboard.
 */
export function BorderGlow({
  children,
  edgeSensitivity = 30,
  glowColor = '37 99 235',
  backgroundColor = '#ffffff',
  borderRadius = 20,
  glowRadius = 40,
  glowIntensity = 1,
  coneSpread = 25,
  animated = false,
  colors = ['#2563eb', '#0ea5e9', '#6366f1'],
  className,
  style,
}: BorderGlowProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: -9999, y: -9999 });
  const [opacity, setOpacity] = useState(0);
  const [hue, setHue] = useState(0);

  useEffect(() => {
    if (!animated) return;
    const timer = window.setInterval(() => setHue(h => (h + 1) % 360), 50);
    return () => window.clearInterval(timer);
  }, [animated]);

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const node = containerRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const nearEdge =
      x < edgeSensitivity || y < edgeSensitivity || x > rect.width - edgeSensitivity || y > rect.height - edgeSensitivity;

    setPosition({ x, y });
    setOpacity(nearEdge ? glowIntensity : 0);
  };

  const gradient = `conic-gradient(from 180deg at ${position.x}px ${position.y}px, ${colors
    .map((color, index) => `${color} ${(index * coneSpread * 2) % 360}deg`)
    .join(', ')}, transparent 120deg)`;

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => setOpacity(0)}
      className={`relative overflow-hidden ${className ?? ''}`}
      style={{ borderRadius, background: backgroundColor, ...style }}
    >
      {/* Glow layer */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{
          opacity,
          borderRadius,
          padding: 1.5,
          background: animated
            ? `conic-gradient(from ${hue}deg, ${colors.join(', ')}, ${colors[0]})`
            : gradient,
          WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
          WebkitMaskComposite: 'xor',
          maskComposite: 'exclude',
          filter: `blur(${glowRadius / 10}px)`,
        }}
      />
      {/* Wider soft halo */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{
          opacity: opacity * 0.5,
          borderRadius,
          background: `radial-gradient(${glowRadius * 4}px circle at ${position.x}px ${position.y}px, rgba(${glowColor} / 0.18), transparent 65%)`,
        }}
      />
      <div className="relative" style={{ borderRadius: borderRadius - 1 }}>
        {children}
      </div>
    </div>
  );
}
