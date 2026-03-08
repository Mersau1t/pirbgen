import { useRef, useEffect, useState } from 'react';

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  time: number;
}

interface PriceChartProps {
  candles: Candle[];
  entryPrice: number;
  positive: boolean;
  direction: 'LONG' | 'SHORT';
  stopLoss: number;
  takeProfit: number;
  leverage: number;
}

const MAX_VISIBLE = 28;

function formatPrice(p: number): string {
  const abs = Math.abs(p);
  if (abs >= 10000) return '$' + p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (abs >= 1000) return '$' + p.toFixed(3);
  if (abs >= 100) return '$' + p.toFixed(4);
  if (abs >= 1) return '$' + p.toFixed(5);
  if (abs >= 0.01) return '$' + p.toFixed(7);
  if (abs >= 0.0001) return '$' + p.toFixed(9);
  return '$' + p.toPrecision(6);
}

function formatPriceShort(p: number): string {
  const abs = Math.abs(p);
  if (abs >= 10000) return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (abs >= 1000) return p.toFixed(3);
  if (abs >= 100) return p.toFixed(4);
  if (abs >= 1) return p.toFixed(5);
  if (abs >= 0.01) return p.toFixed(7);
  return p.toPrecision(5);
}

export default function PriceChart({ candles, entryPrice, positive, direction, stopLoss, takeProfit, leverage }: PriceChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setSize({ w: width, h: height });
    });
    obs.observe(container);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || candles.length < 1 || size.w === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    ctx.scale(dpr, dpr);

    const w = size.w;
    const h = size.h;
    const priceAxisW = 110;
    const timeAxisH = 22;
    const pad = { top: 14, bottom: timeAxisH + 4, left: 8, right: priceAxisW + 6 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;

    // SL/TP price levels
    const slPriceChange = stopLoss / leverage / 100;
    const tpPriceChange = takeProfit / leverage / 100;
    const slPrice = direction === 'LONG'
      ? entryPrice * (1 + slPriceChange)
      : entryPrice * (1 - slPriceChange);
    const tpPrice = direction === 'LONG'
      ? entryPrice * (1 + tpPriceChange)
      : entryPrice * (1 - tpPriceChange);

    // Price range
    const allPrices = candles.flatMap(c => [c.high, c.low]).concat([entryPrice, slPrice, tpPrice]);
    const dataMin = Math.min(...allPrices);
    const dataMax = Math.max(...allPrices);
    const pricePad = (dataMax - dataMin) * 0.12 || entryPrice * 0.003;
    const min = dataMin - pricePad;
    const max = dataMax + pricePad;
    const range = max - min || 1;

    // Current candle always at center; older candles scroll left
    const candleSpacing = chartW / Math.max(MAX_VISIBLE - 1, 1);
    const centerIdx = candles.length - 1; // latest candle index
    const centerX = pad.left + chartW / 2;

    const toY = (v: number) => pad.top + chartH - ((v - min) / range) * chartH;
    const toX = (i: number) => centerX + (i - centerIdx) * candleSpacing;

    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = 'rgba(10, 6, 20, 0.6)';
    ctx.fillRect(pad.left, pad.top, chartW, chartH);

    const entryY = toY(entryPrice);
    const winAbove = direction === 'LONG';

    // Find entry index
    const entryIdx = candles.findIndex(c => c.time >= 0);
    const entryX = entryIdx >= 0 ? toX(entryIdx) : pad.left;

    // --- PRICE LINE (close prices) only, no confidence band ---

    // --- PRICE LINE (close prices) ---
    if (candles.length > 1) {
      // Glow layer
      ctx.beginPath();
      for (let i = 0; i < candles.length; i++) {
        const x = toX(i);
        const y = toY(candles[i].close);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(200, 180, 255, 0.3)';
      ctx.lineWidth = 4;
      ctx.shadowColor = '#8046dc';
      ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Main line
      ctx.beginPath();
      for (let i = 0; i < candles.length; i++) {
        const x = toX(i);
        const y = toY(candles[i].close);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = '#e0d4ff';
      ctx.lineWidth = 1.8;
      ctx.stroke();

      // Current price dot (small indicator on chart)
      const lastX = toX(candles.length - 1);
      const lastY = toY(candles[candles.length - 1].close);
      const dotColor = positive ? '#07e46e' : '#ef4444';
      ctx.beginPath();
      ctx.arc(lastX, lastY, 3, 0, Math.PI * 2);
      ctx.fillStyle = dotColor;
      ctx.fill();
    }

    // --- GRID LINES + PRICE LABELS ---
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const gridSteps = 6;
    for (let i = 0; i <= gridSteps; i++) {
      const price = min + (range / gridSteps) * i;
      const y = toY(price);
      ctx.strokeStyle = 'rgba(128, 70, 220, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + chartW, y); ctx.stroke();
      ctx.fillStyle = 'rgba(200, 180, 255, 0.25)';
      ctx.font = '9px monospace';
      ctx.fillText(formatPrice(price), pad.left + chartW + 8, y);
    }

    // --- ENTRY LINE ---
    ctx.strokeStyle = '#8046dc';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.5;
    ctx.shadowColor = '#8046dc';
    ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.moveTo(pad.left, entryY); ctx.lineTo(pad.left + chartW, entryY); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.setLineDash([]);
    // Entry label
    ctx.fillStyle = '#8046dc';
    ctx.fillRect(pad.left + chartW + 4, entryY - 8, priceAxisW - 8, 16);
    ctx.fillStyle = '#F5F5FF';
    ctx.font = 'bold 9px monospace';
    ctx.fillText(formatPrice(entryPrice), pad.left + chartW + 7, entryY);

    // --- TAKE PROFIT LINE ---
    const tpY = toY(tpPrice);
    ctx.strokeStyle = 'rgba(7, 228, 110, 0.5)';
    ctx.setLineDash([6, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.left, tpY); ctx.lineTo(pad.left + chartW, tpY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#07e46e';
    ctx.fillRect(pad.left + chartW + 4, tpY - 8, priceAxisW - 8, 16);
    ctx.fillStyle = '#0a0a0a';
    ctx.font = 'bold 8px monospace';
    ctx.fillText('TP ' + formatPriceShort(tpPrice), pad.left + chartW + 6, tpY);

    // --- STOP LOSS LINE ---
    const slY = toY(slPrice);
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
    ctx.setLineDash([6, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.left, slY); ctx.lineTo(pad.left + chartW, slY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(pad.left + chartW + 4, slY - 8, priceAxisW - 8, 16);
    ctx.fillStyle = '#F5F5FF';
    ctx.font = 'bold 8px monospace';
    ctx.fillText('SL ' + formatPriceShort(slPrice), pad.left + chartW + 6, slY);

    // --- CURRENT PRICE TAG ---
    if (candles.length > 0) {
      const lastClose = candles[candles.length - 1].close;
      const curY = toY(lastClose);
      const curColor = positive ? '#07e46e' : '#ef4444';
      // Dotted line
      ctx.strokeStyle = curColor + '40';
      ctx.setLineDash([2, 2]);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad.left, curY); ctx.lineTo(pad.left + chartW, curY); ctx.stroke();
      ctx.setLineDash([]);
      // Tag
      ctx.fillStyle = curColor;
      ctx.fillRect(pad.left + chartW + 4, curY - 8, priceAxisW - 8, 16);
      ctx.fillStyle = '#0a0a0a';
      ctx.font = 'bold 9px monospace';
      ctx.fillText(formatPrice(lastClose), pad.left + chartW + 7, curY);
    }

    // --- ENTRY VERTICAL MARKER ---
    if (entryIdx > 0) {
      ctx.strokeStyle = 'rgba(128, 70, 220, 0.3)';
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(entryX, pad.top); ctx.lineTo(entryX, pad.top + chartH); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#8046dc';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.shadowColor = '#8046dc';
      ctx.shadowBlur = 6;
      ctx.fillText('▼ ENTRY', entryX, pad.top - 1);
      ctx.shadowBlur = 0;
    }

    // --- TIME AXIS ---
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const timeY = pad.top + chartH + 5;
    candles.forEach((candle, i) => {
      if (candles.length > 10 && i % 4 !== 0 && i !== candles.length - 1) return;
      const x = toX(i);
      const sec = candle.time;
      const absSec = Math.abs(sec);
      const m = Math.floor(absSec / 60);
      const s = absSec % 60;
      const prefix = sec < 0 ? '-' : '';
      ctx.fillStyle = sec < 0 ? 'rgba(200,180,255,0.15)' : 'rgba(200,180,255,0.3)';
      ctx.fillText(`${prefix}${m}:${s.toString().padStart(2, '0')}`, x, timeY);
    });

    // --- AXIS BORDERS ---
    ctx.strokeStyle = 'rgba(128, 70, 220, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.left, pad.top + chartH); ctx.lineTo(pad.left + chartW, pad.top + chartH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(pad.left + chartW, pad.top); ctx.lineTo(pad.left + chartW, pad.top + chartH); ctx.stroke();

  }, [candles, entryPrice, positive, size, direction, stopLoss, takeProfit, leverage]);

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <canvas ref={canvasRef} className="w-full h-full" style={{ display: 'block' }} />
      <div className="absolute top-1 left-3 text-[9px] text-muted-foreground/40 font-mono tracking-wider">PYTH LIVE · CONFIDENCE BAND</div>
    </div>
  );
}
