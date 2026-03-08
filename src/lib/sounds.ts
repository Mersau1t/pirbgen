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

// --- 8-bit Background Music Loop ---

// Pentatonic melody in A minor, arpeggiated bass, looping
let bgMusicPlaying = false;
let bgMusicStop: (() => void) | null = null;

const BPM = 130;
const BEAT = 60 / BPM;

// A minor pentatonic: A C D E G
const MELODY_NOTES = [
  440, 523, 587, 659, 784,   // A4 C5 D5 E5 G5
  784, 659, 587, 523, 440,   // descending
  523, 659, 784, 880, 784,   // ascending to A5
  659, 587, 523, 440, 523,   // back down
];

const BASS_NOTES = [
  110, 110, 131, 131,  // A2 A2 C3 C3
  147, 147, 165, 165,  // D3 D3 E3 E3
  110, 110, 196, 196,  // A2 A2 G3 G3
  131, 131, 110, 110,  // C3 C3 A2 A2
];

function scheduleLoop(ctx: AudioContext, masterGain: GainNode, startTime: number): number {
  const loopLen = MELODY_NOTES.length;

  // Melody — square wave
  for (let i = 0; i < loopLen; i++) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'square';
    const noteTime = startTime + i * BEAT * 0.5;
    osc.frequency.setValueAtTime(MELODY_NOTES[i], noteTime);
    g.gain.setValueAtTime(0, noteTime);
    g.gain.linearRampToValueAtTime(0.06, noteTime + 0.01);
    g.gain.setValueAtTime(0.06, noteTime + BEAT * 0.35);
    g.gain.linearRampToValueAtTime(0, noteTime + BEAT * 0.48);
    osc.connect(g).connect(masterGain);
    osc.start(noteTime);
    osc.stop(noteTime + BEAT * 0.5);
  }

  // Bass — triangle wave, plays every 2 melody beats
  for (let i = 0; i < BASS_NOTES.length; i++) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    const noteTime = startTime + i * BEAT;
    osc.frequency.setValueAtTime(BASS_NOTES[i % BASS_NOTES.length], noteTime);
    g.gain.setValueAtTime(0, noteTime);
    g.gain.linearRampToValueAtTime(0.08, noteTime + 0.01);
    g.gain.setValueAtTime(0.08, noteTime + BEAT * 0.7);
    g.gain.linearRampToValueAtTime(0, noteTime + BEAT * 0.95);
    osc.connect(g).connect(masterGain);
    osc.start(noteTime);
    osc.stop(noteTime + BEAT);
  }

  // Hi-hat noise — every beat
  for (let i = 0; i < loopLen; i++) {
    const noteTime = startTime + i * BEAT * 0.5;
    if (i % 2 === 0) {
      const bufSize = Math.floor(ctx.sampleRate * 0.03);
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let j = 0; j < bufSize; j++) d[j] = (Math.random() * 2 - 1) * (1 - j / bufSize);
      const src = ctx.createBufferSource();
      const g = ctx.createGain();
      src.buffer = buf;
      g.gain.setValueAtTime(0.025, noteTime);
      g.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.03);
      src.connect(g).connect(masterGain);
      src.start(noteTime);
    }
  }

  return loopLen * BEAT * 0.5; // duration of one loop
}

export function startBgMusic() {
  if (bgMusicPlaying) return;
  bgMusicPlaying = true;

  const ctx = getCtx();
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.5, ctx.currentTime);
  masterGain.connect(ctx.destination);

  let cancelled = false;
  let nextStart = ctx.currentTime + 0.05;

  function loop() {
    if (cancelled) return;
    const duration = scheduleLoop(ctx, masterGain, nextStart);
    nextStart += duration;
    // Schedule next loop slightly before this one ends
    const delay = (nextStart - ctx.currentTime - 0.5) * 1000;
    setTimeout(loop, Math.max(delay, 100));
  }

  loop();

  bgMusicStop = () => {
    cancelled = true;
    masterGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
    bgMusicPlaying = false;
    bgMusicStop = null;
  };
}

export function stopBgMusic() {
  bgMusicStop?.();
}

export function isBgMusicPlaying() {
  return bgMusicPlaying;
}
