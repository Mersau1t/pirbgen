import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  color: string;
  rotation: number;
  velocityX: number;
  velocityY: number;
  delay: number;
}

const COLORS = [
  'hsl(var(--neon-green))',
  'hsl(var(--neon-purple))',
  'hsl(var(--neon-orange))',
  'hsl(var(--neon-amber))',
];

const REKT_COLORS = [
  'hsl(var(--neon-red))',
  'hsl(0 80% 40%)',
  'hsl(var(--neon-orange))',
  'hsl(0 100% 30%)',
];

function createParticles(colors: string[], count: number, spread: number, yBase: number): Particle[] {
  const ps: Particle[] = [];
  for (let i = 0; i < count; i++) {
    ps.push({
      id: i,
      x: 50 + (Math.random() - 0.5) * spread,
      y: yBase,
      size: 4 + Math.random() * 8,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      velocityX: (Math.random() - 0.5) * 80,
      velocityY: -(20 + Math.random() * 60),
      delay: Math.random() * 0.4,
    });
  }
  return ps;
}

export default function PixelConfetti({ active, variant = 'win' }: { active: boolean; variant?: 'win' | 'rekt' }) {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    if (!active) {
      setParticles([]);
      return;
    }
    const colors = variant === 'rekt' ? REKT_COLORS : COLORS;
    setParticles(createParticles(colors, 60, 20, 30));
  }, [active, variant]);

  return (
    <AnimatePresence>
      {active && (
        <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
          {/* Red flash overlay for REKT */}
          {variant === 'rekt' && (
            <motion.div
              initial={{ opacity: 0.6 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 0.6 }}
              className="absolute inset-0 bg-neon-red/20"
            />
          )}
          {particles.map((p) => (
            <motion.div
              key={p.id}
              initial={{
                left: `${p.x}%`,
                top: `${p.y}%`,
                opacity: 1,
                rotate: 0,
                scale: 1,
              }}
              animate={{
                left: `${p.x + p.velocityX}%`,
                top: `${p.y - p.velocityY}%`,
                opacity: 0,
                rotate: p.rotation + 360,
                scale: 0.3,
              }}
              transition={{
                duration: 1.8 + Math.random() * 0.8,
                delay: p.delay,
                ease: [0.25, 0.46, 0.45, 0.94],
              }}
              className="absolute"
              style={{
                width: p.size,
                height: p.size,
                backgroundColor: p.color,
                imageRendering: 'pixelated',
                boxShadow: `0 0 6px ${p.color}`,
              }}
            />
          ))}
        </div>
      )}
    </AnimatePresence>
  );
}
