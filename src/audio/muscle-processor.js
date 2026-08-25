/**
 * AudioWorkletProcessor: MuscleProcessor
 * Runs on the audio thread for ultra-low latency biophysical signal conditioning
 * and feature extraction.
 */

// Biquad Filter Helper Class for AudioWorklet
class BiquadFilter {
  constructor() {
    this.x1 = 0; this.x2 = 0;
    this.y1 = 0; this.y2 = 0;
    this.b0 = 1; this.b1 = 0; this.b2 = 0;
    this.a1 = 0; this.a2 = 0;
  }

  setHighpass(cutoff, sampleRate, q = 0.707) {
    const w0 = (2 * Math.PI * cutoff) / sampleRate;
    const cosW0 = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * q);

    const b0 = (1 + cosW0) / 2;
    const b1 = -(1 + cosW0);
    const b2 = (1 + cosW0) / 2;
    const a0 = 1 + alpha;
    const a1 = -2 * cosW0;
    const a2 = 1 - alpha;

    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = a1 / a0;
    this.a2 = a2 / a0;
  }

  setLowpass(cutoff, sampleRate, q = 0.707) {
    const w0 = (2 * Math.PI * cutoff) / sampleRate;
    const cosW0 = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * q);

    const b0 = (1 - cosW0) / 2;
    const b1 = 1 - cosW0;
    const b2 = (1 - cosW0) / 2;
    const a0 = 1 + alpha;
    const a1 = -2 * cosW0;
    const a2 = 1 - alpha;

    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = a1 / a0;
    this.a2 = a2 / a0;
  }

  process(sample) {
    const y = this.b0 * sample + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = sample;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

class MuscleProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // DSP Parameters (Configurable via UI messages)
    this.inputGainDb = 0.0;
    this.hpfCutoff = 40.0;
    this.bpfLowCut = 60.0;
    this.bpfHighCut = 4000.0;
    this.gateThresholdDb = -48.0;
    this.gateHysteresisDb = 4.0;
    this.rmsSmoothTimeMs = 50.0;
    this.onsetThreshold = 0.08;
    this.refractoryMs = 75.0;

    // Filters
    this.hpf = new BiquadFilter();
    this.bpfLow = new BiquadFilter();
    this.bpfHigh = new BiquadFilter();

    // Noise Gate state
    this.gateOpen = false;
    this.gateEnvelope = 0.0;

    // RMS tracking
    this.rmsSmoothed = 0.0;
    this.prevEnergy = 0.0;

    // Onset Refractory timer
    this.refractorySamplesLeft = 0;

    // FFT & Circular Buffer for Spectral Centroid (2048 samples)
    this.fftSize = 2048;
    this.circBuffer = new Float32Array(this.fftSize);
    this.circWritePos = 0;
    this.fftHopSamples = 512; // compute FFT every 512 samples (~11.6ms at 44.1kHz)
    this.samplesSinceLastFft = 0;

    // Pre-calculated FFT Sine/Cosine tables for performance
    this.cosTable = new Float32Array(this.fftSize);
    this.sinTable = new Float32Array(this.fftSize);
    this.hannWindow = new Float32Array(this.fftSize);
    for (let i = 0; i < this.fftSize; i++) {
      const angle = (2 * Math.PI * i) / this.fftSize;
      this.cosTable[i] = Math.cos(angle);
      this.sinTable[i] = Math.sin(angle);
      this.hannWindow[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (this.fftSize - 1)));
    }

    // Message receiver from main thread
    this.port.onmessage = (event) => {
      const data = event.data;
      if (data.type === 'updateParams') {
        if (data.inputGainDb !== undefined) this.inputGainDb = data.inputGainDb;
        if (data.hpfCutoff !== undefined) this.hpfCutoff = data.hpfCutoff;
        if (data.bpfLowCut !== undefined) this.bpfLowCut = data.bpfLowCut;
        if (data.bpfHighCut !== undefined) this.bpfHighCut = data.bpfHighCut;
        if (data.gateThresholdDb !== undefined) this.gateThresholdDb = data.gateThresholdDb;
        if (data.onsetThreshold !== undefined) this.onsetThreshold = data.onsetThreshold;
        if (data.refractoryMs !== undefined) this.refractoryMs = data.refractoryMs;
        if (data.rmsSmoothTimeMs !== undefined) this.rmsSmoothTimeMs = data.rmsSmoothTimeMs;
        this.updateFilterCoeffs();
      }
    };

    this.updateFilterCoeffs();
  }

  updateFilterCoeffs() {
    const sr = sampleRate;
    this.hpf.setHighpass(Math.max(10, this.hpfCutoff), sr);
    this.bpfLow.setHighpass(Math.max(20, this.bpfLowCut), sr);
    this.bpfHigh.setLowpass(Math.min(sr / 2 - 100, this.bpfHighCut), sr);
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];

    if (!input || input.length === 0 || !input[0]) {
      return true;
    }

    const inputChannel = input[0];
    const outputChannel = output ? output[0] : null;
    const numSamples = inputChannel.length;
    const sr = sampleRate;

    // Linear gain conversion
    const linearGain = Math.pow(10, this.inputGainDb / 20);
    const gateThreshLin = Math.pow(10, this.gateThresholdDb / 20);
    const gateCloseThreshLin = Math.pow(10, (this.gateThresholdDb - this.gateHysteresisDb) / 20);

    // RMS smoothing coefficient
    const rmsAlpha = Math.exp(-1.0 / ((this.rmsSmoothTimeMs * sr) / 1000.0));

    let frameEnergySum = 0;
    let softClipOccurred = false;

    for (let i = 0; i < numSamples; i++) {
      let sample = inputChannel[i];

      // 1. Input Gain & Soft-Clipper (tanh protection against hard skin contact spikes)
      sample *= linearGain;
      if (Math.abs(sample) > 0.95) {
        softClipOccurred = true;
      }
      sample = Math.tanh(sample);

      // 2. Signal Conditioning: HPF + BPF (Highpass + Lowpass cascaded)
      let filtered = this.hpf.process(sample);
      filtered = this.bpfLow.process(filtered);
      filtered = this.bpfHigh.process(filtered);

      // 3. Noise Gate (Hysteresis)
      const absSignal = Math.abs(filtered);
      if (absSignal > gateThreshLin) {
        this.gateOpen = true;
      } else if (absSignal < gateCloseThreshLin) {
        this.gateOpen = false;
      }

      // Smooth gate envelope (10ms attack, 50ms release)
      const gateTarget = this.gateOpen ? 1.0 : 0.0;
      const gateCoeff = this.gateOpen ? 0.01 : 0.002;
      this.gateEnvelope += (gateTarget - this.gateEnvelope) * gateCoeff;

      const gatedSample = filtered * this.gateEnvelope;

      // Output conditioned signal to audio thread output buffer
      if (outputChannel) {
        outputChannel[i] = gatedSample;
      }

      // 4. Energy & RMS Accumulation
      frameEnergySum += gatedSample * gatedSample;

      // 5. Circular Buffer Write for FFT Spectral Centroid
      this.circBuffer[this.circWritePos] = gatedSample;
      this.circWritePos = (this.circWritePos + 1) % this.fftSize;
      this.samplesSinceLastFft++;
    }

    // RMS Calculation for current 128-sample quantum
    const currentFrameRms = Math.sqrt(frameEnergySum / numSamples);
    this.rmsSmoothed = rmsAlpha * this.rmsSmoothed + (1.0 - rmsAlpha) * currentFrameRms;

    // 6. Onset Detection with Refractory Counter
    let isOnsetTriggered = false;
    const energyDelta = currentFrameRms - this.prevEnergy;
    this.prevEnergy = currentFrameRms;

    if (this.refractorySamplesLeft > 0) {
      this.refractorySamplesLeft -= numSamples;
    } else if (energyDelta > this.onsetThreshold && this.rmsSmoothed > gateThreshLin) {
      isOnsetTriggered = true;
      this.refractorySamplesLeft = Math.floor((this.refractoryMs * sr) / 1000.0);
    }

    // 7. Spectral Centroid Calculation via 2048-Sample FFT Buffer (computed every hop size)
    let spectralCentroid = 0.0;
    if (this.samplesSinceLastFft >= this.fftHopSamples) {
      this.samplesSinceLastFft = 0;
      spectralCentroid = this.calculateSpectralCentroid(sr);
    }

    // 8. Post Features to Main Thread
    this.port.postMessage({
      type: 'features',
      rms: this.rmsSmoothed,
      onset: isOnsetTriggered,
      spectralCentroid: spectralCentroid,
      gateActive: this.gateEnvelope > 0.05,
      softClipActive: softClipOccurred
    });

    return true;
  }

  /**
   * Fast Discrete Fourier Transform for Spectral Centroid on 2048-sample circular buffer
   */
  calculateSpectralCentroid(sampleRate) {
    const N = this.fftSize;
    const halfN = N / 2;
    let weightedSum = 0.0;
    let totalMagnitude = 0.0;
    const binHz = sampleRate / N;

    // Unroll circular buffer starting from oldest sample
    const startPos = this.circWritePos;

    // Calculate magnitude spectrum for 64 key logarithmically-spaced frequency bands for efficiency
    const numBins = 64;
    const maxFreq = sampleRate / 2;

    for (let k = 1; k < numBins; k++) {
      // Map bin index logarithmically/linearly up to Nyquist
      const targetBin = Math.floor(Math.pow(k / numBins, 1.5) * halfN);
      if (targetBin <= 0 || targetBin >= halfN) continue;

      let real = 0.0;
      let imag = 0.0;
      const step = 4; // Downsample DFT accumulation for performance

      for (let n = 0; n < N; n += step) {
        const bufIdx = (startPos + n) % N;
        const windowedVal = this.circBuffer[bufIdx] * this.hannWindow[n];
        const angleIdx = (n * targetBin) % N;
        real += windowedVal * this.cosTable[angleIdx];
        imag -= windowedVal * this.sinTable[angleIdx];
      }

      const mag = Math.sqrt(real * real + imag * imag);
      const freq = targetBin * binHz;

      weightedSum += freq * mag;
      totalMagnitude += mag;
    }

    if (totalMagnitude < 1e-6) return 0.0;
    return weightedSum / totalMagnitude;
  }
}

registerProcessor('muscle-processor', MuscleProcessor);
