/**
 * ToneSynth: Biophysical Harmonic & Sub-Bass Synthesizer Bank
 * Dynamic FM & Sub-bass oscillator bank driven continuously by muscle tension RMS envelope.
 * Produces deep organic sub-rumble and resonant pitch shifts corresponding to muscle contraction.
 */

export class ToneSynth {
  constructor(audioContext) {
    this.ctx = audioContext;

    // Master Tone Output
    this.outputNode = this.ctx.createGain();
    this.outputNode.gain.value = 0.5;

    // Filter Node
    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 400;
    this.filter.Q.value = 4.0;

    // Gain Envelope Node
    this.synthGain = this.ctx.createGain();
    this.synthGain.gain.value = 0.0;

    // Main Carrier Oscillator
    this.carrier = this.ctx.createOscillator();
    this.carrier.type = 'sawtooth';
    this.carrier.frequency.value = 65; // C2 Base

    // Sub-Bass Oscillator
    this.subOsc = this.ctx.createOscillator();
    this.subOsc.type = 'sine';
    this.subOsc.frequency.value = 32.5; // C1 Base

    // FM Modulator Oscillator
    this.modulator = this.ctx.createOscillator();
    this.modulator.type = 'sine';
    this.modulator.frequency.value = 130;

    this.modGain = this.ctx.createGain();
    this.modGain.gain.value = 50;

    // Routing: FM Modulator -> Carrier Freq, Carrier + Sub -> Filter -> SynthGain -> Output
    this.modulator.connect(this.modGain);
    this.modGain.connect(this.carrier.frequency);

    this.carrier.connect(this.filter);
    this.subOsc.connect(this.filter);
    this.filter.connect(this.synthGain);
    this.synthGain.connect(this.outputNode);

    // Start Oscillators
    this.carrier.start();
    this.subOsc.start();
    this.modulator.start();

    // Base pitch settings
    this.basePitchHz = 65.0;
  }

  /**
   * Continuous modulation driven by mapped RMS muscle tension
   */
  updateModulation(mappedFreq, mappedFilterCutoff, rmsTension) {
    const now = this.ctx.currentTime;
    const rampTime = 0.03; // Smooth parameter response

    // Modulate Carrier & Sub Pitch
    const pitch = Math.max(30, mappedFreq);
    this.carrier.frequency.setTargetAtTime(pitch, now, rampTime);
    this.subOsc.frequency.setTargetAtTime(pitch / 2, now, rampTime);
    this.modulator.frequency.setTargetAtTime(pitch * 2, now, rampTime);

    // Modulate Filter Cutoff
    const filterCut = Math.max(80, mappedFilterCutoff);
    this.filter.frequency.setTargetAtTime(filterCut, now, rampTime);

    // Dynamic FM Depth & Gain based on tension envelope
    const fmAmount = rmsTension * 350;
    this.modGain.gain.setTargetAtTime(fmAmount, now, rampTime);

    // Dynamic synth volume tracking muscle tension
    const targetGain = Math.min(1.0, rmsTension * 2.2);
    this.synthGain.gain.setTargetAtTime(targetGain, now, rampTime);
  }

  /**
   * Percussive Sub-Impact Burst on Onset Trigger
   */
  triggerImpact(pitchMult = 1.0) {
    const now = this.ctx.currentTime;
    const impactOsc = this.ctx.createOscillator();
    const impactGain = this.ctx.createGain();

    impactOsc.type = 'sine';
    const startFreq = 180 * pitchMult;
    const endFreq = 40;

    impactOsc.frequency.setValueAtTime(startFreq, now);
    impactOsc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.12);

    impactGain.gain.setValueAtTime(0.9, now);
    impactGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    impactOsc.connect(impactGain);
    impactGain.connect(this.outputNode);

    impactOsc.start(now);
    impactOsc.stop(now + 0.26);
  }
}
