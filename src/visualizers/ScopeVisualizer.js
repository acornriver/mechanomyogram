/**
 * ScopeVisualizer: Real-Time Oscilloscope Waveform Display
 * Draws high-frame-rate audio waveforms with neon cyber styling.
 */

export class ScopeVisualizer {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.dataArray = new Uint8Array(1024);
  }

  render(analyserNode, isTriggered = false) {
    if (!analyserNode) return;

    const width = this.canvas.width;
    const height = this.canvas.height;
    const ctx = this.ctx;

    analyserNode.getByteTimeDomainData(this.dataArray);

    ctx.fillStyle = '#0b0f19';
    ctx.fillRect(0, 0, width, height);

    // Grid lines
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    // Waveform line
    ctx.lineWidth = isTriggered ? 3 : 2;
    ctx.strokeStyle = isTriggered ? '#ff0055' : '#00f2fe';
    ctx.shadowBlur = isTriggered ? 15 : 8;
    ctx.shadowColor = isTriggered ? '#ff0055' : '#00f2fe';

    ctx.beginPath();
    const sliceWidth = width / this.dataArray.length;
    let x = 0;

    for (let i = 0; i < this.dataArray.length; i++) {
      const v = this.dataArray[i] / 128.0;
      const y = (v * height) / 2;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
      x += sliceWidth;
    }
    ctx.stroke();

    ctx.shadowBlur = 0; // Reset shadow
  }
}
