import { motion } from 'framer-motion';
import { SOLO_TOKENS } from '@/lib/soloTokens';
import { type EntropyPosition } from '@/hooks/useEntropy';

interface RerollPanelProps {
  position: EntropyPosition;
  /** Called when user clicks a single-param reroll button */
  onReroll: (paramIndex: 1 | 2 | 3 | 4 | 5) => void;
  /** Called when user clicks "REROLL ALL" button (full regeneration) */
  onRerollAll?: () => void;
  /** Is this a gainzy game? If so, leverage is locked */
  isGainzy?: boolean;
  /** Is direction locked? (PLAYER_CHOICE duel mode) */
  isDirectionLocked?: boolean;
  /** Is token locked? (specific feed selected) */
  isTokenLocked?: boolean;
  /** Mode label */
  mode?: 'solo' | 'duel';
}

const PARAM_LABELS: Record<number, { icon: string; label: string }> = {
  1: { icon: '🪙', label: 'TOKEN' },
  2: { icon: '📈', label: 'DIRECTION' },
  3: { icon: '⚡', label: 'LEVERAGE' },
  4: { icon: '🛑', label: 'STOP LOSS' },
  5: { icon: '🎯', label: 'TAKE PROFIT' },
};

export default function RerollPanel({
  position,
  onReroll,
  onRerollAll,
  isGainzy = false,
  isDirectionLocked = false,
  isTokenLocked = false,
  mode = 'solo',
}: RerollPanelProps) {
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
          🔗 {mode === 'duel' ? 'DUEL' : 'ENTROPY'} REROLLS
        </span>
        <span className={`font-display text-[8px] sm:text-[9px] tracking-wider ${rerollsLeft > 0 ? 'text-neon-green' : 'text-muted-foreground/50'
          }`}>
          {rerollsLeft}/{position.maxRerolls} LEFT
        </span>
      </div>

      {/* Single-param reroll buttons */}
      <div className="grid grid-cols-5 gap-1 sm:gap-1.5">
        {([1, 2, 3, 4, 5] as const).map((idx) => {
          const param = PARAM_LABELS[idx];
          const isDisabled = rerollsLeft <= 0
            || (isGainzy && idx === 3)           // Gainzy locks leverage
            || (isTokenLocked && idx === 1)       // Locked token
            || (isDirectionLocked && idx === 2);  // PLAYER_CHOICE locks direction

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
              <span className={`text-[8px] sm:text-[9px] font-bold tracking-wide ${isDisabled ? '' : 'text-neon-green'
                }`}>
                {values[idx]}
              </span>
            </motion.button>
          );
        })}
      </div>

      {/* REROLL ALL button — shown when onRerollAll is provided */}
      {onRerollAll && (
        <motion.button
          onClick={rerollsLeft > 0 ? onRerollAll : undefined}
          disabled={rerollsLeft <= 0}
          whileTap={rerollsLeft > 0 ? { scale: 0.95 } : {}}
          className={`
            w-full mt-2 py-2 border font-display text-[9px] sm:text-[10px]
            tracking-wider transition-all duration-150
            ${rerollsLeft <= 0
              ? 'border-muted-foreground/15 text-muted-foreground/30 cursor-not-allowed'
              : 'border-neon-green/40 text-neon-green hover:bg-neon-green/10 hover:border-neon-green/70 cursor-pointer active:bg-neon-green/20'
            }
          `}
          style={{ borderRadius: '2px' }}
        >
          🔄 REROLL ALL
        </motion.button>
      )}

      {/* Subtext */}
      <p className="font-display text-[6px] sm:text-[7px] text-muted-foreground/40 tracking-wider text-center mt-1.5">
        FREE · NO GAS · keccak256(seed, nonce)
      </p>
    </motion.div>
  );
}