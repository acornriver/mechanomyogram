/**
 * WebRtcSender.js → High-Performance Low-Latency PCM WebSocket Audio Streamer
 * 마이크 오디오를 Web Audio ScriptProcessor로 캡처하여 16-bit PCM으로 변환 후
 * WebSocket을 통해 osc-bridge 서버로 실시간 전송합니다 (지연 시간 20~30ms).
 * WebM 헤더 누락이나 브라우저 코덱 버그 없이 언제든 즉시 연결/재생 가능합니다.
 */

export class WebRtcSender {
  constructor() {
    this.mediaStream = null;
    this.audioCtx = null;
    this.sourceNode = null;
    this.gainNode = null;
    this.processorNode = null;
    this.dummyGain = null;
    this.gain = 1.0;

    this.ws = null;
    this.wsUrl = 'ws://localhost:8080';
    this.isStreaming = false;

    this.onStatusChange = null; // (statusText, badgeType)
  }

  setStream(stream) {
    this.mediaStream = stream;
    if (this.isStreaming) {
      this._startCapture();
    }
  }

  setWsUrl(url) {
    this.wsUrl = url;
  }

  setGain(val) {
    this.gain = val;
    if (this.gainNode && this.audioCtx) {
      this.gainNode.gain.setValueAtTime(val, this.audioCtx.currentTime);
    }
  }

  // 호환성 유지 메서드
  setMode() {}
  startPeerJs() { this.updateStatus('Local WS PCM mode used', 'info'); }
  callPeerJsTarget() {}

  async startLocalSignaling() {
    this.stop();
    this.updateStatus('WS에 연결 중...', 'info');

    try {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.binaryType = 'arraybuffer';
    } catch (err) {
      this.updateStatus(`WS 오류: ${err.message}`, 'error');
      return;
    }

    this.ws.onopen = () => {
      // 송신자로 등록
      this.ws.send(JSON.stringify({ type: 'audio-join', role: 'audio-sender' }));
      this.updateStatus('서버 연결 완료. 스트리밍 시작 중...', 'info');
      this._startCapture();
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'audio-status') {
          this.updateStatus(
            `STREAMING → ${data.receivers}대 수신 중`,
            data.receivers > 0 ? 'success' : 'info'
          );
        }
        if (data.type === 'audio-peer-joined' && data.role === 'audio-receiver') {
          this.updateStatus('수신자 연결됨 ✓ STREAMING (PCM)', 'success');
        }
        if (data.type === 'audio-peer-left' && data.role === 'audio-receiver') {
          this.updateStatus('수신자 연결 끊김', 'warning');
        }
      } catch (_) {}
    };

    this.ws.onerror = () => {
      this.updateStatus('WS 연결 오류 — 서버 주소 확인 필요', 'error');
    };

    this.ws.onclose = () => {
      this.isStreaming = false;
      this._stopCapture();
      if (this.ws) this.updateStatus('OFFLINE', 'offline');
    };
  }

  _startCapture() {
    this._stopCapture();

    if (!this.mediaStream) {
      this.updateStatus('마이크 스트림 없음 — Start Audio Engine 먼저 클릭', 'warning');
      return;
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AC({ latencyHint: 'interactive' });
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      this.sourceNode = this.audioCtx.createMediaStreamSource(this.mediaStream);
      this.gainNode = this.audioCtx.createGain();
      this.gainNode.gain.setValueAtTime(this.gain, this.audioCtx.currentTime);

      // 1024 samples per chunk (~23ms at 44.1kHz / ~21ms at 48kHz)
      const bufferSize = 1024;
      this.processorNode = this.audioCtx.createScriptProcessor(bufferSize, 1, 1);

      // ScriptProcessor는 destination에 연결되어야 process 이벤트가 발생함 (무음 gain 연결)
      this.dummyGain = this.audioCtx.createGain();
      this.dummyGain.gain.value = 0.0;

      const sampleRate = this.audioCtx.sampleRate;

      this.processorNode.onaudioprocess = (e) => {
        if (!this.isStreaming || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        const inputChannel = e.inputBuffer.getChannelData(0);
        const numSamples = inputChannel.length;

        // Packet format:
        // [0..3]: Uint32 sampleRate (4 bytes)
        // [4..]: Int16 PCM samples (numSamples * 2 bytes)
        const packetBuffer = new ArrayBuffer(4 + numSamples * 2);
        const view = new DataView(packetBuffer);
        view.setUint32(0, sampleRate, true); // Little endian

        const pcm16 = new Int16Array(packetBuffer, 4);
        for (let i = 0; i < numSamples; i++) {
          let s = inputChannel[i];
          // Hard clamp
          if (s > 1.0) s = 1.0;
          else if (s < -1.0) s = -1.0;
          // Convert float (-1.0 ~ 1.0) to 16-bit PCM integer (-32768 ~ 32767)
          pcm16[i] = s < 0 ? s * 32768 : s * 32767;
        }

        try {
          this.ws.send(packetBuffer);
        } catch (err) {
          console.warn('[WebRtcSender] Failed to send PCM chunk:', err);
        }
      };

      this.sourceNode.connect(this.gainNode);
      this.gainNode.connect(this.processorNode);
      this.processorNode.connect(this.dummyGain);
      this.dummyGain.connect(this.audioCtx.destination);

      this.isStreaming = true;
      this.updateStatus('STREAMING 🎙️ (PCM Ultra-Low Latency)', 'success');
    } catch (err) {
      console.error('[WebRtcSender] Audio capture init error:', err);
      this.updateStatus(`오디오 캡처 오류: ${err.message}`, 'error');
    }
  }

  _stopCapture() {
    if (this.processorNode) {
      try {
        this.processorNode.onaudioprocess = null;
        this.processorNode.disconnect();
      } catch (_) {}
      this.processorNode = null;
    }

    if (this.gainNode) {
      try { this.gainNode.disconnect(); } catch (_) {}
      this.gainNode = null;
    }

    if (this.sourceNode) {
      try { this.sourceNode.disconnect(); } catch (_) {}
      this.sourceNode = null;
    }

    if (this.dummyGain) {
      try { this.dummyGain.disconnect(); } catch (_) {}
      this.dummyGain = null;
    }

    if (this.audioCtx) {
      try { this.audioCtx.close(); } catch (_) {}
      this.audioCtx = null;
    }

    this.isStreaming = false;
  }

  stop() {
    this._stopCapture();
    if (this.ws) {
      try { this.ws.close(); } catch (_) {}
      this.ws = null;
    }
    this.updateStatus('OFFLINE', 'offline');
  }

  updateStatus(text, type = 'info') {
    if (this.onStatusChange) {
      this.onStatusChange(text, type);
    }
  }

  tuneAudioSdp(sdp) { return sdp; }
}
