/**
 * SpectrumVisualizer: FFT Frequency Spectrum Analyzer & Bandpass Tuning Guide
 * Renders real-time frequency spectrum bars with overlay highlights for the Bandpass Filter
 * low-cut and high-cut frequencies, helping users tune filter ranges visually.
 */

export class SpectrumVisualizer {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.freqData = new Uint8Array(512);
  }

  render(analyserNode, bpfLowHz = 60, bpfHighHz = 4000, sampleRate = 44100) {
    if (!analyserNode) return;

    const width = this.canvas.width;
    const height = this.canvas.height;
    const ctx = this.ctx;

    analyserNode.getByteFrequencyData(this.freqData);

    ctx.fillStyle = '#0b0f19';
    ctx.fillRect(0, 0, width, height);

    const numBins = this.freqData.length;
    const barWidth = width / numBins;

    // Convert Hz to canvas X position
    const nyquist = sampleRate / 2;
    const lowCutX = Math.floor((bpfLowHz / nyquist) * width);
    const highCutX = Math.floor((bpfHighHz / nyquist) * width);

    // Draw active Bandpass Passband Highlighted Region
    ctx.fillStyle = 'rgba(0, 242, 254, 0.08)';
    ctx.fillRect(lowCutX, 0, Math.max(2, highCutX - lowCutX), height);

    // Draw Spectrum Bars
    for (let i = 0; i < numBins; i++) {
      const val = this.freqData[i];
      const barHeight = (val / 255) * height;
      const x = i * barWidth;

      // Color spectrum based on passband vs stopband
      const binHz = (i / numBins) * nyquist;
      const isInPassband = binHz >= bpfLowHz && binHz <= bpfHighHz;

      if (isInPassband) {
        const gradient = ctx.createLinearGradient(0, height, 0, 0);
        gradient.addColorStop(0, '#00ffa3');
        gradient.addColorStop(1, '#00f2fe');
        ctx.fillStyle = gradient;
      } else {
        ctx.fillStyle = '#334155';
      }

      ctx.fillRect(x, height - barHeight, barWidth - 0.5, barHeight);
    }

    // Draw Bandpass Cutoff Vertical Marker Lines
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);

    // Low Cut Marker
    ctx.strokeStyle = '#00ffa3';
    ctx.beginPath();
    ctx.moveTo(lowCutX, 0);
    ctx.lineTo(lowCutX, height);
    ctx.stroke();

    // High Cut Marker
    ctx.strokeStyle = '#00f2fe';
    ctx.beginPath();
    ctx.moveTo(highCutX, 0);
    ctx.lineTo(highCutX, height);
    ctx.stroke();

    ctx.setLineDash([]); // Reset line dash
  }
}
