/**
 * TensionGraph: Rolling Muscle Tension (RMS) Envelope History Graph
 * Plots muscle contraction strength continuously over time with glowing onset triggers.
 */

export class TensionGraph {
  constructor(canvasElement, maxHistoryLength = 300) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.history = new Array(maxHistoryLength).fill(0);
    this.onsetMarkers = new Array(maxHistoryLength).fill(false);
  }

  addSample(rmsValue, isOnset = false) {
    this.history.shift();
    this.history.push(Math.min(1.0, rmsValue));

    this.onsetMarkers.shift();
    this.onsetMarkers.push(isOnset);
  }

  render() {
    const width = this.canvas.width;
    const height = this.canvas.height;
    const ctx = this.ctx;
    const len = this.history.length;

    ctx.fillStyle = '#0b0f19';
    ctx.fillRect(0, 0, width, height);

    // Background threshold grid
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height * 0.25); ctx.lineTo(width, height * 0.25);
    ctx.moveTo(0, height * 0.50); ctx.lineTo(width, height * 0.50);
    ctx.moveTo(0, height * 0.75); ctx.lineTo(width, height * 0.75);
    ctx.stroke();

    // Fill Tension Curve Gradient
    const gradient = ctx.createLinearGradient(0, height, 0, 0);
    gradient.addColorStop(0, 'rgba(157, 78, 221, 0.1)');
    gradient.addColorStop(1, 'rgba(157, 78, 221, 0.5)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(0, height);

    const stepX = width / (len - 1);
    for (let i = 0; i < len; i++) {
      const x = i * stepX;
      const y = height - this.history[i] * height;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();

    // Tension Line Stroke
    ctx.strokeStyle = '#9d4edd';
    ctx.lineWidth = 2;
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#9d4edd';

    ctx.beginPath();
    for (let i = 0; i < len; i++) {
      const x = i * stepX;
      const y = height - this.history[i] * height;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Draw Onset Trigger Flash Pins
    for (let i = 0; i < len; i++) {
      if (this.onsetMarkers[i]) {
        const x = i * stepX;
        const y = height - this.history[i] * height;

        ctx.fillStyle = '#ff0055';
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#ff0055';

        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.lineWidth = 1;
        ctx.strokeStyle = '#ff0055';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, height);
        ctx.stroke();

        ctx.shadowBlur = 0;
      }
    }
  }
}
