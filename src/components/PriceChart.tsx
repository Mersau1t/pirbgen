import { useRef, useEffect, useState } from 'react';

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
}

interface PriceChartProps {
  candles: Candle[];
  entryPrice: number;
  positive: boolean;
  direction: 'LONG' | 'SHORT';
}

const MAX_CANDLES = 10;

export default function PriceChart({ candles, entryPrice, positive, direction }: PriceChartProps) {
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
    const pad = { top: 16, bottom: 16, left: 8, right: 8 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;

    // Price range
    const allPrices = candles.flatMap(c => [c.high, c.low]).concat(entryPrice);
    const dataMin = Math.min(...allPrices);
    const dataMax = Math.max(...allPrices);
    const pricePad = (dataMax - dataMin) * 0.2 || entryPrice * 0.003;
    const min = dataMin - pricePad;
    const max = dataMax + pricePad;
    const range = max - min || 1;

    const toY = (v: number) => pad.top + chartH - ((v - min) / range) * chartH;
    const candleWidth = chartW / MAX_CANDLES;
    const bodyWidth = candleWidth * 0.6;
    const toX = (i: number) => pad.left + candleWidth * i + candleWidth / 2;

    ctx.clearRect(0, 0, w, h);

    const entryY = toY(entryPrice);
    const winAbove = direction === 'LONG';

    // Win/loss zone fills
    const topGrad = ctx.createLinearGradient(0, pad.top, 0, entryY);
    topGrad.addColorStop(0, winAbove ? 'rgba(7,228,110,0.10)' : 'rgba(239,68,68,0.10)');
    topGrad.addColorStop(1, winAbove ? 'rgba(7,228,110,0.01)' : 'rgba(239,68,68,0.01)');
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, pad.top, w, entryY - pad.top);

    const botGrad = ctx.createLinearGradient(0, entryY, 0, h - pad.bottom);
    botGrad.addColorStop(0, winAbove ? 'rgba(239,68,68,0.01)' : 'rgba(7,228,110,0.01)');
    botGrad.addColorStop(1, winAbove ? 'rgba(239,68,68,0.10)' : 'rgba(7,228,110,0.10)');
    ctx.fillStyle = botGrad;
    ctx.fillRect(0, entryY, w, h - pad.bottom - entryY);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 6; i++) {
      const y = pad.top + (chartH / 6) * i;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // Entry line
    ctx.strokeStyle = 'rgba(245,245,255,0.3)';
    ctx.setLineDash([5, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, entryY); ctx.lineTo(w, entryY); ctx.stroke();
    ctx.setLineDash([]);

    // Entry label
    ctx.fillStyle = 'rgba(245,245,255,0.45)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('ENTRY', 4, entryY - 4);

    // Zone labels
    ctx.font = 'bold 9px monospace';
    ctx.globalAlpha = 0.12;
    ctx.textAlign = 'center';
    ctx.fillStyle = winAbove ? '#07e46e' : '#ef4444';
    ctx.fillText(winAbove ? '▲ PROFIT' : '▲ LOSS', w / 2, pad.top + 12);
    ctx.fillStyle = winAbove ? '#ef4444' : '#07e46e';
    ctx.fillText(winAbove ? '▼ LOSS' : '▼ PROFIT', w / 2, h - pad.bottom - 4);
    ctx.globalAlpha = 1;

    // Draw candles
    const purple = '#8046dc';
    const bullish = '#07e46e';
    const bearish = '#ef4444';

    candles.forEach((candle, i) => {
      const x = toX(i);
      const isBull = candle.close >= candle.open;
      const color = isBull ? bullish : bearish;

      const highY = toY(candle.high);
      const lowY = toY(candle.low);
      const openY = toY(candle.open);
      const closeY = toY(candle.close);
      const bodyTop = Math.min(openY, closeY);
      const bodyH = Math.max(Math.abs(closeY - openY), 1);

      // Wick
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.shadowColor = color;
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.moveTo(x, highY);
      ctx.lineTo(x, lowY);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Body
      ctx.fillStyle = isBull ? color : color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 6;
      ctx.fillRect(x - bodyWidth / 2, bodyTop, bodyWidth, bodyH);
      ctx.shadowBlur = 0;

      // Body border
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.strokeRect(x - bodyWidth / 2, bodyTop, bodyWidth, bodyH);

      // If it's the last candle, add purple glow outline
      if (i === candles.length - 1) {
        ctx.strokeStyle = purple;
        ctx.lineWidth = 2;
        ctx.shadowColor = purple;
        ctx.shadowBlur = 12;
        ctx.strokeRect(x - bodyWidth / 2 - 2, bodyTop - 2, bodyWidth + 4, bodyH + 4);
        ctx.shadowBlur = 0;
      }
    });

  }, [candles, entryPrice, positive, size, direction]);

  return (
    <div ref={containerRef} className="w-full h-52 sm:h-64 relative">
      <canvas ref={canvasRef} className="w-full h-full" style={{ display: 'block' }} />
      <div className="absolute top-1 left-3 text-[9px] text-muted-foreground/50 font-mono tracking-wider">10s CANDLES</div>
      <div className="absolute top-1 right-3 text-[9px] text-muted-foreground/50 font-mono">{candles.length}/{MAX_CANDLES}</div>
    </div>
  );
}
