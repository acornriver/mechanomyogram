/**
 * OscSender: Real-Time OSC (Open Sound Control) Network Transmitter
 * Formats biophysical muscle features (RMS Tension, Onset, Spectral Centroid)
 * and transmits them over WebSockets to local/remote OSC bridge servers (Max/MSP, TouchDesigner, Ableton).
 */

export class OscSender {
  constructor() {
    this.ws = null;
    this.enabled = false;
    this.serverUrl = 'ws://localhost:8080';
    this.targetHost = '172.30.1.45';
    this.targetUdpPort = 57120;
    this.updateRateHz = 30; // 10 Hz to 60 Hz throttling

    this.triggerOnly = true;

    this.isConnected = false;
    this.lastSendTime = 0;

    // Callbacks for UI updates
    this.onStatusChange = null;

    this.latestFeatures = {
      rms: 0.0,
      onset: false,
      spectralCentroid: 0.0,
      gateActive: false
    };
  }

  setTriggerOnly(enable) {
    this.triggerOnly = enable;
  }

  setUrl(url) {
    this.serverUrl = url;
    if (this.enabled) {
      this.reconnect();
    }
  }

  setTargetHost(host) {
    this.targetHost = host ? host.trim() : '127.0.0.1';
  }

  setTargetUdpPort(port) {
    this.targetUdpPort = parseInt(port, 10) || 57120;
  }

  setUpdateRate(rateHz) {
    this.updateRateHz = Math.max(10, Math.min(60, rateHz));
  }

  setEnabled(enable) {
    this.enabled = enable;
    if (enable) {
      this.connect();
    } else {
      this.disconnect();
    }
  }

  connect() {
    if (this.ws) {
      this.disconnect();
    }

    try {
      this.ws = new WebSocket(this.serverUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        if (this.onStatusChange) {
          this.onStatusChange(true, `Connected to ${this.serverUrl}`);
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        if (this.onStatusChange) {
          this.onStatusChange(false, 'Disconnected');
        }
      };

      this.ws.onerror = (err) => {
        this.isConnected = false;
        if (this.onStatusChange) {
          this.onStatusChange(false, 'Connection Error');
        }
      };

      this.ws.onmessage = (event) => {
        // Handle incoming messages from bridge if needed
      };
    } catch (e) {
      this.isConnected = false;
      if (this.onStatusChange) {
        this.onStatusChange(false, `Error: ${e.message}`);
      }
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    if (this.onStatusChange) {
      this.onStatusChange(false, 'Disabled');
    }
  }

  reconnect() {
    this.disconnect();
    this.connect();
  }

  /**
   * Queue incoming features & dispatch OSC packets only on Onset trigger with value 1
   */
  sendFeatures(features) {
    this.latestFeatures = features;

    if (!this.enabled || !this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    // Send ONLY when onset ('툭' sound trigger) occurs
    if (features.onset) {
      this.dispatchTriggerPacket();
    }
  }

  dispatchTriggerPacket() {
    const oscBundle = {
      type: 'osc-bundle',
      targetHost: this.targetHost,
      targetPort: this.targetUdpPort,
      messages: [
        { address: '/trigger', args: [1] },
        { address: '/xth/muscle/trigger', args: [1] },
        { address: '/xth/muscle/onset', args: [1] }
      ]
    };

    try {
      this.ws.send(JSON.stringify(oscBundle));
    } catch (e) {
      console.warn('Failed to send OSC trigger WebSocket message', e);
    }
  }
}
