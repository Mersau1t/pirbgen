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

export default function PixelConfetti({ active }: { active: boolean }) {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    if (!active) {
      setParticles([]);
      return;
    }
    const ps: Particle[] = [];
    for (let i = 0; i < 60; i++) {
      ps.push({
        id: i,
        x: 50 + (Math.random() - 0.5) * 20,
        y: 30,
        size: 4 + Math.random() * 8,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        rotation: Math.random() * 360,
        velocityX: (Math.random() - 0.5) * 80,
        velocityY: -(20 + Math.random() * 60),
        delay: Math.random() * 0.4,
      });
    }
    setParticles(ps);
  }, [active]);

  return (
    <AnimatePresence>
      {active && (
        <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
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
