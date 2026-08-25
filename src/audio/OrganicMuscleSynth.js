/**
 * OrganicMuscleSynth: Biophysical Organic Sound Synthesis Engine
 * Synthesizes internal body textures (Tendon Creaks, Wet Tissue Friction, Deep Muscle Breath)
 * driven purely by extracted muscle features (RMS Tension, Onset Triggers, Spectral Centroid).
 * Features dramatic visceral sound design with multi-pulse creak ratchets and squelch friction.
 */

export class OrganicMuscleSynth {
  constructor(audioContext) {
    this.ctx = audioContext;

    // Master Organic Output Node
    this.outputNode = this.ctx.createGain();
    this.outputNode.gain.value = 1.0;

    // Global Controls
    this.randomness = 0.6;
    this.sensitivityBoost = 3.5; // Multiplier scaling RMS sensitivity for dramatic response

    // Solo States
    this.soloStates = {
      creak: false,
      friction: false,
      breath: false
    };

    // Layer Gain Nodes
    this.creakGainNode = this.ctx.createGain();
    this.frictionGainNode = this.ctx.createGain();
    this.breathGainNode = this.ctx.createGain();

    this.creakGainNode.gain.value = 1.0;
    this.frictionGainNode.gain.value = 0.9;
    this.breathGainNode.gain.value = 0.75;

    this.creakGainNode.connect(this.outputNode);
    this.frictionGainNode.connect(this.outputNode);
    this.breathGainNode.connect(this.outputNode);

    // Pre-create Noise Buffer (2 seconds pink/white noise mix)
    this.noiseBuffer = this.createNoiseBuffer();

    // Modal frequencies for Creak Layer (Wood/Tendon Ratchet)
    this.creakBaseFreqs = [220, 480, 850, 1450, 2800];

    // ----------------------------------------------------
    // 2. Wet Friction Layer Setup (Dual Resonant Bandpass Squelch)
    // ----------------------------------------------------
    this.frictionNoiseSource = this.ctx.createBufferSource();
    this.frictionNoiseSource.buffer = this.noiseBuffer;
    this.frictionNoiseSource.loop = true;

    // Primary High-Q Bandpass Squelch Filter
    this.frictionFilter1 = this.ctx.createBiquadFilter();
    this.frictionFilter1.type = 'bandpass';
    this.frictionFilter1.frequency.value = 600;
    this.frictionFilter1.Q.value = 16;

    // Secondary Formant Resonance Filter
    this.frictionFilter2 = this.ctx.createBiquadFilter();
    this.frictionFilter2.type = 'peaking';
    this.frictionFilter2.frequency.value = 1800;
    this.frictionFilter2.gain.value = 12.0;
    this.frictionFilter2.Q.value = 8;

    this.frictionLevelGain = this.ctx.createGain();
    this.frictionLevelGain.gain.value = 0.0;

    this.frictionNoiseSource.connect(this.frictionFilter1);
    this.frictionFilter1.connect(this.frictionFilter2);
    this.frictionFilter2.connect(this.frictionLevelGain);
    this.frictionLevelGain.connect(this.frictionGainNode);

    this.frictionNoiseSource.start();

    // Random walk LFO state
    this.frictionLfoTargetHz = 600;
    this.frictionLfoCurrentHz = 600;

    // ----------------------------------------------------
    // 3. Breath Layer Setup (Formant Filter & Deep Undulating Cycle)
    // ----------------------------------------------------
    this.breathNoiseSource = this.ctx.createBufferSource();
    this.breathNoiseSource.buffer = this.noiseBuffer;
    this.breathNoiseSource.loop = true;

    this.breathFormantNode = this.ctx.createGain();
    this.breathLevelGain = this.ctx.createGain();
    this.breathLevelGain.gain.value = 0.0;

    // 3 Formant Bandpass Filters (Vocal Tract Formants F1=380Hz, F2=950Hz, F3=2200Hz)
    const formantFreqs = [380, 950, 2200];
    this.breathFormantFilters = formantFreqs.map(freq => {
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = freq;
      f.Q.value = 4.5;
      this.breathNoiseSource.connect(f);
      f.connect(this.breathFormantNode);
      return f;
    });

    this.breathFormantNode.connect(this.breathLevelGain);
    this.breathLevelGain.connect(this.breathGainNode);

    this.breathNoiseSource.start();

    // Long-Term RMS Accumulator (1.5s time window)
    this.longTermRms = 0.0;
    this.breathPhase = 0.0;

    // Start background LFO & Breath animation loop
    this.startControlLoops();
  }

  /**
   * Helper: Generate Organic Noise AudioBuffer
   */
  createNoiseBuffer() {
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0.0;

    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      data[i] = (lastOut + 0.04 * white) / 1.04;
      lastOut = data[i];
    }
    return buffer;
  }

  /**
   * 1. Trigger Creak Layer (Tendon snapping / Ratchet Creak Impact)
   * Spawns 2 to 4 micro-pulses (ratchet creak) + sub impact thud on Onset!
   */
  triggerCreak(onsetStrength = 1.0) {
    if (this.isLayerMuted('creak')) return;

    const now = this.ctx.currentTime;
    const randFactor = this.randomness;

    // Number of micro-pulses in ratchet creak (2 - 5 pulses)
    const numPulses = 2 + Math.floor(Math.random() * 3 * randFactor);

    for (let p = 0; p < numPulses; p++) {
      const pulseOffset = p * (0.015 + Math.random() * 0.02 * randFactor); // 15ms - 35ms spacing
      const pulseTime = now + pulseOffset;

      // Noise source for impulse
      const impulseSource = this.ctx.createBufferSource();
      impulseSource.buffer = this.noiseBuffer;

      const impulseGain = this.ctx.createGain();
      const impulseDuration = 0.02 + Math.random() * 0.03 * randFactor; // 20ms - 50ms per pulse

      impulseGain.gain.setValueAtTime(0.95 * Math.pow(0.85, p), pulseTime);
      impulseGain.gain.exponentialRampToValueAtTime(0.001, pulseTime + impulseDuration);

      impulseSource.connect(impulseGain);

      // Modal Filter Bank
      const modalMixGain = this.ctx.createGain();
      modalMixGain.gain.value = 0.8;

      this.creakBaseFreqs.forEach((baseFreq) => {
        const modalFilter = this.ctx.createBiquadFilter();
        modalFilter.type = 'bandpass';

        // Pitch drift per trigger: ±(25% * randomness)
        const driftMult = 1.0 + (Math.random() - 0.5) * 0.5 * randFactor;
        const freq = Math.max(80, baseFreq * driftMult * (0.75 + onsetStrength * 0.5));
        modalFilter.frequency.value = freq;
        modalFilter.Q.value = 12 + Math.random() * 18 * randFactor;

        impulseGain.connect(modalFilter);
        modalFilter.connect(modalMixGain);
      });

      // Decay Envelope per pulse
      const creakEnv = this.ctx.createGain();
      creakEnv.gain.setValueAtTime(1.0, pulseTime);
      creakEnv.gain.exponentialRampToValueAtTime(0.001, pulseTime + impulseDuration + 0.04);

      modalMixGain.connect(creakEnv);
      creakEnv.connect(this.creakGainNode);

      impulseSource.start(pulseTime, Math.random() * 1.5, impulseDuration);
      impulseSource.stop(pulseTime + impulseDuration + 0.01);
    }

    // Low-end Sub Impact Thud on Creak (Organic visceral feeling)
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'sine';

    const subStartHz = 140 * (0.8 + onsetStrength * 0.4);
    subOsc.frequency.setValueAtTime(subStartHz, now);
    subOsc.frequency.exponentialRampToValueAtTime(35, now + 0.14);

    subGain.gain.setValueAtTime(0.8, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    subOsc.connect(subGain);
    subGain.connect(this.creakGainNode);

    subOsc.start(now);
    subOsc.stop(now + 0.16);
  }

  /**
   * Continuous Updates driven by RMS Tension Envelope & Spectral Centroid
   */
  updateFeatures(rms, spectralCentroid) {
    const now = this.ctx.currentTime;
    const randFactor = this.randomness;

    // Apply Sensitivity Boost Multiplier
    const boostedRms = Math.min(1.0, rms * this.sensitivityBoost);

    // ----------------------------------------------------
    // Update Wet Friction Layer (Dramatic Squelch)
    // ----------------------------------------------------
    if (!this.isLayerMuted('friction')) {
      // Dynamic level scales dramatically with boosted RMS
      const targetFrictionGain = Math.min(1.0, Math.pow(boostedRms * 1.6, 0.75));
      this.frictionLevelGain.gain.setTargetAtTime(targetFrictionGain, now, 0.03);

      // Random Walk Target calculation: Cutoff sweeps widely between 180Hz and 4200Hz
      if (Math.random() < 0.25 + boostedRms * 0.5) {
        const baseCenterHz = 250 + boostedRms * 3200 + (spectralCentroid ? spectralCentroid * 0.4 : 0);
        const randomJitter = (Math.random() - 0.5) * 1200 * randFactor;
        this.frictionLfoTargetHz = Math.max(150, Math.min(5000, baseCenterHz + randomJitter));
      }
    } else {
      this.frictionLevelGain.gain.setTargetAtTime(0.0, now, 0.03);
    }

    // ----------------------------------------------------
    // Update Breath Layer (Long-Term Tension Accumulation)
    // ----------------------------------------------------
    const longTermAlpha = 0.94;
    this.longTermRms = longTermAlpha * this.longTermRms + (1.0 - longTermAlpha) * boostedRms;
  }

  /**
   * Background Control Loop: Random Walk LFO & Breath Undulation
   */
  startControlLoops() {
    const updateIntervalMs = 25;

    setInterval(() => {
      const now = this.ctx.currentTime;

      // 1. Smoothly interpolate Friction Filter Cutoffs towards Random Walk target
      if (this.frictionFilter1 && !this.isLayerMuted('friction')) {
        this.frictionLfoCurrentHz += (this.frictionLfoTargetHz - this.frictionLfoCurrentHz) * 0.18;
        const curHz = Math.max(120, this.frictionLfoCurrentHz);
        this.frictionFilter1.frequency.setTargetAtTime(curHz, now, 0.02);
        this.frictionFilter2.frequency.setTargetAtTime(curHz * 2.2, now, 0.02);
      }

      // 2. Animate Organic Breath Cycle
      if (!this.isLayerMuted('breath')) {
        const breathSpeed = 0.025 + this.longTermRms * 0.12; // Cycle rate
        this.breathPhase = (this.breathPhase + breathSpeed) % (Math.PI * 2);

        const rawBreathCycle = (Math.sin(this.breathPhase) + 1.0) / 2.0; // [0.0, 1.0]

        const minBreathLevel = 0.12;
        const tensionBreathGain = minBreathLevel + Math.pow(this.longTermRms * 1.5, 0.7) * 0.85;
        const currentBreathLevel = Math.min(1.0, tensionBreathGain * (0.35 + rawBreathCycle * 0.65));

        this.breathLevelGain.gain.setTargetAtTime(currentBreathLevel, now, 0.04);

        const formantShift = 1.0 + (rawBreathCycle - 0.5) * 0.25 * this.randomness;
        if (this.breathFormantFilters) {
          this.breathFormantFilters[0].frequency.setTargetAtTime(380 * formantShift, now, 0.04);
          this.breathFormantFilters[1].frequency.setTargetAtTime(950 * formantShift, now, 0.04);
          this.breathFormantFilters[2].frequency.setTargetAtTime(2200 * formantShift, now, 0.04);
        }
      } else {
        this.breathLevelGain.gain.setTargetAtTime(0.0, now, 0.04);
      }

    }, updateIntervalMs);
  }

  /**
   * Solo Management
   */
  setSolo(layerName, isSolo) {
    if (this.soloStates.hasOwnProperty(layerName)) {
      this.soloStates[layerName] = isSolo;
      this.updateLayerVolumes();
    }
  }

  isLayerMuted(layerName) {
    const anySoloActive = Object.values(this.soloStates).some(val => val === true);
    if (anySoloActive) {
      return !this.soloStates[layerName];
    }
    return false;
  }

  updateLayerVolumes() {
    const now = this.ctx.currentTime;
    const creakTarget = this.isLayerMuted('creak') ? 0.0 : 1.0;
    const frictionTarget = this.isLayerMuted('friction') ? 0.0 : 0.9;
    const breathTarget = this.isLayerMuted('breath') ? 0.0 : 0.75;

    this.creakGainNode.gain.setTargetAtTime(creakTarget, now, 0.03);
    this.frictionGainNode.gain.setTargetAtTime(frictionTarget, now, 0.03);
    this.breathGainNode.gain.setTargetAtTime(breathTarget, now, 0.03);
  }

  setLayerGain(layerName, val) {
    const gainNodeMap = {
      creak: this.creakGainNode,
      friction: this.frictionGainNode,
      breath: this.breathGainNode
    };
    const node = gainNodeMap[layerName];
    if (node) {
      node.gain.setTargetAtTime(val, this.ctx.currentTime, 0.02);
    }
  }
}
