import { motion } from 'framer-motion';
import { type StreakData, getStreakMultiplier } from '@/lib/streaks';
import imgStreak from '@/assets/icons/streak.png';
import imgOnfire from '@/assets/icons/onfire.png';

interface StreakBadgeProps {
  streak: StreakData;
}

export default function StreakBadge({ streak }: StreakBadgeProps) {
  if (streak.current === 0 && streak.best === 0) return null;

  const mult = getStreakMultiplier(streak.current);
  const isHot = streak.current >= 3;
  const isOnFire = streak.current >= 5;

  return (
    <div className="flex items-center gap-3">
      {streak.current > 0 && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className={`flex items-center gap-1.5 px-3 py-1 border font-display text-[10px] tracking-wider ${
            isOnFire
              ? 'border-neon-orange/60 text-neon-orange bg-neon-orange/10'
              : isHot
              ? 'border-neon-orange/50 text-neon-orange bg-neon-orange/10'
              : 'border-neon-green/40 text-neon-green bg-neon-green/10'
          }`}
        >
          <motion.img
            src={isOnFire ? imgOnfire : imgStreak}
            alt=""
            width={16}
            height={16}
            style={{ imageRendering: 'pixelated' }}
            className="object-contain"
            animate={isHot ? { scale: [1, 1.2, 1] } : {}}
            transition={{ duration: 0.5, repeat: Infinity }}
          />
          <span>{streak.current} STREAK</span>
          {mult > 1 && <span className="text-neon-orange">×{mult.toFixed(1)}</span>}
        </motion.div>
      )}
      {streak.best > 1 && (
        <span className="text-[8px] font-display text-muted-foreground/50 tracking-wider">
          BEST: {streak.best}
        </span>
      )}
    </div>
  );
}