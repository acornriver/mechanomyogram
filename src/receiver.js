/**
 * receiver.js — Ultra-Low Latency PCM WebSocket Audio Receiver
 * Web Audio API Buffer Scheduling을 사용하여 16-bit PCM 패킷을 실시간(20~30ms 지연)으로 재생합니다.
 * MediaSource / MediaRecorder의 코덱 헤더 오류 없이 언제 접속해도 즉시 0초 만에 완벽 재생됩니다.
 */

document.addEventListener('DOMContentLoaded', () => {
  const statusBadge     = document.getElementById('receiver-status-badge');
  const wsUrlInput      = document.getElementById('ws-server-url');
  const btnConnect      = document.getElementById('btn-connect-local');
  const btnUnlock       = document.getElementById('btn-audio-unlock');
  const audioStateLabel = document.getElementById('audio-state-label');
  const vuBar           = document.getElementById('vu-bar');
  const vuText          = document.getElementById('vu-text');
  const outputSelect    = document.getElementById('audio-output-device');

  // Radio UI 초기화 (PeerJS 탭)
  const localModeBox  = document.getElementById('local-mode-box');
  const peerjsModeBox = document.getElementById('peerjs-mode-box');
  document.querySelectorAll('input[name="signaling-mode"]').forEach(r => {
    r.addEventListener('change', e => {
      localModeBox.style.display  = e.target.value === 'local'   ? 'flex' : 'none';
      peerjsModeBox.style.display = e.target.value === 'peerjs'  ? 'flex' : 'none';
    });
  });

  // 서브 노트북 IP를 WS URL 기본값으로 설정
  const currentHost = window.location.hostname || 'localhost';
  wsUrlInput.value = `ws://${currentHost}:8080`;

  // ─────────────────────────────────────────────
  // Web Audio Context & 재생 그래프
  // ─────────────────────────────────────────────
  let ws             = null;
  let audioCtx       = null;
  let gainNode       = null;
  let analyser       = null;
  let nextPlayTime   = 0;
  let chunksReceived = 0;
  let vuLoopStarted  = false;

  function initAudioContext() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC({ latencyHint: 'interactive' });

      gainNode = audioCtx.createGain();
      gainNode.gain.value = 1.0;

      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.7;

      gainNode.connect(analyser);
      analyser.connect(audioCtx.destination);

      nextPlayTime = 0;
      console.log('[Receiver] Web Audio Graph initialized at', audioCtx.sampleRate, 'Hz');
    }

    if (!vuLoopStarted) {
      vuLoopStarted = true;
      requestAnimationFrame(drawVu);
    }

    updateAudioStateUI();
  }

  function updateAudioStateUI() {
    if (!audioCtx) return;
    audioStateLabel.textContent = `AudioContext: ${audioCtx.state.toUpperCase()}`;
    if (audioCtx.state === 'running') {
      btnUnlock.style.background = '#059669';
      btnUnlock.style.color = '#fff';
      btnUnlock.textContent = '✅ Audio Engine Active';
    } else {
      btnUnlock.style.background = '#00ffa3';
      btnUnlock.style.color = '#0b0f19';
      btnUnlock.textContent = '🔊 Enable / Unlock Audio Playback';
    }
  }

  btnUnlock.addEventListener('click', async () => {
    initAudioContext();
    if (audioCtx.state === 'suspended') {
      try {
        await audioCtx.resume();
      } catch (err) {
        console.warn('[Receiver] resume error:', err);
      }
    }
    updateAudioStateUI();
  });

  // ─────────────────────────────────────────────
  // PCM 오디오 청크 스케줄링 재생
  // ─────────────────────────────────────────────
  function playPcmChunk(float32Data, sampleRate) {
    if (!audioCtx) {
      initAudioContext();
    }

    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
      updateAudioStateUI();
    }

    const numSamples = float32Data.length;
    const audioBuffer = audioCtx.createBuffer(1, numSamples, sampleRate);
    audioBuffer.getChannelData(0).set(float32Data);

    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(gainNode);

    const now = audioCtx.currentTime;
    const lookahead = 0.025; // 25ms jitter buffer

    if (nextPlayTime < now) {
      nextPlayTime = now + lookahead;
    }

    source.start(nextPlayTime);
    nextPlayTime += audioBuffer.duration;

    // 네트워크 지연으로 버퍼가 너무 밀렸을 경우(150ms 초과) 즉시 현재 시간으로 리셋
    if (nextPlayTime - now > 0.15) {
      nextPlayTime = now + lookahead;
    }
  }

  // ─────────────────────────────────────────────
  // WebSocket 연결
  // ─────────────────────────────────────────────
  btnConnect.addEventListener('click', () => {
    connectWs(wsUrlInput.value.trim());
  });

  wsUrlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      connectWs(wsUrlInput.value.trim());
    }
  });

  function connectWs(url) {
    stopWs();
    initAudioContext();
    updateStatus('연결 중...', 'info');
    chunksReceived = 0;

    try {
      ws = new WebSocket(url);
      ws.binaryType = 'arraybuffer';
    } catch (e) {
      updateStatus(`WS 오류: ${e.message}`, 'error');
      return;
    }

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'audio-join', role: 'audio-receiver' }));
      updateStatus('서버 연결 완료 — 송신자 대기 중...', 'info');
      console.log('[Receiver] WS connected to', url);
    };

    ws.onmessage = async (event) => {
      // ── 1. JSON 제어 메시지
      if (typeof event.data === 'string') {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'audio-status') {
            updateStatus(
              data.senders > 0
                ? `🎙️ 수신 중 (PCM) — 패킷 수신: ${chunksReceived}`
                : '송신자 대기 중...',
              data.senders > 0 ? 'success' : 'info'
            );
          }
          if (data.type === 'audio-peer-joined' && data.role === 'audio-sender') {
            updateStatus('🎙️ 송신자 연결됨 — 실시간 오디오 수신 중 (PCM)', 'success');
            nextPlayTime = 0;
          }
          if (data.type === 'audio-peer-left' && data.role === 'audio-sender') {
            updateStatus('송신자 연결 끊김', 'warning');
          }
        } catch (_) {}
        return;
      }

      // ── 2. 바이너리 16-bit PCM 오디오 패킷
      let arrayBuffer;
      if (event.data instanceof ArrayBuffer) {
        arrayBuffer = event.data;
      } else if (event.data instanceof Blob) {
        arrayBuffer = await event.data.arrayBuffer();
      } else {
        return;
      }

      if (arrayBuffer.byteLength < 6) return;

      const view = new DataView(arrayBuffer);
      const incomingSampleRate = view.getUint32(0, true); // Little endian
      const pcm16 = new Int16Array(arrayBuffer, 4);
      const numSamples = pcm16.length;

      // Int16 PCM (-32768 ~ 32767) → Float32 (-1.0 ~ 1.0)
      const float32 = new Float32Array(numSamples);
      for (let i = 0; i < numSamples; i++) {
        const val = pcm16[i];
        float32[i] = val < 0 ? val / 32768.0 : val / 32767.0;
      }

      chunksReceived++;
      playPcmChunk(float32, incomingSampleRate || 44100);

      if (chunksReceived % 30 === 0) {
        updateStatus(`🎙️ 수신 중 (PCM) — ${chunksReceived} 청크`, 'success');
      }
    };

    ws.onerror = () => updateStatus('WS 오류 — 주소 확인 필요', 'error');
    ws.onclose = () => {
      ws = null;
      updateStatus('연결 끊김 (OFFLINE)', 'offline');
    };
  }

  function stopWs() {
    if (ws) {
      try { ws.close(); } catch (_) {}
      ws = null;
    }
    nextPlayTime = 0;
  }


  // ─────────────────────────────────────────────
  // 오디오 출력 디바이스 선택 (BlackHole / VB-Cable)
  // ─────────────────────────────────────────────
  async function enumerateOutputs() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioOutputs = devices.filter(d => d.kind === 'audiooutput');
      if (outputSelect && audioOutputs.length > 0) {
        outputSelect.innerHTML = '<option value="">Default Audio Output (System Default)</option>';
        audioOutputs.forEach(dev => {
          const opt = document.createElement('option');
          opt.value = dev.deviceId;
          opt.textContent = dev.label || `Output Device (${dev.deviceId.slice(0, 5)})`;
          outputSelect.appendChild(opt);
        });
      }
    } catch (_) {}
  }

  enumerateOutputs();
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', enumerateOutputs);
  }

  outputSelect.addEventListener('change', async (e) => {
    const deviceId = e.target.value;
    if (audioCtx && typeof audioCtx.setSinkId === 'function') {
      try {
        await audioCtx.setSinkId(deviceId);
        console.log('[Receiver] Audio output switched to:', deviceId || 'default');
      } catch (err) {
        console.warn('[Receiver] setSinkId error:', err);
      }
    }
  });

  // ─────────────────────────────────────────────
  // VU 미터
  // ─────────────────────────────────────────────
  function drawVu() {
    if (analyser) {
      const buf = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      const db  = 20 * Math.log10(Math.max(1e-6, rms));
      const pct = Math.min(100, Math.max(0, Math.round((db + 60) * (100 / 60))));
      vuBar.style.width = `${pct}%`;
      vuBar.style.background = pct > 85
        ? 'linear-gradient(90deg,#00f2fe,#ff0055)'
        : pct > 60
          ? 'linear-gradient(90deg,#00f2fe,#ffcc00)'
          : 'linear-gradient(90deg,#00f2fe,#00ffa3)';
      vuText.textContent = `${db.toFixed(1)} dB`;
    }
    requestAnimationFrame(drawVu);
  }

  // ─────────────────────────────────────────────
  // 상태 배지
  // ─────────────────────────────────────────────
  function updateStatus(text, type = 'info') {
    statusBadge.textContent = text;
    statusBadge.className = `status-box status-${type}`;
  }

  // 초기 AudioContext 생성
  initAudioContext();
});
