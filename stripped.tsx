import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { usePublicClient } from 'wagmi';

const IMG = {
<LONG LINE STRIPPED>
<LONG LINE STRIPPED>
<LONG LINE STRIPPED>
<LONG LINE STRIPPED>
<LONG LINE STRIPPED>
<LONG LINE STRIPPED>
<LONG LINE STRIPPED>
<LONG LINE STRIPPED>
<LONG LINE STRIPPED>
<LONG LINE STRIPPED>
<LONG LINE STRIPPED>
<LONG LINE STRIPPED>
<LONG LINE STRIPPED>
<LONG LINE STRIPPED>
<LONG LINE STRIPPED>
<LONG LINE STRIPPED>
<LONG LINE STRIPPED>
<LONG LINE STRIPPED>
<LONG LINE STRIPPED>
<LONG LINE STRIPPED>
<LONG LINE STRIPPED>
<LONG LINE STRIPPED>
};

/* ═══ TYPES ═══ */
type OSpec = {
  key: string; name: string; color: string;
  rate: string; note: string;
  realRate: number;
  updatesPerPoop: number;
  imgStatic: string; imgOpen: string; imgPoop: string; imgSqueeze?: string; imgSofa?: string;
  live?: boolean; // true = use real API, false = mockup math
};

/* ═══ STANDARD (free) — LIVE API, 1 poop = 1 update ═══ */
const STANDARD_ORACLES: OSpec[] = [
  { key:'pythCore', name:'Pyth Core', color:'#7c3aed', rate:'2.5/s', note:'~400ms',
    realRate:2.5, updatesPerPoop:1, live:true,
    imgStatic:IMG.coreStatic, imgOpen:IMG.coreOpen, imgPoop:IMG.corePoop, imgSqueeze:IMG.coreSqueeze, imgSofa:IMG.coreSofa },
  { key:'chainlink', name:'Chainlink', color:'#375BD2', rate:'0.05/s', note:'~20s',
    realRate:0.05, updatesPerPoop:1, live:true,
    imgStatic:IMG.clStatic, imgOpen:IMG.clOpen, imgPoop:IMG.clPoop },
  { key:'redstone', name:'RedStone', color:'#ef4444', rate:'0.1/s', note:'~10s',
    realRate:0.1, updatesPerPoop:1, live:true,
    imgStatic:IMG.rsStatic, imgOpen:IMG.rsOpen, imgPoop:IMG.rsPoop },
];

/* ═══ PAID (premium) — MOCKUP, 1 poop = 500 updates ═══ */
const PAID_ORACLES: OSpec[] = [
  { key:'pythPro', name:'Pyth Pro', color:'#a855f7', rate:'1,000/s', note:'1ms ⚡',
    realRate:1000, updatesPerPoop:500,
    imgStatic:IMG.proStatic, imgOpen:IMG.proOpen, imgPoop:IMG.proPoop, imgSqueeze:IMG.proSqueeze, imgSofa:IMG.proSofa },
  { key:'clStreams', name:'CL Streams', color:'#2563eb', rate:'2/s', note:'~500ms',
    realRate:2, updatesPerPoop:500,
    imgStatic:IMG.clsStatic, imgOpen:IMG.clsOpen, imgPoop:IMG.clsPoop },
  { key:'rsBolt', name:'RS Bolt', color:'#f97316', rate:'400/s', note:'2.5ms ⚡',
    realRate:400, updatesPerPoop:500,
    imgStatic:IMG.rsbStatic, imgOpen:IMG.rsbOpen, imgPoop:IMG.rsbPoop },
];

/* ═══ API CONFIG — BTC/USD for all oracles ═══ */
// Pyth BTC/USD price feed ID
const PYTH_BTC_USD = '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43';
const PYTH_HERMES_SSE = `https://hermes.pyth.network/v2/updates/price/stream?ids[]=${PYTH_BTC_USD}&parsed=true&allow_unordered=true&benchmarks_only=false`;

// Chainlink BTC/USD Aggregator on Ethereum mainnet
const CHAINLINK_BTC_USD = '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c' as const;

// RedStone off-chain cache-layer API (public, no auth, CORS-friendly)
const REDSTONE_API = 'https://api.redstone.finance/prices?symbol=BTC&provider=redstone&limit=1';

// Chainlink AggregatorV3 ABI (only latestRoundData)
const AGGREGATOR_ABI = [
  {
    name: 'latestRoundData',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'roundId', type: 'uint80' },
      { name: 'answer', type: 'int256' },
      { name: 'startedAt', type: 'uint256' },
      { name: 'updatedAt', type: 'uint256' },
      { name: 'answeredInRound', type: 'uint80' },
    ],
  },
] as const;

interface Poop { id:number; x:number; y:number; landed:boolean; rot:number; scale:number; }
const POOP_W = 64;
const POOP_H = 32;
const FLIGHT = 500;
const SOFA_H = 50;
const MH = 100;

/* ═══ LIVE DATA — shared return type ═══ */
type LiveData = {
  countRef: React.MutableRefObject<number>;
  status: 'connecting' | 'live' | 'error';
  measuredRate: string; // e.g. "2.4/s" or "1/45s"
  lastPrice: string;
};

/** Pyth Core — SSE stream from Hermes */
function usePythLive(): LiveData {
  const countRef = useRef(0);
  const [status, setStatus] = useState<LiveData['status']>('connecting');
  const [measuredRate, setMeasuredRate] = useState('—');
  const [lastPrice, setLastPrice] = useState('—');
  const esRef = useRef<EventSource | null>(null);
  const rateWindowRef = useRef<number[]>([]);

  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout>;

    const connect = () => {
      try {
        setStatus('connecting');
        const es = new EventSource(PYTH_HERMES_SSE);
        esRef.current = es;
        es.onopen = () => setStatus('live');
        es.onmessage = (evt) => {
          countRef.current++;
          const now = Date.now();
          rateWindowRef.current.push(now);
          // Keep last 30s window
          rateWindowRef.current = rateWindowRef.current.filter(t => now - t < 30000);
          const secs = Math.max(1, (now - rateWindowRef.current[0]) / 1000);
          const rate = rateWindowRef.current.length / secs;
          setMeasuredRate(rate >= 1 ? `${rate.toFixed(1)}/s` : `1/${(1/rate).toFixed(0)}s`);
          // Parse price from SSE data
          try {
            const d = JSON.parse(evt.data);
            const p = d?.parsed?.[0]?.price;
            if (p) {
              const val = Number(p.price) * Math.pow(10, p.expo);
              setLastPrice('$' + val.toFixed(2));
            }
          } catch {}
        };
        es.onerror = () => {
          es.close();
          esRef.current = null;
          setStatus('error');
          reconnectTimer = setTimeout(connect, 3000);
        };
      } catch { setStatus('error'); }
    };

    connect();
    return () => { esRef.current?.close(); clearTimeout(reconnectTimer); };
  }, []);

  return { countRef, status, measuredRate, lastPrice };
}

/** Chainlink — wagmi publicClient polling */
function useChainlinkLive(): LiveData {
  const countRef = useRef(0);
  const [status, setStatus] = useState<LiveData['status']>('connecting');
  const [measuredRate, setMeasuredRate] = useState('—');
  const [lastPrice, setLastPrice] = useState('—');
  const lastUpdatedAtRef = useRef<bigint>(0n);
  const firstPollDoneRef = useRef(false);
  const lastChangeTimeRef = useRef(0);
  const publicClient = usePublicClient({ chainId: 1 });

  useEffect(() => {
    if (!publicClient) return;

    const poll = async () => {
      try {
        const data = await publicClient.readContract({
          address: CHAINLINK_BTC_USD,
          abi: AGGREGATOR_ABI,
          functionName: 'latestRoundData',
        } as any);
        const updatedAt = data[3] as bigint;
        const answer = data[1] as bigint;

        if (answer > 0n) {
          const price = Number(answer) / 1e8;
          setLastPrice('$' + price.toFixed(2));
        }

        if (!firstPollDoneRef.current) {
          firstPollDoneRef.current = true;
          lastUpdatedAtRef.current = updatedAt;
          setStatus('live');
          // Show time since last on-chain update
          const secAgo = Math.floor(Date.now() / 1000) - Number(updatedAt);
          if (secAgo < 120) setMeasuredRate(`${secAgo}s ago`);
          else setMeasuredRate(`${Math.floor(secAgo / 60)}m ago`);
          return;
        }

        if (updatedAt !== lastUpdatedAtRef.current) {
          countRef.current++;
          const now = Date.now();
          if (lastChangeTimeRef.current > 0) {
            const gap = (now - lastChangeTimeRef.current) / 1000;
            setMeasuredRate(`1/${gap.toFixed(0)}s`);
          }
          lastChangeTimeRef.current = now;
          lastUpdatedAtRef.current = updatedAt;
        } else {
          // Still connected, show waiting time
          const secAgo = Math.floor(Date.now() / 1000) - Number(updatedAt);
          if (secAgo < 120) setMeasuredRate(`${secAgo}s ago`);
          else setMeasuredRate(`${Math.floor(secAgo / 60)}m ago`);
        }
      } catch (e) {
        console.warn('[Chainlink] poll error:', e);
        setStatus('error');
      }
    };

    poll();
    const id = setInterval(poll, 15000);
    return () => clearInterval(id);
  }, [publicClient]);

  return { countRef, status, measuredRate, lastPrice };
}

/** RedStone — off-chain API polling */
function useRedstoneLive(): LiveData {
  const countRef = useRef(0);
  const [status, setStatus] = useState<LiveData['status']>('connecting');
  const [measuredRate, setMeasuredRate] = useState('—');
  const [lastPrice, setLastPrice] = useState('—');
  const lastTimestampRef = useRef(0);
  const lastChangeTimeRef = useRef(0);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(REDSTONE_API);
        const json = await res.json();
        const entry = Array.isArray(json) ? json[0] : json;
        const ts = entry?.timestamp || entry?.liteEvmTimestamp || 0;
        const val = entry?.value || entry?.price || 0;

        if (val > 0) setLastPrice('$' + Number(val).toFixed(2));
        setStatus('live');

        if (ts > 0) {
          if (lastTimestampRef.current > 0 && ts !== lastTimestampRef.current) {
            countRef.current++;
            const now = Date.now();
            if (lastChangeTimeRef.current > 0) {
              const gap = (now - lastChangeTimeRef.current) / 1000;
              setMeasuredRate(gap >= 2 ? `1/${gap.toFixed(0)}s` : `${(1/gap).toFixed(1)}/s`);
            }
            lastChangeTimeRef.current = now;
          }
          lastTimestampRef.current = ts;
        }
      } catch (e) {
        console.warn('[RedStone] poll error:', e);
        setStatus('error');
      }
    };
    poll();
    const id = setInterval(poll, 10000);
    return () => clearInterval(id);
  }, []);

  return { countRef, status, measuredRate, lastPrice };
}

/* ═══ ORACLE COLUMN ═══ */
function OracleColumn({ spec, liveData }: { spec: OSpec; liveData?: LiveData }) {
  const liveCountRef = liveData?.countRef;
  const [total, setTotal] = useState(0);
  const [poops, setPoops] = useState<Poop[]>([]);
  const [full, setFull] = useState(false);
  const [phase, setPhase] = useState<'idle'|'squeeze'|'open'>('idle');
  const [showTip, setShowTip] = useState(false);
  const [zoneGen, setZoneGen] = useState(0);
  const startTimeRef = useRef(Date.now());
  const lastDropCountRef = useRef(0);
  const idRef = useRef(0);
  const pileRef = useRef(0);
  const zoneRef = useRef<HTMLDivElement>(null);
  const sofaBase = spec.imgSofa ? SOFA_H : 0;

  // Initialize pile above sofa
  useEffect(() => { pileRef.current = sofaBase; }, [sofaBase]);

  const clean = useCallback(() => {
    setPoops([]); setFull(false); pileRef.current = sofaBase;
    startTimeRef.current = Date.now();
    lastDropCountRef.current = 0;
    if (liveCountRef) liveCountRef.current = 0;
  }, [liveCountRef, sofaBase]);

  // Prevent freeze when switching browser tabs — regenerate landed pile on return
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        const zone = zoneRef.current;
        if (!zone) return;

        // recalc start time so counter doesn't jump
        startTimeRef.current = Date.now() - (total / spec.realRate) * 1000;

        // how many drops SHOULD exist based on the counter
        const targetDrops = Math.floor(total / spec.updatesPerPoop);

        // regenerate pile: place them row by row
        const colW = zone.clientWidth;
        const perRow = Math.max(Math.floor(colW / (POOP_W * 0.45)), 2);
        const maxPile = zone.clientHeight - 40 - sofaBase;
        const maxDrops = Math.floor(maxPile / POOP_H) * perRow;
        const dropCount = Math.min(targetDrops, maxDrops);
        const isFull = targetDrops >= maxDrops;

        const newPoops: Poop[] = [];
        for (let i = 0; i < dropCount; i++) {
          const row = Math.floor(i / perRow);
          const col = i % perRow;
          newPoops.push({
            id: i + 1,
            x: 8 + (col / Math.max(perRow - 1, 1)) * 84 + (Math.random() - 0.5) * 10,
            y: sofaBase + row * POOP_H + (Math.random() * 6 - 3),
            landed: true,
            rot: (Math.random() - 0.5) * 50,
            scale: 0.7 + Math.random() * 0.3,
          });
        }

        idRef.current = dropCount;
        lastDropCountRef.current = targetDrops;
        pileRef.current = dropCount > 0 ? sofaBase + Math.floor(dropCount / perRow) * POOP_H : sofaBase;
        setPoops(newPoops);
        setFull(isFull);
        setPhase('idle');
        // bump key on AnimatePresence → kills stuck framer-motion exit nodes
        setZoneGen(g => g + 1);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [total, spec.realRate, spec.updatesPerPoop]);

  useEffect(() => { clean(); }, [spec.key]);

  useEffect(() => {
    const sqDur = 100;
    const opDur = 120;
    let mounted = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const safe = (fn: () => void, ms: number) => {
      const t = setTimeout(() => { if (mounted) fn(); }, ms);
      timers.push(t);
    };

    const tickId = setInterval(() => {
      if (!mounted) return;
      // COUNTER: live API or mockup math
      let totalUpdates: number;
      if (spec.live && liveCountRef) {
        totalUpdates = liveCountRef.current;
      } else {
        const elapsedSec = (Date.now() - startTimeRef.current) / 1000;
        totalUpdates = Math.floor(elapsedSec * spec.realRate);
      }
      setTotal(totalUpdates);

      // DROPS
      const totalDrops = Math.floor(totalUpdates / spec.updatesPerPoop);

      if (totalDrops > lastDropCountRef.current) {
        const zone = zoneRef.current;
        if (!zone) return;
        if (pileRef.current >= zone.clientHeight - 40) { setFull(true); return; }

        lastDropCountRef.current = totalDrops;

        setPhase('squeeze');
        safe(() => {
          setPhase('open');
          safe(() => {
            idRef.current++;
            const id = idRef.current;
            const x = 25 + Math.random() * 50;
            const rot = (Math.random() - 0.5) * 60;
            const scale = 0.7 + Math.random() * 0.5;
            const landY = Math.max(sofaBase, pileRef.current + (Math.random() * 10 - 5));
            const colW = zone.clientWidth;
            const perRow = Math.max(Math.floor(colW / (POOP_W * 0.45)), 2);

            setPoops(prev => {
              const next = [...prev, { id, x, y: landY, landed: false, rot, scale }];
              const nL = next.filter(p => p.landed).length + 1;
              pileRef.current = sofaBase + Math.floor(nL / perRow) * POOP_H;
              return next;
            });

            safe(() => {
              setPoops(prev => prev.map(p => {
                if (p.id !== id) return p;
                const near = prev.filter(o => o.landed && o.id !== id
                  && Math.abs(o.x - p.x) < 14 && Math.abs(o.y - p.y) < POOP_H);
                let nx = p.x;
                if (near.length > 0) {
                  const n = near[0];
                  nx = Math.max(5, Math.min(95, p.x + (p.x > n.x ? 1 : -1) * (8 + Math.random() * 12)));
                }
                return { ...p, landed: true, x: nx };
              }));
            }, FLIGHT);

            safe(() => setPhase('idle'), opDur);
          }, opDur * 0.6);
        }, sqDur);
      }
    }, 50);

    return () => {
      mounted = false;
      clearInterval(tickId);
      timers.forEach(t => clearTimeout(t));
    };
  }, [spec, liveCountRef]);

  return (
    <div className="flex flex-col h-full relative overflow-hidden" style={{ borderRight: '2px solid hsl(265 66% 55% / 0.5)' }}>
      {/* Stats */}
      <div className="text-center py-2 px-1 shrink-0" style={{borderBottom:`1px solid ${spec.color}20`}}>
        <p className="font-display text-base sm:text-lg font-bold" style={{color:spec.color}}>{spec.name}</p>
        <p className="font-mono text-xl sm:text-2xl font-black" style={{color:spec.color}}>{spec.rate}</p>
        <p className="text-[10px] sm:text-xs text-muted-foreground/35">{spec.note}</p>
        {liveData && (
          <div className="mt-1 space-y-0.5">
            <p className="text-[9px] font-mono" style={{
              color: liveData.status === 'live' ? '#4ade80' : liveData.status === 'error' ? '#ef4444' : '#f59e0b'
            }}>
              {liveData.status === 'live' ? '● LIVE' : liveData.status === 'error' ? '● ERROR' : '● CONNECTING...'}
              {liveData.status === 'live' && <span className="text-white/40 ml-1">| {liveData.measuredRate}</span>}
            </p>
            {liveData.lastPrice !== '—' && (
              <p className="text-[9px] font-mono text-white/30">BTC {liveData.lastPrice}</p>
            )}
          </div>
        )}
        <p className="font-mono text-sm sm:text-base text-white font-bold tabular-nums mt-0.5">{total.toLocaleString()}</p>
      </div>

      {/* Mascot */}
      <div className="flex justify-center items-end shrink-0 relative z-10 cursor-pointer" style={{height:MH}}
        onMouseEnter={()=>setShowTip(true)}
        onMouseLeave={()=>setShowTip(false)}
        onClick={()=>{setShowTip(v=>!v);setTimeout(()=>setShowTip(false),2500)}}>
        <AnimatePresence>
          {showTip&&(
            <motion.div initial={{opacity:0,y:6,scale:0.9}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:4,scale:0.95}}
              className="absolute -top-1 left-1/2 -translate-x-1/2 z-30 whitespace-nowrap font-mono text-[10px] sm:text-xs py-1 px-3 rounded-md pointer-events-none"
              style={{background:'#0e0e1ef0',color:spec.color,border:`1px solid ${spec.color}50`,boxShadow:`0 0 16px ${spec.color}30`}}>
<LONG LINE STRIPPED>
            </motion.div>
          )}
        </AnimatePresence>
        <motion.div className="h-full flex items-center justify-center"
          animate={
            phase==='squeeze' ? {scaleY:1.08,scaleX:0.92,y:-2} :
            phase==='open'    ? {scaleY:0.85,scaleX:1.08,y:4} :
                                {scaleY:1,scaleX:1,y:[0,2,0]}
          }
          transition={
            phase==='squeeze' ? {duration:0.1,ease:'easeIn'} :
            phase==='open'    ? {duration:0.08,ease:'easeOut'} :
                                {duration:0.7,repeat:Infinity,repeatType:'reverse' as const,ease:'easeInOut'}
          }>
          <img src={phase==='open'?spec.imgOpen:phase==='squeeze'&&spec.imgSqueeze?spec.imgSqueeze:spec.imgStatic} alt={spec.name}
            className="h-full w-auto object-contain"
            style={{imageRendering:'pixelated',
              filter:spec.key==='pythPro'
                ?`drop-shadow(0 0 10px ${spec.color}88) drop-shadow(0 0 4px ${spec.color}44)`
                :'drop-shadow(0 2px 5px rgba(0,0,0,0.5))'}}/>
        </motion.div>
      </div>

      {/* Drop zone */}
      <div ref={zoneRef} className="flex-1 relative overflow-hidden min-h-0">
        {spec.imgSofa && (
          <div className="absolute bottom-0 left-0 right-0 z-[3] pointer-events-none" style={{height:SOFA_H,overflow:'hidden'}}>
            <img src={spec.imgSofa} alt="" style={{width:'100%',height:'100%',objectFit:'fill',imageRendering:'pixelated' as const}}/>
          </div>
        )}
        <AnimatePresence key={zoneGen}>
          {poops.map(p => {
            const poopEl = (
              <img src={spec.imgPoop} alt="" style={{imageRendering:'pixelated',width:POOP_W,height:'auto'}}/>
            );
            if (!p.landed) {
              return (
                <motion.div key={p.id} className="absolute pointer-events-none z-[5]"
                  style={{left:`${p.x}%`,transform:'translateX(-50%)'}}
                  initial={{top:0,opacity:0.6,scale:0.25}}
                  animate={{
                    top:`calc(100% - ${Math.max(p.y+POOP_H+6, POOP_H+10)}px)`,
                    opacity:1,scale:p.scale,rotate:p.rot,
                  }}
                  transition={{
                    duration:FLIGHT/1000,
                    ease:[0.12,0,0.88,0.35],
                    scale:{duration:FLIGHT/1000*0.35,ease:'easeOut'},
                    opacity:{duration:0.15,ease:'easeOut'},
                  }}>
                  {poopEl}
                </motion.div>
              );
            }
            return (
              <motion.div key={p.id} className="absolute pointer-events-none z-[5]"
                style={{left:`${p.x}%`,bottom:Math.max(0,p.y),transform:'translateX(-50%)'}}
                initial={{scale:1.15,y:-8,rotate:0}}
                animate={{scale:p.scale*0.9,y:0,rotate:p.rot}}
                transition={{type:'spring',stiffness:350,damping:15}}>
                {poopEl}
              </motion.div>
            );
          })}
        </AnimatePresence>
        {full&&(
          <motion.div initial={{opacity:0}} animate={{opacity:1}}
            className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3"
            style={{background:`${spec.color}12`,backdropFilter:'blur(3px)'}}>
            <img src={spec.imgPoop} alt="" style={{width:48,height:'auto',imageRendering:'pixelated',opacity:0.8}}/>
            <button onClick={clean}
              className="font-display text-xs sm:text-sm py-2 px-5 rounded-lg border-2 cursor-pointer hover:scale-105 active:scale-95 transition-all"
              style={{borderColor:spec.color,color:spec.color,background:'#0a0a1af5',boxShadow:`0 0 28px ${spec.color}40`}}>
              🧹 CLEAN
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}

/* ═══ TAB BUTTON ═══ */
function TabBtn({ active, label, onClick, color }: { active: boolean; label: string; onClick: () => void; color: string }) {
  return (
    <button
      onClick={onClick}
      className={`font-display text-sm sm:text-base tracking-wider px-6 sm:px-8 py-2 sm:py-2.5 rounded-lg border-2 transition-all duration-200 cursor-pointer
        ${active ? 'scale-105' : 'opacity-50 hover:opacity-75 hover:scale-102'}`}
      style={{
        borderColor: active ? color : `${color}40`,
        color: active ? color : `${color}80`,
        background: active ? `${color}15` : 'transparent',
        boxShadow: active ? `0 0 24px ${color}30, inset 0 0 12px ${color}08` : 'none',
        textShadow: active ? `0 0 12px ${color}60` : 'none',
      }}
    >
      {label}
    </button>
  );
}

/* ═══ STANDARD RACE — with live API hooks ═══ */
function StandardRace() {
  const pythData = usePythLive();
  const chainlinkData = useChainlinkLive();
  const redstoneData = useRedstoneLive();

  const liveDataArr = [pythData, chainlinkData, redstoneData];

  return (
    <div className="flex-1 grid grid-cols-3 overflow-hidden" style={{ columnGap: 0 }}>
      {STANDARD_ORACLES.map((o, i) => (
        <OracleColumn key={o.key} spec={o} liveData={liveDataArr[i]} />
      ))}
    </div>
  );
}

/* ═══ PAID RACE — mockup only ═══ */
function PaidRace() {
  return (
    <div className="flex-1 grid grid-cols-3 overflow-hidden" style={{ columnGap: 0 }}>
      {PAID_ORACLES.map(o => (
        <OracleColumn key={o.key} spec={o} />
      ))}
    </div>
  );
}

/* ═══ PAGE ═══ */
export default function OracleBenchmark() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'standard' | 'paid'>('standard');
  const [scaleFactor, setScaleFactor] = useState(1);

  useEffect(() => {
    const calcScale = () => {
      const w = window.innerWidth;
      if (w <= 1440) setScaleFactor(0.8);
      else setScaleFactor(0.9);
    };
    calcScale();
    window.addEventListener('resize', calcScale);
    return () => window.removeEventListener('resize', calcScale);
  }, []);

  const poopIcon = (src:string) => <img src={src} alt="" style={{height:12,width:'auto',imageRendering:'pixelated' as const,display:'inline-block',verticalAlign:'middle',margin:'0 2px'}}/>;

  const footerText = tab === 'standard'
    ? <>● LIVE — 1{poopIcon(IMG.corePoop)} = 1 price update · Pyth Hermes SSE + Chainlink/RedStone on-chain polling</>
    : <>1{poopIcon(IMG.proPoop)} = 500 price updates · Premium oracle comparison · SIMULATED</>;

  return (
    <div className="h-screen bg-background grid-bg scanlines overflow-hidden select-none"
      style={{ display:'flex', flexDirection:'column' }}>
      {/* Scaled content area */}
      <div style={{flex:1,minHeight:0,overflow:'hidden',zoom:scaleFactor}}>
        <div className="flex flex-col overflow-hidden select-none" style={{width:'100%',height:'100%'}}>
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-1 border-b border-neon-purple/40 shrink-0">
            <div className="flex items-center gap-2">
              <span onClick={()=>navigate('/')} className="cursor-pointer hover:scale-110 transition-transform text-base select-none" role="button" tabIndex={0}>⬅️</span>
              <span className="font-display text-sm sm:text-base tracking-[0.12em] text-neon-purple text-glow-purple">ORACLE SPEED BENCHMARK</span>
            </div>
            <span className="font-display text-[8px] sm:text-[10px] text-muted-foreground/25 tracking-wider">MOCKUP · OFFICIAL SPECS</span>
          </div>

          {/* Tab selector */}
          <div className="flex items-center justify-center gap-4 py-3 shrink-0 border-b border-neon-purple/15">
            <TabBtn active={tab==='standard'} label="⚡ STANDARD" onClick={()=>setTab('standard')} color="#7c3aed" />
            <TabBtn active={tab==='paid'} label="💎 PAID" onClick={()=>setTab('paid')} color="#06b6d4" />
          </div>

          {/* Race area */}
          {tab === 'standard' ? <StandardRace /> : <PaidRace />}
        </div>
      </div>

      {/* Footer — outside scale, pinned to bottom */}
      <div className="text-center py-1.5 shrink-0 border-t border-neon-purple/30">
        <p className="font-display text-[10px] sm:text-xs text-white tracking-wider">
          {footerText}
        </p>
      </div>
    </div>
  );
}