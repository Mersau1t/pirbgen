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
  stopLoss: number;   // e.g. -100 (percent PnL)
  takeProfit: number;  // e.g. +500 (percent PnL)
  leverage: number;
}

const MAX_CANDLES = 28;

/** Smart price formatting — adapts decimal places to price magnitude */
function formatPrice(p: number): string {
  const abs = Math.abs(p);
  if (abs >= 1000) return '$' + p.toFixed(1);
  if (abs >= 1) return '$' + p.toFixed(2);
  if (abs >= 0.01) return '$' + p.toFixed(4);
  if (abs >= 0.0001) return '$' + p.toFixed(6);
  return '$' + p.toPrecision(4);
}

function formatPriceShort(p: number): string {
  const abs = Math.abs(p);
  if (abs >= 1000) return p.toFixed(0);
  if (abs >= 1) return p.toFixed(2);
  if (abs >= 0.01) return p.toFixed(4);
  return p.toPrecision(3);
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
    const priceAxisW = 78;
    const timeAxisH = 20;
    const pad = { top: 12, bottom: timeAxisH + 4, left: 6, right: priceAxisW + 4 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;

    // Calculate SL/TP price levels
    // PnL% = priceChange% * leverage (for LONG), so priceChange% = PnL% / leverage
    const slPriceChange = stopLoss / leverage / 100; // e.g. -100/50/100 = -0.02
    const tpPriceChange = takeProfit / leverage / 100;
    const slPrice = direction === 'LONG'
      ? entryPrice * (1 + slPriceChange)
      : entryPrice * (1 - slPriceChange);
    const tpPrice = direction === 'LONG'
      ? entryPrice * (1 + tpPriceChange)
      : entryPrice * (1 - tpPriceChange);

    // Price range must include SL, TP, and all candle data
    const allPrices = candles.flatMap(c => [c.high, c.low]).concat([entryPrice, slPrice, tpPrice]);
    const dataMin = Math.min(...allPrices);
    const dataMax = Math.max(...allPrices);
    const pricePad = (dataMax - dataMin) * 0.08 || entryPrice * 0.002;
    const min = dataMin - pricePad;
    const max = dataMax + pricePad;
    const range = max - min || 1;

    const toY = (v: number) => pad.top + chartH - ((v - min) / range) * chartH;
    const slotW = chartW / MAX_CANDLES;
    const bodyW = Math.max(slotW * 0.55, 3);
    const toX = (i: number) => pad.left + slotW * i + slotW / 2;

    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(pad.left, pad.top, chartW, chartH);

    const entryY = toY(entryPrice);
    const winAbove = direction === 'LONG';
    
    // Find entry point on chart
    const entryIdx = candles.findIndex(c => c.time >= 0);
    const entryX = entryIdx >= 0 ? toX(entryIdx) - slotW / 2 : pad.left;

    // Zone fills - only from entry point onwards
    const topGrad = ctx.createLinearGradient(0, pad.top, 0, entryY);
    topGrad.addColorStop(0, winAbove ? 'rgba(7,228,110,0.06)' : 'rgba(239,68,68,0.06)');
    topGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = topGrad;
    ctx.fillRect(entryX, pad.top, chartW - (entryX - pad.left), Math.max(entryY - pad.top, 0));

    const botGrad = ctx.createLinearGradient(0, entryY, 0, pad.top + chartH);
    botGrad.addColorStop(0, 'rgba(0,0,0,0)');
    botGrad.addColorStop(1, winAbove ? 'rgba(239,68,68,0.06)' : 'rgba(7,228,110,0.06)');
    ctx.fillStyle = botGrad;
    ctx.fillRect(entryX, entryY, chartW - (entryX - pad.left), Math.max(pad.top + chartH - entryY, 0));

    // Horizontal grid + price labels on right
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const gridSteps = 6;
    for (let i = 0; i <= gridSteps; i++) {
      const price = min + (range / gridSteps) * i;
      const y = toY(price);
      // Grid line
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + chartW, y); ctx.stroke();
      // Price label
      ctx.fillStyle = 'rgba(245,245,255,0.3)';
      ctx.font = '9px monospace';
      ctx.fillText('$' + price.toFixed(2), pad.left + chartW + 6, y);
    }

    // Entry price line — bold & prominent
    ctx.strokeStyle = '#8046dc';
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 2;
    ctx.shadowColor = '#8046dc';
    ctx.shadowBlur = 6;
    ctx.beginPath(); ctx.moveTo(pad.left, entryY); ctx.lineTo(pad.left + chartW, entryY); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.setLineDash([]);
    // Entry label on price axis
    ctx.fillStyle = '#8046dc';
    ctx.font = 'bold 9px monospace';
    const entryLabelY = entryY;
    ctx.fillRect(pad.left + chartW + 2, entryLabelY - 7, priceAxisW - 4, 14);
    ctx.fillStyle = '#F5F5FF';
    ctx.fillText('$' + entryPrice.toFixed(2), pad.left + chartW + 5, entryLabelY);

    // Take Profit line
    const tpY = toY(tpPrice);
    ctx.strokeStyle = '#07e46e80';
    ctx.setLineDash([6, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.left, tpY); ctx.lineTo(pad.left + chartW, tpY); ctx.stroke();
    ctx.setLineDash([]);
    // TP label
    ctx.fillStyle = '#07e46e';
    ctx.fillRect(pad.left + chartW + 2, tpY - 7, priceAxisW - 4, 14);
    ctx.fillStyle = '#0a0a0a';
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('TP ' + tpPrice.toFixed(1), pad.left + chartW + 4, tpY);
    // TP zone fill
    const tpZoneTop = direction === 'LONG' ? Math.min(tpY, entryY) : Math.min(entryY, tpY);
    const tpZoneBot = direction === 'LONG' ? entryY : tpY;

    // Stop Loss line
    const slY = toY(slPrice);
    ctx.strokeStyle = '#ef444480';
    ctx.setLineDash([6, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.left, slY); ctx.lineTo(pad.left + chartW, slY); ctx.stroke();
    ctx.setLineDash([]);
    // SL label
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(pad.left + chartW + 2, slY - 7, priceAxisW - 4, 14);
    ctx.fillStyle = '#F5F5FF';
    ctx.font = 'bold 8px monospace';
    ctx.fillText('SL ' + slPrice.toFixed(1), pad.left + chartW + 4, slY);

    if (candles.length > 0) {
      const lastClose = candles[candles.length - 1].close;
      const curY = toY(lastClose);
      const curColor = lastClose >= entryPrice ? (winAbove ? '#07e46e' : '#ef4444') : (winAbove ? '#ef4444' : '#07e46e');
      // Dotted line across
      ctx.strokeStyle = curColor + '60';
      ctx.setLineDash([2, 2]);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad.left, curY); ctx.lineTo(pad.left + chartW, curY); ctx.stroke();
      ctx.setLineDash([]);
      // Price tag
      ctx.fillStyle = curColor;
      ctx.fillRect(pad.left + chartW + 2, curY - 7, priceAxisW - 4, 14);
      ctx.fillStyle = '#0a0a0a';
      ctx.font = 'bold 9px monospace';
      ctx.fillText('$' + lastClose.toFixed(2), pad.left + chartW + 5, curY);
    }

    // Time axis
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const timeY = pad.top + chartH + 4;
    candles.forEach((candle, i) => {
      if (candles.length > 10 && i % 4 !== 0 && i !== candles.length - 1) return;
      const x = toX(i);
      const sec = candle.time;
      const absSec = Math.abs(sec);
      const m = Math.floor(absSec / 60);
      const s = absSec % 60;
      const prefix = sec < 0 ? '-' : '';
      ctx.fillStyle = sec < 0 ? 'rgba(245,245,255,0.15)' : 'rgba(245,245,255,0.25)';
      ctx.fillText(`${prefix}${m}:${s.toString().padStart(2, '0')}`, x, timeY);
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, pad.top + chartH); ctx.lineTo(x, pad.top + chartH + 3); ctx.stroke();
    });

    // Entry vertical marker — using entryIdx already calculated
    if (entryIdx > 0) {
      const ex = entryX;
      ctx.strokeStyle = '#8046dc80';
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1.5;
      ctx.shadowColor = '#8046dc';
      ctx.shadowBlur = 4;
      ctx.beginPath(); ctx.moveTo(ex, pad.top); ctx.lineTo(ex, pad.top + chartH); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.setLineDash([]);
      ctx.fillStyle = '#8046dc';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.shadowColor = '#8046dc';
      ctx.shadowBlur = 6;
      ctx.fillText('▼ ENTRY', ex, pad.top - 1);
      ctx.shadowBlur = 0;
    }

    // Axis borders
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    // Bottom border
    ctx.beginPath(); ctx.moveTo(pad.left, pad.top + chartH); ctx.lineTo(pad.left + chartW, pad.top + chartH); ctx.stroke();
    // Right border
    ctx.beginPath(); ctx.moveTo(pad.left + chartW, pad.top); ctx.lineTo(pad.left + chartW, pad.top + chartH); ctx.stroke();

    // Draw candles
    const bullColor = '#07e46e';
    const bearColor = '#ef4444';

    candles.forEach((candle, i) => {
      const x = toX(i);
      const isHistory = candle.time < 0;
      const isBull = candle.close >= candle.open;
      const color = isBull ? bullColor : bearColor;
      const alpha = isHistory ? 0.45 : 1;
      ctx.globalAlpha = alpha;

      const highY = toY(candle.high);
      const lowY = toY(candle.low);
      const openY = toY(candle.open);
      const closeY = toY(candle.close);
      const bodyTop = Math.min(openY, closeY);
      const bodyH = Math.max(Math.abs(closeY - openY), 1);

      // Wick shadow
      ctx.strokeStyle = color + '40';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x, highY); ctx.lineTo(x, lowY); ctx.stroke();

      // Wick
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x, highY); ctx.lineTo(x, lowY); ctx.stroke();

      // Body shadow/glow
      ctx.shadowColor = color;
      ctx.shadowBlur = 4;
      // Filled body for bearish, hollow-ish for bullish
      if (isBull) {
        ctx.fillStyle = color + '30';
        ctx.fillRect(x - bodyW / 2, bodyTop, bodyW, bodyH);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(x - bodyW / 2, bodyTop, bodyW, bodyH);
      } else {
        ctx.fillStyle = color;
        ctx.fillRect(x - bodyW / 2, bodyTop, bodyW, bodyH);
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    });

    // Last candle purple highlight
    if (candles.length > 0) {
      const i = candles.length - 1;
      const x = toX(i);
      const c = candles[i];
      const openY = toY(c.open);
      const closeY = toY(c.close);
      const bodyTop = Math.min(openY, closeY);
      const bodyH = Math.max(Math.abs(closeY - openY), 1);

      ctx.strokeStyle = '#8046dc';
      ctx.lineWidth = 1.5;
      ctx.shadowColor = '#8046dc';
      ctx.shadowBlur = 10;
      ctx.strokeRect(x - bodyW / 2 - 1.5, bodyTop - 1.5, bodyW + 3, bodyH + 3);
      ctx.shadowBlur = 0;
    }

  }, [candles, entryPrice, positive, size, direction]);

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <canvas ref={canvasRef} className="w-full h-full" style={{ display: 'block' }} />
      <div className="absolute top-1 left-3 text-[9px] text-muted-foreground/50 font-mono tracking-wider">CANDLE 2s · TF 10s</div>
    </div>
  );
}
