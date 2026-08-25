/**
 * Mixer: Audio Sub-Mixer & Master Output Safety Node
 * Combines Organic Muscle Synth, Granular Synth, Tone Synth, and Raw Feed channels
 * into a master bus with peak dynamics compression, hard gain ceiling, and emergency kill mute.
 */

export class Mixer {
  constructor(audioContext) {
    this.ctx = audioContext;

    // Channel Gain Nodes
    this.organicGainNode = this.ctx.createGain();
    this.rawGainNode = this.ctx.createGain();
    this.granularGainNode = this.ctx.createGain();
    this.toneGainNode = this.ctx.createGain();

    // Default Levels: Organic Synth = 80%, Raw/Granular/Tone muted by default
    this.organicGainNode.gain.value = 0.8;
    this.rawGainNode.gain.value = 0.0;
    this.granularGainNode.gain.value = 0.0;
    this.toneGainNode.gain.value = 0.0;

    // Channel Mute States
    this.organicMuted = false;
    this.rawMuted = true;
    this.granularMuted = true;
    this.toneMuted = true;

    // Master Bus
    this.masterBus = this.ctx.createGain();

    // Safety Master Soft-Limiter / Dynamics Compressor
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -3.0; // dB
    this.limiter.knee.value = 6.0;
    this.limiter.ratio.value = 12.0;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.1;

    // Final Output Node & Master Gain (Capped at 1.0 = 0dB gain ceiling)
    this.masterGainNode = this.ctx.createGain();
    this.masterGainNode.gain.value = 0.8;
    this.masterGainCeiling = 1.0;

    this.isPanicMuted = false;

    // Connect Channels -> MasterBus -> Limiter -> MasterGain
    this.organicGainNode.connect(this.masterBus);
    this.rawGainNode.connect(this.masterBus);
    this.granularGainNode.connect(this.masterBus);
    this.toneGainNode.connect(this.masterBus);

    this.masterBus.connect(this.limiter);
    this.limiter.connect(this.masterGainNode);
  }

  setOrganicLevel(val) {
    this.organicGainNode.gain.setTargetAtTime(this.organicMuted ? 0 : val, this.ctx.currentTime, 0.02);
  }

  setRawLevel(val) {
    this.rawGainNode.gain.setTargetAtTime(this.rawMuted ? 0 : val, this.ctx.currentTime, 0.02);
  }

  setGranularLevel(val) {
    this.granularGainNode.gain.setTargetAtTime(this.granularMuted ? 0 : val, this.ctx.currentTime, 0.02);
  }

  setToneLevel(val) {
    this.toneGainNode.gain.setTargetAtTime(this.toneMuted ? 0 : val, this.ctx.currentTime, 0.02);
  }

  setMasterLevel(val) {
    if (this.isPanicMuted) return;
    // Hard gain ceiling cap
    const safeGain = Math.min(this.masterGainCeiling, Math.max(0, val));
    this.masterGainNode.gain.setTargetAtTime(safeGain, this.ctx.currentTime, 0.02);
  }

  togglePanicMute() {
    this.isPanicMuted = !this.isPanicMuted;
    const targetGain = this.isPanicMuted ? 0.0 : 0.8;
    this.masterGainNode.gain.setValueAtTime(targetGain, this.ctx.currentTime);
    return this.isPanicMuted;
  }
}
