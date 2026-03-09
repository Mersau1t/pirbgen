// Tension audio system — rising intensity as PnL approaches SL or TP
// Uses Web Audio API: a low drone + heartbeat pulse that speed up near thresholds

let audioCtx: AudioContext | null = null;
function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

let activeNodes: {
  drone: OscillatorNode;
  droneGain: GainNode;
  heartbeat: OscillatorNode;
  hbGain: GainNode;
  lfo: OscillatorNode;
  master: GainNode;
} | null = null;

let intensityInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start the tension audio layer. Call once when trade opens.
 */
export function startTensionAudio() {
  if (activeNodes) return;
  const ctx = getCtx();
  const t = ctx.currentTime;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0, t);
  master.connect(ctx.destination);

  // Low drone — softer sine wave for pleasant ambient sound
  const drone = ctx.createOscillator();
  const droneGain = ctx.createGain();
  const droneFilter = ctx.createBiquadFilter();
  drone.type = 'sine';
  drone.frequency.setValueAtTime(40, t); // Lower, softer frequency
  droneFilter.type = 'lowpass';
  droneFilter.frequency.setValueAtTime(120, t); // Warmer, less harsh
  droneFilter.Q.setValueAtTime(2, t); // Gentler resonance
  droneGain.gain.setValueAtTime(0.03, t); // Quieter
  drone.connect(droneFilter).connect(droneGain).connect(master);
  drone.start(t);

  // Heartbeat pulse — softer sine with gentle modulation
  const heartbeat = ctx.createOscillator();
  const hbGain = ctx.createGain();
  heartbeat.type = 'sine';
  heartbeat.frequency.setValueAtTime(45, t); // Even softer thump
  hbGain.gain.setValueAtTime(0, t);
  heartbeat.connect(hbGain).connect(master);
  heartbeat.start(t);

  // LFO to modulate heartbeat gain (creates gentle pulsing)
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.type = 'sine';
  lfo.frequency.setValueAtTime(0.6, t); // Slower, more relaxed pulse
  lfoGain.gain.setValueAtTime(0.04, t); // Gentler modulation
  lfo.connect(lfoGain).connect(hbGain.gain);
  lfo.start(t);

  activeNodes = { drone, droneGain, heartbeat, hbGain, lfo, master };
}

/**
 * Update tension intensity based on how close PnL is to SL or TP.
 * @param intensity 0 (calm) to 1 (about to hit SL/TP)
 */
export function setTensionIntensity(intensity: number) {
  if (!activeNodes) return;
  const ctx = getCtx();
  const t = ctx.currentTime;
  const clamped = Math.max(0, Math.min(1, intensity));

  // Master volume: 0 when calm, up to 0.08 at max tension (quieter)
  activeNodes.master.gain.cancelScheduledValues(t);
  activeNodes.master.gain.setTargetAtTime(clamped * 0.08, t, 0.2);

  // Drone pitch rises gently with tension (40 → 65 Hz, softer range)
  activeNodes.drone.frequency.setTargetAtTime(40 + clamped * 25, t, 0.3);

  // Heartbeat LFO speed: 0.6 Hz (calm) → 2.2 Hz (moderate intensity)
  activeNodes.lfo.frequency.setTargetAtTime(0.6 + clamped * 1.6, t, 0.3);

  // Heartbeat volume increases gently
  activeNodes.hbGain.gain.cancelScheduledValues(t);
  activeNodes.hbGain.gain.setTargetAtTime(clamped * 0.06, t, 0.2);
}

/**
 * Stop and clean up tension audio.
 */
export function stopTensionAudio() {
  if (!activeNodes) return;
  const ctx = getCtx();
  const t = ctx.currentTime;

  activeNodes.master.gain.setTargetAtTime(0, t, 0.1);

  const nodes = activeNodes;
  activeNodes = null;

  setTimeout(() => {
    try {
      nodes.drone.stop();
      nodes.heartbeat.stop();
      nodes.lfo.stop();
      nodes.drone.disconnect();
      nodes.heartbeat.disconnect();
      nodes.lfo.disconnect();
      nodes.droneGain.disconnect();
      nodes.hbGain.disconnect();
      nodes.master.disconnect();
    } catch {}
  }, 300);

  if (intensityInterval) {
    clearInterval(intensityInterval);
    intensityInterval = null;
  }
}
