/**
 * WebRtcSender.js → WebSocket Audio Streamer
 * MediaRecorder로 마이크 오디오를 WebM/Opus 청크로 캡처하여
 * WebSocket을 통해 osc-bridge 서버로 실시간 전송합니다.
 * (WebRTC P2P 대신 WebSocket 릴레이 방식 사용 - 로컬 LAN에서 100% 안정적)
 */

export class WebRtcSender {
  constructor() {
    this.mediaStream = null;
    this.mediaRecorder = null;
    this.ws = null;
    this.wsUrl = 'ws://localhost:8080';
    this.isStreaming = false;

    this.onStatusChange = null; // (statusText, badgeType)
  }

  setStream(stream) {
    this.mediaStream = stream;
    // 스트리밍 중 디바이스 변경 시 재시작
    if (this.isStreaming) {
      this._startRecorder();
    }
  }

  setWsUrl(url) {
    this.wsUrl = url;
  }

  // 사용하지 않는 메서드 (호환성 유지)
  setMode() {}
  startPeerJs() { this.updateStatus('Local WS mode used', 'info'); }
  callPeerJsTarget() {}

  async startLocalSignaling() {
    this.stop();
    this.updateStatus('WS에 연결 중...', 'info');

    try {
      this.ws = new WebSocket(this.wsUrl);
    } catch (err) {
      this.updateStatus(`WS 오류: ${err.message}`, 'error');
      return;
    }

    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = () => {
      // 송신자로 등록
      this.ws.send(JSON.stringify({ type: 'audio-join', role: 'audio-sender' }));
      this.updateStatus('서버 연결 완료. 스트리밍 시작 중...', 'info');
      this._startRecorder();
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
          this.updateStatus('수신자 연결됨 ✓ STREAMING', 'success');
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
      this._stopRecorder();
      if (this.ws) this.updateStatus('OFFLINE', 'offline');
    };
  }

  _startRecorder() {
    this._stopRecorder();

    if (!this.mediaStream) {
      this.updateStatus('마이크 스트림 없음 — Start Audio Engine 먼저 클릭', 'warning');
      return;
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    // 지원 가능한 MIME 타입 자동 선택
    const mimeTypes = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/ogg'
    ];
    let mimeType = '';
    for (const type of mimeTypes) {
      if (MediaRecorder.isTypeSupported(type)) {
        mimeType = type;
        break;
      }
    }

    try {
      const options = mimeType ? { mimeType, audioBitsPerSecond: 128000 } : { audioBitsPerSecond: 128000 };
      this.mediaRecorder = new MediaRecorder(this.mediaStream, options);
    } catch (err) {
      this.updateStatus(`MediaRecorder 오류: ${err.message}`, 'error');
      return;
    }

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0 && this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(e.data);
      }
    };

    this.mediaRecorder.onerror = (err) => {
      this.updateStatus(`레코더 오류: ${err.message}`, 'error');
    };

    this.mediaRecorder.start(100); // 100ms 청크 단위로 전송
    this.isStreaming = true;
    this.updateStatus('STREAMING 🎙️', 'success');
  }

  _stopRecorder() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try { this.mediaRecorder.stop(); } catch (_) {}
    }
    this.mediaRecorder = null;
    this.isStreaming = false;
  }

  stop() {
    this._stopRecorder();
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

  // 미사용 (호환성 유지)
  tuneAudioSdp(sdp) { return sdp; }
}
