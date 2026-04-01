import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { playCoinSound } from '@/lib/sounds';
import iconPirb from '@/assets/icons/icon_pirb.png';

// ── Auto-load screenshots from src/assets/guide/ ────────────────────
// Just drop PNG/JPG/WebP files into that folder — they appear automatically.
// Naming: solo-classic.png, duel-lobby.png, etc. (see SCREEN_NAMES below)
// Format: PNG, JPG, or WebP — any works. Recommended width: ~800px.
const guideImages = import.meta.glob<{ default: string }>(
  '/src/assets/guide/*.{png,jpg,jpeg,webp}',
  { eager: true }
);

function getScreen(name: string): string | null {
  for (const [path, mod] of Object.entries(guideImages)) {
    const filename = path.split('/').pop()?.replace(/\.\w+$/, '');
    if (filename === name) return mod.default;
  }
  return null;
}

// ── Types ────────────────────────────────────────────────────────────

type SectionId = 'solo' | 'duel' | 'abilities' | 'reroll' | 'rarity' | 'gainzy';

const SECTIONS: { id: SectionId; icon: string; title: string; color: string }[] = [
  { id: 'solo',      icon: '🎮', title: 'SOLO MODE',    color: 'neon-purple' },
  { id: 'duel',      icon: '⚔️', title: 'PVP DUEL',     color: 'neon-green' },
  { id: 'abilities', icon: '💥', title: 'ABILITIES',    color: 'neon-orange' },
  { id: 'reroll',    icon: '🔄', title: 'REROLLS',      color: 'neon-purple' },
  { id: 'rarity',    icon: '💎', title: 'RARITY & LEV', color: 'neon-green' },
  { id: 'gainzy',    icon: '🔥', title: 'GAINZY MODE',  color: 'neon-orange' },
];

// ── Components ───────────────────────────────────────────────────────

function ScreenshotBox({ name, caption }: { name: string; caption?: string }) {
  const src = getScreen(name);
  if (!src) return null; // No file → don't show anything
  return (
    <div className="my-3">
      <div className="border-2 border-neon-purple/30 rounded-sm overflow-hidden bg-background/50">
        <img src={src} alt={caption || name} className="w-full h-auto object-contain" draggable={false} />
      </div>
      {caption && (
        <p className="text-[8px] sm:text-[9px] text-muted-foreground/60 font-display tracking-wider text-center mt-1">{caption}</p>
      )}
    </div>
  );
}

function GuideItem({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex items-start gap-2 py-1">
      <span className="text-sm shrink-0 mt-0.5">{icon}</span>
      <span className="text-[10px] sm:text-xs text-muted-foreground font-mono leading-relaxed">{text}</span>
    </div>
  );
}

function RarityBadge({ name, color, range }: { name: string; color: string; range: string }) {
  return (
    <div className={`flex items-center justify-between px-3 py-2 border border-${color}/30 bg-${color}/5 rounded-sm`}>
      <span className={`font-display text-[10px] sm:text-xs tracking-wider text-${color}`}>{name}</span>
      <span className="font-mono text-[9px] sm:text-[10px] text-muted-foreground">{range}</span>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────

export default function Guide() {
  const [activeSection, setActiveSection] = useState<SectionId>('solo');

  return (
    <div className="h-screen bg-background grid-bg scanlines crt-vignette flex flex-col overflow-hidden">
      {/* Header */}
      <header className="relative z-10 border-b-2 border-neon-purple/40 bg-background/90 shrink-0">
        <div className="max-w-4xl mx-auto flex items-center justify-center px-3 sm:px-4 py-2 sm:py-3 relative min-h-[56px]">
          <Link to="/" onClick={() => playCoinSound()} className="font-display text-sm text-muted-foreground hover:text-neon-purple transition-colors absolute left-3 sm:left-4 z-10">
            ← BACK
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <img src={iconPirb} alt="PIRBGEN" width={36} height={36} className="object-contain shrink-0" />
            <span className="font-display text-[8px] sm:text-xs tracking-[0.3em] text-neon-purple text-glow-purple">HOW TO PLAY</span>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <nav className="shrink-0 border-b border-neon-purple/20 bg-background/80 overflow-x-auto">
        <div className="max-w-4xl mx-auto flex gap-1 px-2 py-1.5">
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => { playCoinSound(); setActiveSection(s.id); }}
              className={`shrink-0 flex items-center gap-1 px-2 sm:px-3 py-1 sm:py-1.5 border font-display text-[8px] sm:text-[9px] tracking-wider transition-all ${
                activeSection === s.id
                  ? `border-${s.color}/60 text-${s.color} bg-${s.color}/10`
                  : 'border-border/20 text-muted-foreground/50 hover:text-muted-foreground hover:border-border/40'
              }`}
              style={{ borderRadius: '2px' }}
            >
              <span className="text-xs">{s.icon}</span>
              <span className="hidden sm:inline">{s.title}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Content — 125% on laptops */}
      <main className="flex-1 overflow-y-auto relative z-10" style={{ scrollbarWidth: 'none' }}>
        <style>{`
          @media (min-width: 1024px) and (max-width: 1536px) {
            .guide-content { transform: scale(1.25); transform-origin: top center; padding-bottom: 25%; }
          }
        `}</style>
        <div className="max-w-2xl mx-auto px-4 py-4 sm:py-6 space-y-4">
          <div className="guide-content">

          {/* ═══ SOLO MODE ═══ */}
          {activeSection === 'solo' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <div className="text-center">
                <h2 className="font-display text-xl sm:text-2xl text-neon-purple text-glow-purple tracking-wider">🎮 SOLO MODE</h2>
                <p className="text-[10px] sm:text-xs text-muted-foreground font-mono mt-2">Trade solo against the market. Hit TP to win, SL to get PIRBED.</p>
              </div>

              <div className="glass-panel rounded-sm p-4 space-y-2">
                <h3 className="font-display text-sm text-neon-green tracking-wider">⚡ CLASSIC MODE</h3>
                <GuideItem icon="🎲" text="Press GENERATE — random token, direction, leverage, SL and TP are assigned" />
                <GuideItem icon="📈" text="Price streams in real-time from Pyth Network oracles" />
                <GuideItem icon="🎯" text="If PnL reaches Take Profit — YOU WIN!" />
                <GuideItem icon="💀" text="If PnL drops to Stop Loss — PIRBED! (you lose)" />
                <GuideItem icon="⚡" text="You can CLOSE position early at any time to lock in current PnL" />
                <ScreenshotBox name="solo-classic" caption="Classic mode — generating a position" />
              </div>

              <div className="glass-panel rounded-sm p-4 space-y-2">
                <h3 className="font-display text-sm text-neon-purple tracking-wider">🔗 ENTROPY MODE</h3>
                <GuideItem icon="🔮" text="Requires Base wallet — pays small Pyth Entropy fee (~0.0001 ETH)" />
                <GuideItem icon="⛓️" text="Position parameters are generated ON-CHAIN via Pyth Entropy VRF" />
                <GuideItem icon="🔄" text="Get 3 FREE rerolls before playing and 3 after (see REROLLS section)" />
                <GuideItem icon="✅" text="Provably fair — seed is verifiable on-chain via keccak256" />
                <ScreenshotBox name="solo-entropy" caption="Entropy mode — on-chain seed generation" />
              </div>
            </motion.div>
          )}

          {/* ═══ PVP DUEL ═══ */}
          {activeSection === 'duel' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <div className="text-center">
                <h2 className="font-display text-xl sm:text-2xl text-neon-green text-glow-green tracking-wider">⚔️ PVP DUEL</h2>
                <p className="text-[10px] sm:text-xs text-muted-foreground font-mono mt-2">1v1 against another player. Different tokens, 60 seconds, higher PnL wins.</p>
              </div>

              <div className="glass-panel rounded-sm p-4 space-y-2">
                <h3 className="font-display text-sm text-neon-green tracking-wider">📋 HOW IT WORKS</h3>
                <GuideItem icon="1️⃣" text="CREATE ROOM — you get a 6-letter room code" />
                <GuideItem icon="2️⃣" text="Share the code with your opponent" />
                <GuideItem icon="3️⃣" text="Opponent enters the code and joins" />
                <GuideItem icon="4️⃣" text="Both players get DIFFERENT random tokens and positions" />
                <GuideItem icon="5️⃣" text="60-second timer starts — trade simultaneously" />
                <GuideItem icon="6️⃣" text="After timer or both close — highest PnL wins!" />
                <ScreenshotBox name="duel-lobby" caption="Duel lobby — creating a room" />
              </div>

              <div className="glass-panel rounded-sm p-4 space-y-2">
                <h3 className="font-display text-sm text-neon-orange tracking-wider">🔁 REMATCH SYSTEM</h3>
                <GuideItem icon="⚔️" text="After a duel ends, press REMATCH to challenge your opponent again" />
                <GuideItem icon="📣" text="Your opponent sees 'WANTS REMATCH!' notification with a glowing ACCEPT button" />
                <GuideItem icon="⏱️" text="15 seconds to accept — if no response, rematch times out" />
                <GuideItem icon="🚪" text="If opponent leaves, you'll see 'DISCONNECTED'" />
                <GuideItem icon="🏆" text="In entropy mode: choose Best of 1 or Best of 3 before creating the room" />
                <ScreenshotBox name="duel-arena" caption="Live duel — split screen view" />
              </div>

              <div className="glass-panel rounded-sm p-4 space-y-2">
                <h3 className="font-display text-sm text-neon-purple tracking-wider">🔗 ENTROPY DUEL</h3>
                <GuideItem icon="🔮" text="Both players get on-chain entropy seeds from Pyth VRF" />
                <GuideItem icon="🔄" text="15-second reroll phase before the match starts" />
                <GuideItem icon="⏱️" text="If you don't confirm in 15s — position auto-confirms" />
                <GuideItem icon="⚔️" text="Best of 1 or Best of 3 — select before creating" />
              </div>
            </motion.div>
          )}

          {/* ═══ ABILITIES ═══ */}
          {activeSection === 'abilities' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <div className="text-center">
                <h2 className="font-display text-xl sm:text-2xl text-neon-orange text-glow-orange tracking-wider">💥 ABILITIES</h2>
                <p className="text-[10px] sm:text-xs text-muted-foreground font-mono mt-2">Special mode in duels. Use power-ups on yourself or sabotage your opponent.</p>
              </div>

              <div className="glass-panel rounded-sm p-4 space-y-2">
                <h3 className="font-display text-sm text-neon-green tracking-wider">🛡️ SELF ABILITIES (buffs)</h3>
                <GuideItem icon="🔮" text="PYTH CORE — Reset your price feed back to Pyth Hermes. Counters Chainlink/Redstone attacks." />
                <GuideItem icon="🔄" text="FLIP SELF — Swap your direction LONG↔SHORT. Your PnL inverts (+15% becomes -15%)." />
              </div>

              <div className="glass-panel rounded-sm p-4 space-y-2">
                <h3 className="font-display text-sm text-neon-orange tracking-wider">⚔️ ATTACK ABILITIES (debuffs)</h3>
                <GuideItem icon="⛓️" text="CHAINLINK — Switch opponent's price feed to Chainlink API. Screen turns BLUE for 5s. If token not supported — price FREEZES." />
                <GuideItem icon="🔴" text="REDSTONE — Switch opponent's price feed to Redstone API. Screen turns RED for 5s. If token not supported — price FREEZES." />
                <GuideItem icon="↕️" text="FLIP OPP — Swap opponent's direction. Their LONG becomes SHORT and PnL inverts instantly." />
                <GuideItem icon="💩" text="PIRB RAGE — 5 seconds of chaos! Pirb icons cover opponent's ENTIRE screen. They CAN'T close their position during this time." />
                <ScreenshotBox name="abilities-bar" caption="Ability bar during a duel match" />
                <ScreenshotBox name="abilities-rage" caption="Pirb Rage — opponent's screen covered!" />
              </div>

              <div className="glass-panel rounded-sm p-4 space-y-2">
                <h3 className="font-display text-sm text-muted-foreground tracking-wider">📜 RULES</h3>
                <GuideItem icon="1️⃣" text="Each ability can be used ONCE per game (Bo1) or ONCE per match (Bo3)" />
                <GuideItem icon="⏱️" text="Abilities can be used any time during the 60-second match" />
                <GuideItem icon="🛡️" text="PYTH CORE counters Chainlink and Redstone — resets feed back to normal" />
                <GuideItem icon="🛢️" text="PYTHOIL token is Pyth-exclusive — Chainlink/Redstone will always freeze it" />
                <GuideItem icon="💥" text="Enable ABILITIES mode before creating a duel room" />
              </div>
            </motion.div>
          )}

          {/* ═══ REROLLS ═══ */}
          {activeSection === 'reroll' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <div className="text-center">
                <h2 className="font-display text-xl sm:text-2xl text-neon-purple text-glow-purple tracking-wider">🔄 REROLL SYSTEM</h2>
                <p className="text-[10px] sm:text-xs text-muted-foreground font-mono mt-2">Tweak your position before and after each trade. Free, no gas — powered by keccak256.</p>
              </div>

              <div className="glass-panel rounded-sm p-4 space-y-2">
                <h3 className="font-display text-sm text-neon-green tracking-wider">🎲 PRE-GAME REROLLS (3)</h3>
                <GuideItem icon="🪙" text="TOKEN — Change which token you're trading" />
                <GuideItem icon="📈" text="DIRECTION — Flip between LONG and SHORT" />
                <GuideItem icon="⚡" text="LEVERAGE — Reroll your leverage multiplier" />
                <GuideItem icon="🛑" text="STOP LOSS — Reroll your stop loss percentage" />
                <GuideItem icon="🎯" text="TAKE PROFIT — Reroll your take profit percentage" />
                <p className="text-[9px] text-neon-purple/70 font-mono mt-2">Each reroll changes ONE parameter. You get 3 total.</p>
                <ScreenshotBox name="reroll-pre" caption="Pre-game reroll panel — tap any parameter" />
              </div>

              <div className="glass-panel rounded-sm p-4 space-y-2">
                <h3 className="font-display text-sm text-neon-orange tracking-wider">🔁 POST-GAME REROLLS (3)</h3>
                <GuideItem icon="🔄" text="After a game ends, you can reroll your ENTIRE position (all parameters change)" />
                <GuideItem icon="3️⃣" text="3 full rerolls available — each generates completely new params from the same seed" />
                <GuideItem icon="🔗" text="All derived from your on-chain Entropy seed — provably random" />
                <GuideItem icon="🆕" text="After all 3 post-rerolls, press GENERATE (NEW SEED) for a fresh on-chain seed" />
                <ScreenshotBox name="reroll-post" caption="Post-game — REROLL or GENERATE NEW SEED" />
              </div>

              <div className="glass-panel rounded-sm p-4 space-y-2">
                <h3 className="font-display text-sm text-muted-foreground tracking-wider">⚔️ DUEL REROLLS</h3>
                <GuideItem icon="⏱️" text="In entropy duels: 15-second reroll phase before match starts" />
                <GuideItem icon="🔄" text="Reroll individual params OR use REROLL ALL for full regeneration" />
                <GuideItem icon="⚡" text="If timer expires — position auto-confirms and match begins" />
              </div>
            </motion.div>
          )}

          {/* ═══ RARITY & LEVERAGE ═══ */}
          {activeSection === 'rarity' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <div className="text-center">
                <h2 className="font-display text-xl sm:text-2xl text-neon-green text-glow-green tracking-wider">💎 RARITY & LEVERAGE</h2>
                <p className="text-[10px] sm:text-xs text-muted-foreground font-mono mt-2">5 rarity tiers based on leverage. Higher rarity = wilder rides.</p>
              </div>

              <div className="glass-panel rounded-sm p-4 space-y-2">
                <h3 className="font-display text-sm text-muted-foreground tracking-wider">📊 RARITY TIERS</h3>
                <div className="space-y-1.5 mt-2">
                  <RarityBadge name="COMMON"    color="muted-foreground" range="20× — 55×" />
                  <RarityBadge name="UNCOMMON"  color="blue-400"         range="56× — 90×" />
                  <RarityBadge name="RARE"      color="neon-green"       range="91× — 130×" />
                  <RarityBadge name="EPIC"      color="neon-orange"      range="131× — 170×" />
                  <RarityBadge name="LEGENDARY" color="neon-purple"      range="171× — 200×" />
                </div>
                <ScreenshotBox name="rarity-table" caption="Position card with rarity badge" />
              </div>

              <div className="glass-panel rounded-sm p-4 space-y-2">
                <h3 className="font-display text-sm text-neon-orange tracking-wider">⚡ HOW LEVERAGE WORKS</h3>
                <GuideItem icon="📈" text="Leverage multiplies your PnL. 100× leverage = 1% price move → 100% PnL change" />
                <GuideItem icon="💀" text="Higher leverage = faster wins AND faster losses" />
                <GuideItem icon="🎯" text="Stop Loss and Take Profit are also randomized based on rarity tier" />
                <GuideItem icon="🔗" text="In Entropy mode, rarity is determined on-chain by the smart contract" />
              </div>

              <div className="glass-panel rounded-sm p-4 space-y-2">
                <h3 className="font-display text-sm text-neon-purple tracking-wider">🎲 PROBABILITY</h3>
                <div className="grid grid-cols-5 gap-1 mt-2">
                  {[
                    { name: 'COM', pct: '30%', color: 'text-muted-foreground' },
                    { name: 'UNC', pct: '25%', color: 'text-blue-400' },
                    { name: 'RAR', pct: '22%', color: 'text-neon-green' },
                    { name: 'EPI', pct: '15%', color: 'text-neon-orange' },
                    { name: 'LEG', pct: '8%',  color: 'text-neon-purple' },
                  ].map(r => (
                    <div key={r.name} className="text-center">
                      <p className={`font-display text-[9px] sm:text-[10px] ${r.color}`}>{r.name}</p>
                      <p className="font-mono text-[10px] sm:text-xs text-foreground">{r.pct}</p>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* ═══ GAINZY MODE ═══ */}
          {activeSection === 'gainzy' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <div className="text-center">
                <h2 className="font-display text-xl sm:text-2xl text-neon-orange text-glow-orange tracking-wider">🔥 GAINZY MODE</h2>
                <p className="text-[10px] sm:text-xs text-muted-foreground font-mono mt-2">Maximum degen. 200× leverage locked. Only for the brave.</p>
              </div>

              <div className="glass-panel rounded-sm p-4 space-y-2">
                <h3 className="font-display text-sm text-neon-orange tracking-wider">💀 WHAT IS GAINZY?</h3>
                <GuideItem icon="⚡" text="Leverage is LOCKED at 200× — the maximum possible" />
                <GuideItem icon="🎯" text="Tight stop loss (3-5%) and huge take profit (up to 100%+)" />
                <GuideItem icon="🎲" text="Token and direction are still random" />
                <GuideItem icon="💎" text="Always LEGENDARY rarity" />
                <GuideItem icon="💀" text="Extremely high risk — small price moves = massive PnL swings" />
                <ScreenshotBox name="gainzy-200x" caption="Gainzy mode — 200× leverage" />
              </div>

              <div className="glass-panel rounded-sm p-4 space-y-2">
                <h3 className="font-display text-sm text-neon-green tracking-wider">🏆 WHY PLAY GAINZY?</h3>
                <GuideItem icon="🚀" text="Highest possible PnL — if you win, the numbers are massive" />
                <GuideItem icon="📊" text="Leaderboard glory — top Gainzy wins stand out" />
                <GuideItem icon="😈" text="Pure degen energy — this is what PIRBGEN was made for" />
                <GuideItem icon="🔗" text="Available in both Classic and Entropy modes" />
              </div>
            </motion.div>
          )}

          {/* Footer */}
          <div className="text-center py-6">
            <p className="font-display text-[8px] text-muted-foreground/40 tracking-wider">
              PIRBGEN — POWERED BY PYTH NETWORK · BASE L2
            </p>
          </div>

          </div>
        </div>
      </main>
    </div>
  );
}