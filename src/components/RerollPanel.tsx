import { motion } from 'framer-motion';
import { SOLO_TOKENS } from '@/lib/soloTokens';
import { type EntropyPosition } from '@/hooks/useEntropy';

interface RerollPanelProps {
  position: EntropyPosition;
  /** Called when user clicks a reroll button. Parent does the actual reroll via entropy.reroll() */
  onReroll: (paramIndex: 1 | 2 | 3 | 4 | 5) => void;
  /** Is this a gainzy game? If so, leverage/rarity are locked */
  isGainzy?: boolean;
}

const PARAM_LABELS: Record<number, { icon: string; label: string; key: string }> = {
  1: { icon: '🪙', label: 'TOKEN', key: 'token' },
  2: { icon: '📈', label: 'DIRECTION', key: 'direction' },
  3: { icon: '⚡', label: 'LEVERAGE', key: 'leverage' },
  4: { icon: '🛑', label: 'STOP LOSS', key: 'stopLoss' },
  5: { icon: '🎯', label: 'TAKE PROFIT', key: 'takeProfit' },
};

export default function RerollPanel({ position, onReroll, isGainzy = false }: RerollPanelProps) {
  const rerollsLeft = position.maxRerolls - position.rerollsUsed;
  const token = SOLO_TOKENS[position.tokenIndex] || SOLO_TOKENS[0];

  // Current values for display
  const values: Record<number, string> = {
    1: token.ticker,
    2: position.direction,
    3: `${position.leverage}×`,
    4: `-${position.stopLoss}%`,
    5: `+${position.takeProfit}%`,
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-md mx-auto"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="font-display text-[8px] sm:text-[9px] text-neon-purple tracking-wider">
          🔗 ENTROPY REROLLS
        </span>
        <span className={`font-display text-[8px] sm:text-[9px] tracking-wider ${
          rerollsLeft > 0 ? 'text-neon-green' : 'text-muted-foreground/50'
        }`}>
          {rerollsLeft}/{position.maxRerolls} LEFT
        </span>
      </div>

      {/* Reroll buttons grid */}
      <div className="grid grid-cols-5 gap-1 sm:gap-1.5">
        {([1, 2, 3, 4, 5] as const).map((idx) => {
          const param = PARAM_LABELS[idx];
          const isDisabled = rerollsLeft <= 0
            || (isGainzy && idx === 3);  // Gainzy locks leverage at 200×

          return (
            <motion.button
              key={idx}
              onClick={() => !isDisabled && onReroll(idx)}
              disabled={isDisabled}
              whileTap={!isDisabled ? { scale: 0.92 } : {}}
              className={`
                flex flex-col items-center gap-0.5 py-1.5 sm:py-2 px-1
                border font-display text-center transition-all duration-150
                ${isDisabled
                  ? 'border-muted-foreground/15 text-muted-foreground/30 cursor-not-allowed'
                  : 'border-neon-purple/40 text-neon-purple hover:bg-neon-purple/10 hover:border-neon-purple/70 cursor-pointer active:bg-neon-purple/20'
                }
              `}
              style={{ borderRadius: '2px' }}
            >
              <span className="text-[10px] sm:text-xs">{param.icon}</span>
              <span className="text-[6px] sm:text-[7px] tracking-wider opacity-60">{param.label}</span>
              <span className={`text-[8px] sm:text-[9px] font-bold tracking-wide ${
                isDisabled ? '' : 'text-neon-green'
              }`}>
                {values[idx]}
              </span>
            </motion.button>
          );
        })}
      </div>

      {/* Subtext */}
      <p className="font-display text-[6px] sm:text-[7px] text-muted-foreground/40 tracking-wider text-center mt-1.5">
        FREE · NO GAS · keccak256(seed, nonce)
      </p>
    </motion.div>
  );
}
