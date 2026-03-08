// Synthesized neon terminal sounds using Web Audio API

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

/** 8-bit arcade coin sound — plays on every button press */
export function playCoinSound() {
  const ctx = getCtx();
  const t = ctx.currentTime;

  // Coin "ding" — two quick ascending square tones
  const osc1 = ctx.createOscillator();
  const g1 = ctx.createGain();
  osc1.type = 'square';
  osc1.frequency.setValueAtTime(988, t);           // B5
  g1.gain.setValueAtTime(0.12, t);
  g1.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  osc1.connect(g1).connect(ctx.destination);
  osc1.start(t);
  osc1.stop(t + 0.08);

  const osc2 = ctx.createOscillator();
  const g2 = ctx.createGain();
  osc2.type = 'square';
  osc2.frequency.setValueAtTime(1319, t + 0.07);   // E6
  g2.gain.setValueAtTime(0.14, t + 0.07);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  osc2.connect(g2).connect(ctx.destination);
  osc2.start(t + 0.07);
  osc2.stop(t + 0.2);
}

export function playGenerateClick() {
  playCoinSound();
}

export function playWinSound() {
  const ctx = getCtx();
  const t = ctx.currentTime;

  // Ascending triumphant arpeggio
  const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t + i * 0.12);
    gain.gain.setValueAtTime(0, t + i * 0.12);
    gain.gain.linearRampToValueAtTime(0.15, t + i * 0.12 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.4);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t + i * 0.12);
    osc.stop(t + i * 0.12 + 0.4);
  });

  // Shimmer layer
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(2093, t + 0.36);
  gain.gain.setValueAtTime(0.06, t + 0.36);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t + 0.36);
  osc.stop(t + 1.2);
}

export function playRektSound() {
  const ctx = getCtx();
  const t = ctx.currentTime;

  // Descending doom bass
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(400, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.6);
  gain.gain.setValueAtTime(0.2, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.8);

  // Distorted crunch
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  const distortion = ctx.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const x = (i * 2) / 256 - 1;
    curve[i] = (Math.PI + 20) * x / (Math.PI + 20 * Math.abs(x));
  }
  distortion.curve = curve;
  osc2.type = 'square';
  osc2.frequency.setValueAtTime(150, t);
  osc2.frequency.exponentialRampToValueAtTime(30, t + 0.5);
  gain2.gain.setValueAtTime(0.12, t);
  gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
  osc2.connect(distortion).connect(gain2).connect(ctx.destination);
  osc2.start(t);
  osc2.stop(t + 0.6);

  // Static noise burst
  const bufferSize = ctx.sampleRate * 0.3;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.max(0, 1 - i / bufferSize);
  }
  const noise = ctx.createBufferSource();
  const noiseGain = ctx.createGain();
  noise.buffer = buffer;
  noiseGain.gain.setValueAtTime(0.08, t);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  noise.connect(noiseGain).connect(ctx.destination);
  noise.start(t);
}
