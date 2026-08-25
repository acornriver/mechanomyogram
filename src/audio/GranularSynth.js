/**
 * GranularSynth: Real-Time Muscle Texture Granular Synthesizer
 * Continuously records real-time muscle micro-sounds into a ring buffer
 * and triggers micro-grain bursts on muscle onset triggers or continuous tension.
 */

export class GranularSynth {
  constructor(audioContext) {
    this.ctx = audioContext;

    // Buffer length: 4 seconds circular recording buffer
    this.bufferDuration = 4.0;
    this.sampleRate = this.ctx.sampleRate;
    this.bufferSize = Math.floor(this.bufferDuration * this.sampleRate);
    this.grainBuffer = this.ctx.createBuffer(1, this.bufferSize, this.sampleRate);
    this.channelData = this.grainBuffer.getChannelData(0);

    this.writePos = 0;

    // Output node
    this.outputNode = this.ctx.createGain();
    this.outputNode.gain.value = 0.8;

    // Granular parameters
    this.grainSizeMs = 60; // Grain length (10ms - 200ms)
    this.grainPitch = 1.0; // Pitch multiplier
    this.grainDensity = 20; // Grains per second
    this.pitchJitter = 0.15; // Random pitch variation
    this.posJitterMs = 150; // Random position offset

    this.isActive = true;
    this.continuousTriggerTimer = null;
  }

  /**
   * Feed incoming processed audio frame into recording buffer
   */
  recordFrame(inputData) {
    const len = inputData.length;
    for (let i = 0; i < len; i++) {
      this.channelData[this.writePos] = inputData[i];
      this.writePos = (this.writePos + 1) % this.bufferSize;
    }
  }

  /**
   * Spawn a single micro-grain node with Hann window envelope
   */
  spawnGrain(customPitch = null) {
    if (!this.isActive) return;

    const grainDuration = Math.max(0.015, this.grainSizeMs / 1000.0);
    const now = this.ctx.currentTime;

    // Calculate source position in buffer (slightly behind current write position)
    const jitterSamples = (Math.random() - 0.5) * (this.posJitterMs / 1000.0) * this.sampleRate;
    const offsetBehindWrite = Math.floor(0.1 * this.sampleRate + jitterSamples);
    let startSample = (this.writePos - offsetBehindWrite + this.bufferSize) % this.bufferSize;

    const startOffsetSec = startSample / this.sampleRate;

    // Grain Buffer Source Node
    const source = this.ctx.createBufferSource();
    source.buffer = this.grainBuffer;

    // Pitch calculation with random jitter
    const basePitch = customPitch !== null ? customPitch : this.grainPitch;
    const pitchJitterVal = (Math.random() - 0.5) * this.pitchJitter * 2;
    source.playbackRate.value = Math.max(0.2, basePitch + pitchJitterVal);

    // Envelope Gain Node
    const grainGain = this.ctx.createGain();
    grainGain.gain.setValueAtTime(0.0, now);
    // Smooth attack and decay envelope
    const halfDur = grainDuration / 2;
    grainGain.gain.linearRampToValueAtTime(0.7, now + halfDur);
    grainGain.gain.linearRampToValueAtTime(0.0, now + grainDuration);

    source.connect(grainGain);
    grainGain.connect(this.outputNode);

    source.start(now, startOffsetSec, grainDuration);
  }

  /**
   * Trigger a burst of micro-grains on Onset Event
   */
  triggerBurst(numGrains = 6, pitchBoost = 1.2) {
    for (let i = 0; i < numGrains; i++) {
      setTimeout(() => {
        this.spawnGrain(this.grainPitch * pitchBoost);
      }, i * 12);
    }
  }
}
