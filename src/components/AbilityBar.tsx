import { motion } from 'framer-motion';
import { type AbilityId, ABILITY_DEFS } from '@/hooks/useDuelAbilities';

interface AbilityBarProps {
  usedAbilities: Set<AbilityId>;
  onUse: (id: AbilityId) => void;
  canUse: (id: AbilityId) => boolean;
  disabled?: boolean;
}

// Styled icon containers with colors matching each ability
const ABILITY_STYLES: Record<AbilityId, { bg: string; border: string; text: string }> = {
  pyth_core:     { bg: 'bg-purple-500/15', border: 'border-purple-400/50', text: 'text-purple-400' },
  swap_self_dir: { bg: 'bg-neon-green/10',  border: 'border-neon-green/40', text: 'text-neon-green' },
  chainlink:     { bg: 'bg-blue-500/15',    border: 'border-blue-400/50',   text: 'text-blue-400' },
  redstone:      { bg: 'bg-red-500/15',     border: 'border-red-400/50',    text: 'text-red-400' },
  swap_opp_dir:  { bg: 'bg-neon-orange/10', border: 'border-neon-orange/40',text: 'text-neon-orange' },
  pirb_rage:     { bg: 'bg-neon-orange/15', border: 'border-neon-orange/50',text: 'text-neon-orange' },
};

export default function AbilityBar({ usedAbilities, onUse, canUse, disabled }: AbilityBarProps) {
  return (
    <div className="flex items-center gap-1 sm:gap-1.5 w-full overflow-x-auto py-0.5">
      {/* Divider: self */}
      <span className="text-[6px] font-display text-neon-green/50 tracking-wider shrink-0">YOU</span>

      {ABILITY_DEFS.filter(d => d.target === 'self').map(def => {
        const used = usedAbilities.has(def.id);
        const isDisabled = used || !canUse(def.id) || disabled;
        const style = ABILITY_STYLES[def.id];

        return (
          <motion.button
            key={def.id}
            onClick={() => !isDisabled && onUse(def.id)}
            disabled={isDisabled}
            whileTap={!isDisabled ? { scale: 0.85 } : {}}
            className={`
              flex items-center gap-1 py-1 px-1.5 sm:px-2 border shrink-0
              font-display text-[7px] sm:text-[8px] tracking-wider transition-all
              ${isDisabled
                ? 'border-muted-foreground/10 text-muted-foreground/20 cursor-not-allowed'
                : `${style.border} ${style.text} ${style.bg} hover:brightness-125 cursor-pointer`
              }
            `}
            style={{ borderRadius: '3px' }}
          >
            <span className="text-[10px] sm:text-xs leading-none">{def.icon}</span>
            <span className="hidden sm:inline">{def.name}</span>
            {used && <span className="text-[8px] opacity-40">✕</span>}
          </motion.button>
        );
      })}

      {/* Divider: attack */}
      <span className="text-[6px] font-display text-neon-orange/50 tracking-wider shrink-0 ml-1">ATK</span>

      {ABILITY_DEFS.filter(d => d.target === 'opponent').map(def => {
        const used = usedAbilities.has(def.id);
        const isDisabled = used || !canUse(def.id) || disabled;
        const style = ABILITY_STYLES[def.id];

        return (
          <motion.button
            key={def.id}
            onClick={() => !isDisabled && onUse(def.id)}
            disabled={isDisabled}
            whileTap={!isDisabled ? { scale: 0.85 } : {}}
            className={`
              flex items-center gap-1 py-1 px-1.5 sm:px-2 border shrink-0
              font-display text-[7px] sm:text-[8px] tracking-wider transition-all
              ${isDisabled
                ? 'border-muted-foreground/10 text-muted-foreground/20 cursor-not-allowed'
                : `${style.border} ${style.text} ${style.bg} hover:brightness-125 cursor-pointer`
              }
            `}
            style={{ borderRadius: '3px' }}
          >
            <span className="text-[10px] sm:text-xs leading-none">{def.icon}</span>
            <span className="hidden sm:inline">{def.name}</span>
            {used && <span className="text-[8px] opacity-40">✕</span>}
          </motion.button>
        );
      })}
    </div>
  );
}