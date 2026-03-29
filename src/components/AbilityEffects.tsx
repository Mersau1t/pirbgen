import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { type AbilityEvent, type AbilityId, ABILITY_DEFS, PIRB_RAGE_DURATION } from '@/hooks/useDuelAbilities';
import pirbRageImg from '@/assets/pirb-rage.png';

const ORACLE_OVERLAY_DURATION = 5000;

interface AbilityEffectsProps {
  /** Latest ability event to animate */
  event: AbilityEvent | null;
  onEventClear: () => void;
  /** Is pirb rage currently active on this panel? */
  pirbRageActive: boolean;
  /** Active oracle source on this panel (for color overlay) */
  activeOracle: 'pyth' | 'chainlink' | 'redstone';
  /** 'full' = covers entire screen (opponent sees this), 'panel' = covers only this panel (I see this on opp chart) */
  pirbRageScope: 'full' | 'panel';
}

// ── Oracle color overlay — 5s blue (chainlink) or red (redstone) ─────
function OracleOverlay({ source }: { source: 'chainlink' | 'redstone' }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setVisible(true);
    const t = setTimeout(() => setVisible(false), ORACLE_OVERLAY_DURATION);
    return () => clearTimeout(t);
  }, [source]);

  if (!visible) return null;

  const color = source === 'chainlink'
    ? 'rgba(55, 138, 221, 0.15)'  // blue
    : 'rgba(226, 75, 74, 0.15)';  // red
  const border = source === 'chainlink'
    ? 'border-blue-400/30'
    : 'border-red-400/30';
  const label = source === 'chainlink' ? '⛓️ CHAINLINK' : '🔴 REDSTONE';
  const labelColor = source === 'chainlink' ? 'text-blue-400' : 'text-red-400';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={`absolute inset-0 z-20 pointer-events-none border-2 ${border}`}
      style={{ background: color }}
    >
      <motion.div
        className="absolute top-2 left-1/2 -translate-x-1/2"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: [0, 1, 1, 0], y: [-10, 0, 0, -10] }}
        transition={{ duration: ORACLE_OVERLAY_DURATION / 1000, times: [0, 0.1, 0.8, 1] }}
      >
        <span className={`font-display text-[10px] sm:text-xs tracking-wider ${labelColor}`}>
          {label} ACTIVE
        </span>
      </motion.div>
    </motion.div>
  );
}

// ── Pirb Rage — flying icons ─────────────────────────────────────────
function PirbRageOverlay({ scope }: { scope: 'full' | 'panel' }) {
  const [icons] = useState(() =>
    Array.from({ length: scope === 'full' ? 30 : 15 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 25 + Math.random() * 45,
      delay: Math.random() * 0.5,
      duration: 0.8 + Math.random() * 1.2,
      rotation: Math.random() * 360,
      dx: (Math.random() - 0.5) * 200,
      dy: (Math.random() - 0.5) * 200,
    }))
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.5 } }}
      className={`${scope === 'full' ? 'fixed inset-0 z-[100]' : 'absolute inset-0 z-50'} overflow-hidden pointer-events-auto`}
      style={{ background: 'rgba(0,0,0,0.35)' }}
    >
      <motion.div
        className="absolute inset-0 flex items-center justify-center z-10"
        animate={{ scale: [1, 1.1, 1] }}
        transition={{ duration: 0.5, repeat: Infinity }}
      >
        <span className={`font-display ${scope === 'full' ? 'text-3xl sm:text-5xl' : 'text-lg sm:text-2xl'} text-neon-orange text-glow-orange tracking-wider`}>
          💩 PIRBED! 💩
        </span>
      </motion.div>

      {icons.map(icon => (
        <motion.img
          key={icon.id}
          src={pirbRageImg}
          alt=""
          className="absolute"
          style={{ width: icon.size, height: icon.size, left: `${icon.x}%`, top: `${icon.y}%` }}
          initial={{ scale: 0, rotate: 0, x: 0, y: 0 }}
          animate={{
            scale: [0, 1.5, 1, 1.2],
            rotate: [0, icon.rotation, icon.rotation + 180],
            x: [0, icon.dx],
            y: [0, icon.dy],
            opacity: [0, 1, 1, 0.8],
          }}
          transition={{ duration: icon.duration, delay: icon.delay, repeat: Infinity, repeatDelay: 0.3 }}
        />
      ))}
    </motion.div>
  );
}

// ── Ability icon burst flash ─────────────────────────────────────────
function AbilityFlash({ abilityId }: { abilityId: AbilityId }) {
  const def = ABILITY_DEFS.find(a => a.id === abilityId);
  if (!def) return null;

  const particles = Array.from({ length: 8 }, (_, i) => ({
    id: i,
    angle: (i / 8) * Math.PI * 2,
    distance: 50 + Math.random() * 40,
    delay: i * 0.04,
  }));

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none"
    >
      <motion.div
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: [0, 2, 1.5], rotate: [-180, 0, 15, 0] }}
        transition={{ duration: 0.6, ease: 'backOut' }}
        className="text-3xl sm:text-5xl z-10"
      >
        {def.icon}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className={`absolute top-1/2 mt-10 font-display text-[10px] sm:text-sm tracking-wider ${
          def.target === 'opponent' ? 'text-neon-orange' : 'text-neon-green'
        }`}
      >
        {def.name}!
      </motion.div>

      {particles.map(p => (
        <motion.span
          key={p.id}
          className="absolute text-xl"
          initial={{ scale: 0, x: 0, y: 0 }}
          animate={{
            scale: [0, 1, 0],
            x: Math.cos(p.angle) * p.distance,
            y: Math.sin(p.angle) * p.distance,
            opacity: [0, 1, 0],
          }}
          transition={{ duration: 0.7, delay: p.delay }}
        >
          {def.icon}
        </motion.span>
      ))}
    </motion.div>
  );
}

// ── Main effects container ───────────────────────────────────────────
export default function AbilityEffects({
  event, onEventClear, pirbRageActive, activeOracle, pirbRageScope,
}: AbilityEffectsProps) {
  const [flashAbility, setFlashAbility] = useState<AbilityId | null>(null);
  const [oracleOverlay, setOracleOverlay] = useState<'chainlink' | 'redstone' | null>(null);

  // Show flash + oracle overlay when event arrives
  useEffect(() => {
    if (!event) return;

    setFlashAbility(event.abilityId);
    const t = setTimeout(() => { setFlashAbility(null); onEventClear(); }, 1200);

    // Trigger oracle overlay if applicable
    if (event.abilityId === 'chainlink' || event.abilityId === 'redstone') {
      setOracleOverlay(event.abilityId);
      setTimeout(() => setOracleOverlay(null), ORACLE_OVERLAY_DURATION);
    }

    return () => clearTimeout(t);
  }, [event, onEventClear]);

  // Also show oracle overlay when activeOracle changes (from external state)
  useEffect(() => {
    if (activeOracle !== 'pyth') {
      setOracleOverlay(activeOracle);
      const t = setTimeout(() => setOracleOverlay(null), ORACLE_OVERLAY_DURATION);
      return () => clearTimeout(t);
    }
  }, [activeOracle]);

  return (
    <>
      {/* Oracle color overlay — blue/red tint for 5s */}
      <AnimatePresence>
        {oracleOverlay && <OracleOverlay key={`oracle-${oracleOverlay}`} source={oracleOverlay} />}
      </AnimatePresence>

      {/* Pirb Rage */}
      <AnimatePresence>
        {pirbRageActive && <PirbRageOverlay key="pirb-rage" scope={pirbRageScope} />}
      </AnimatePresence>

      {/* Ability flash */}
      <AnimatePresence>
        {flashAbility && <AbilityFlash key={`flash-${flashAbility}-${Date.now()}`} abilityId={flashAbility} />}
      </AnimatePresence>
    </>
  );
}