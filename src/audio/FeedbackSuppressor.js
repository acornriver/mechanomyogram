/**
 * FeedbackSuppressor: Real-Time Acoustic Feedback / Howling Protection
 * Detects sharp, sustained narrow-band resonance peaks in master output signal
 * and automatically ducks master gain to prevent speaker howling.
 */

export class FeedbackSuppressor {
  constructor(audioContext) {
    this.ctx = audioContext;

    // Nodes
    this.inputNode = this.ctx.createGain();
    this.outputNode = this.ctx.createGain();
    this.duckingGainNode = this.ctx.createGain();
    this.analyser = this.ctx.createAnalyser();

    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.85;

    // Routing: input -> duckingGain -> output -> analyser
    this.inputNode.connect(this.duckingGainNode);
    this.duckingGainNode.connect(this.outputNode);
    this.duckingGainNode.connect(this.analyser);

    // Feedback Detection Parameters
    this.enabled = true;
    this.sensitivity = 0.85; // Peak ratio threshold
    this.isDucking = false;
    this.duckFactor = 1.0;
    this.recoverySpeed = 0.005;

    // Frequency buffer
    this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
    this.peakHistory = new Array(8).fill(0);

    // Callbacks
    this.onFeedbackDetected = null;
  }

  update() {
    if (!this.enabled) {
      this.duckFactor = 1.0;
      this.duckingGainNode.gain.setValueAtTime(1.0, this.ctx.currentTime);
      return;
    }

    this.analyser.getByteFrequencyData(this.freqData);

    const len = this.freqData.length;
    let maxVal = 0;
    let sumVal = 0;
    let maxBinIndex = 0;

    for (let i = 0; i < len; i++) {
      const val = this.freqData[i];
      sumVal += val;
      if (val > maxVal) {
        maxVal = val;
        maxBinIndex = i;
      }
    }

    const avgVal = sumVal / len;
    // Peak sharpness ratio: ratio of max bin to average amplitude across spectrum
    const peakRatio = avgVal > 0 ? maxVal / avgVal : 0;

    // Check if peak bin is persistently high (indicating narrow-band howl)
    this.peakHistory.shift();
    this.peakHistory.push(maxBinIndex);

    const isSamePeakStationary = this.peakHistory.every(bin => bin === maxBinIndex && bin > 10);

    // If max amplitude > 220 (out of 255) and peak ratio is very sharp and stationary
    if (maxVal > 220 && peakRatio > 4.5 && isSamePeakStationary) {
      if (!this.isDucking) {
        this.isDucking = true;
        if (this.onFeedbackDetected) {
          const peakHz = Math.round((maxBinIndex * this.ctx.sampleRate) / this.analyser.fftSize);
          this.onFeedbackDetected(peakHz);
        }
      }
      // Rapid ducking
      this.duckFactor = Math.max(0.1, this.duckFactor * 0.7);
    } else {
      // Smooth recovery
      if (this.duckFactor < 1.0) {
        this.duckFactor = Math.min(1.0, this.duckFactor + this.recoverySpeed);
        if (this.duckFactor >= 0.95) {
          this.isDucking = false;
        }
      }
    }

    this.duckingGainNode.gain.setTargetAtTime(this.duckFactor, this.ctx.currentTime, 0.05);
  }
}
