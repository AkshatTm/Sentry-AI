/**
 * TiltCard — 3D mouse-tracked perspective tilt card
 *
 * Wraps any children in a div that tilts (up to ±maxTilt degrees) based on
 * where the mouse is relative to the card center. A specular highlight
 * tracks the mouse position. On hover exit, the card springs back to neutral.
 *
 * Usage:
 *   <TiltCard className="...">
 *     <YourContent />
 *   </TiltCard>
 */
"use client";

import { useRef, useState, useCallback, memo } from "react";
import { motion, useSpring, useTransform } from "framer-motion";

interface TiltCardProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  maxTilt?: number;
  scale?: number;
}

// ⚡ Bolt Performance Optimization:
// Memoized TiltCard to prevent re-renders on high-frequency websocket ticks.
// Note: Parent components must pass stable `children` references for this optimization to be effective.
export const TiltCard = memo(function TiltCard({
  children,
  className = "",
  style,
  maxTilt = 4,
  scale = 1.01,
}: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  // Spring-physics for smooth, natural return-to-neutral
  const springConfig = { stiffness: 200, damping: 20, mass: 0.5 };
  const rotateX = useSpring(0, springConfig);
  const rotateY = useSpring(0, springConfig);
  const scaleSpring = useSpring(1, springConfig);

  // Mouse position for specular highlight (0-100%)
  const [mousePos, setMousePos] = useState({ x: 50, y: 50 });

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      // Normalized -1 to +1
      const nx = (e.clientX - centerX) / (rect.width / 2);
      const ny = (e.clientY - centerY) / (rect.height / 2);

      rotateX.set(-ny * maxTilt);
      rotateY.set(nx * maxTilt);

      // Update specular highlight position (0-100%)
      setMousePos({
        x: ((e.clientX - rect.left) / rect.width) * 100,
        y: ((e.clientY - rect.top) / rect.height) * 100,
      });
    },
    [maxTilt, rotateX, rotateY]
  );

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
    scaleSpring.set(scale);
  }, [scale, scaleSpring]);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    rotateX.set(0);
    rotateY.set(0);
    scaleSpring.set(1);
  }, [rotateX, rotateY, scaleSpring]);

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={className}
      style={{
        ...style,
        rotateX,
        rotateY,
        scale: scaleSpring,
        transformPerspective: 1000,
        willChange: "transform",
        transformStyle: "preserve-3d",
        cursor: "default",
      }}
    >
      {/* Specular highlight — follows mouse */}
      {isHovered && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "inherit",
            pointerEvents: "none",
            background: `radial-gradient(circle at ${mousePos.x}% ${mousePos.y}%, rgba(255,255,255,0.055) 0%, transparent 60%)`,
            zIndex: 1,
            transition: "background 0.05s",
          }}
        />
      )}
      {children}
    </motion.div>
  );
});
