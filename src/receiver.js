/**
 * receiver.js — WebSocket Audio Receiver (MediaSource Streaming)
 * MediaRecorder 청크를 MediaSource SourceBuffer에 순차적으로 append하여 재생.
 * decodeAudioData 불필요 — 브라우저가 직접 WebM/Opus를 스트리밍 재생.
 */

document.addEventListener('DOMContentLoaded', () => {
  const statusBadge    = document.getElementById('receiver-status-badge');
  const wsUrlInput     = document.getElementById('ws-server-url');
  const btnConnect     = document.getElementById('btn-connect-local');
  const btnUnlock      = document.getElementById('btn-audio-unlock');
  const audioStateLabel= document.getElementById('audio-state-label');
  const volSlider      = document.getElementById('output-volume');
  const volVal         = document.getElementById('output-volume-val');
  const vuBar          = document.getElementById('vu-bar');
  const vuText         = document.getElementById('vu-text');
  const audioEl        = document.getElementById('remote-audio');

  // Radio UI 초기화 (PeerJS 탭 숨김)
  const localModeBox  = document.getElementById('local-mode-box');
  const peerjsModeBox = document.getElementById('peerjs-mode-box');
  document.querySelectorAll('input[name="signaling-mode"]').forEach(r => {
    r.addEventListener('change', e => {
      localModeBox.style.display  = e.target.value === 'local'   ? 'flex' : 'none';
      peerjsModeBox.style.display = e.target.value === 'peerjs'  ? 'flex' : 'none';
    });
  });

  // 서브 노트북 IP를 WS URL에 자동 반영
  const currentHost = window.location.hostname || 'localhost';
  wsUrlInput.value = `ws://${currentHost}:8080`;

  // ─────────────────────────────────────────────
  // 상태
  // ─────────────────────────────────────────────
  let ws          = null;
  let audioCtx    = null;
  let gainNode    = null;
  let analyser    = null;
  let mediaSource = null;
  let sourceBuffer= null;
  let appendQueue = [];   // Blob 큐
  let appending   = false;
  let audioSrcConnected = false;
  let chunksReceived = 0;

  // 지원 mimeType 자동 선택
  const MIME_CANDIDATES = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
  ];
  const MIME_TYPE = MIME_CANDIDATES.find(t => {
    try { return MediaSource.isTypeSupported(t); } catch(_) { return false; }
  }) || 'audio/webm;codecs=opus';

  console.log('[Receiver] Selected MIME type:', MIME_TYPE);

  // ─────────────────────────────────────────────
  // AudioContext (VU 미터용)
  // ─────────────────────────────────────────────
  function initAudioContext() {
    if (audioCtx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AC({ latencyHint: 'interactive' });
    gainNode  = audioCtx.createGain();
    gainNode.gain.value = parseFloat(volSlider.value) / 100;
    analyser  = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.7;
    gainNode.connect(analyser);
    analyser.connect(audioCtx.destination);
    requestAnimationFrame(drawVu);
    console.log('[Receiver] AudioContext created, state:', audioCtx.state);
  }

  function connectAudioElement() {
    if (audioSrcConnected || !audioCtx) return;
    try {
      const src = audioCtx.createMediaElementSource(audioEl);
      src.connect(gainNode);
      audioSrcConnected = true;
      console.log('[Receiver] audioEl connected to Web Audio graph');
    } catch (e) {
      console.warn('[Receiver] createMediaElementSource failed:', e.message);
    }
  }

  btnUnlock.addEventListener('click', async () => {
    initAudioContext();
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    audioStateLabel.textContent = `AudioContext: ${audioCtx.state.toUpperCase()}`;
    if (audioCtx.state === 'running') {
      btnUnlock.style.background = '#059669';
      btnUnlock.textContent = '✅ Audio Engine Active';
    }
    // audioEl → gainNode 연결 (user gesture 후 가능)
    connectAudioElement();
    // 이미 재생 대기 중이면 play() 재시도
    if (audioEl.paused && mediaSource && mediaSource.readyState === 'open') {
      audioEl.play().catch(e => console.warn('[Receiver] play() blocked:', e.message));
    }
  });

  // ─────────────────────────────────────────────
  // MediaSource 설정
  // ─────────────────────────────────────────────
  function setupMediaSource() {
    // 이전 MediaSource 해제
    if (mediaSource && mediaSource.readyState === 'open') {
      try { mediaSource.endOfStream(); } catch(_) {}
    }
    sourceBuffer = null;
    appendQueue  = [];
    appending    = false;

    mediaSource  = new MediaSource();
    audioEl.src  = URL.createObjectURL(mediaSource);

    mediaSource.addEventListener('sourceopen', () => {
      console.log('[Receiver] MediaSource opened, adding SourceBuffer for:', MIME_TYPE);
      try {
        sourceBuffer = mediaSource.addSourceBuffer(MIME_TYPE);
        sourceBuffer.mode = 'sequence'; // 연속 스트리밍 핵심 설정
        sourceBuffer.addEventListener('updateend', () => {
          appending = false;
          flushQueue();
          // 데이터가 충분히 쌓이면 재생 시작
          if (audioEl.paused && audioEl.readyState >= 3) {
            audioEl.play().catch(e => console.warn('[Receiver] play():', e.message));
          }
        });
        sourceBuffer.addEventListener('error', e => {
          console.error('[Receiver] SourceBuffer error:', e);
          // 에러 시 MediaSource 재초기화
          setupMediaSource();
        });
        // 큐에 이미 쌓인 청크 처리
        flushQueue();
      } catch (e) {
        console.error('[Receiver] addSourceBuffer failed:', e.message);
      }
    });

    audioEl.onerror = e => console.error('[Receiver] audio error:', audioEl.error);
  }

  function flushQueue() {
    if (appending || !sourceBuffer || sourceBuffer.updating) return;
    if (appendQueue.length === 0) return;
    if (!mediaSource || mediaSource.readyState !== 'open') return;

    appending = true;
    const blob = appendQueue.shift();
    blob.arrayBuffer().then(ab => {
      try {
        sourceBuffer.appendBuffer(ab);
      } catch (e) {
        appending = false;
        console.warn('[Receiver] appendBuffer error:', e.message, '— reinitializing');
        setupMediaSource();
      }
    });
  }

  // ─────────────────────────────────────────────
  // WebSocket 연결
  // ─────────────────────────────────────────────
  btnConnect.addEventListener('click', () => {
    connectWs(wsUrlInput.value.trim());
  });

  function connectWs(url) {
    stopWs();
    updateStatus('연결 중...', 'info');
    chunksReceived = 0;

    try {
      ws = new WebSocket(url);
      ws.binaryType = 'blob';
    } catch (e) {
      updateStatus(`WS 오류: ${e.message}`, 'error');
      return;
    }

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'audio-join', role: 'audio-receiver' }));
      updateStatus('서버 연결 완료 — 송신자 대기 중...', 'info');
      initAudioContext();
      setupMediaSource();
      console.log('[Receiver] WS connected, MediaSource ready');
    };

    ws.onmessage = async (event) => {
      // ── JSON 제어 메시지
      if (typeof event.data === 'string') {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'audio-status') {
            updateStatus(
              data.senders > 0
                ? `🎙️ 수신 중 — 청크 수신: ${chunksReceived}`
                : '송신자 대기 중...',
              data.senders > 0 ? 'success' : 'info'
            );
          }
          if (data.type === 'audio-peer-joined' && data.role === 'audio-sender') {
            updateStatus('🎙️ 송신자 연결됨 — 오디오 수신 중', 'success');
            // 송신자 재연결 시 MediaSource 재초기화
            setupMediaSource();
          }
          if (data.type === 'audio-peer-left' && data.role === 'audio-sender') {
            updateStatus('송신자 연결 끊김', 'warning');
          }
        } catch (_) {}
        return;
      }

      // ── 바이너리 오디오 청크
      if (event.data instanceof Blob && event.data.size > 0) {
        chunksReceived++;
        appendQueue.push(event.data);
        flushQueue();

        // VU 미터를 위해 audioEl 연결 시도 (user gesture 이후)
        if (!audioSrcConnected && audioCtx) connectAudioElement();

        // 상태 업데이트 (매 10청크마다)
        if (chunksReceived % 10 === 0) {
          updateStatus(`🎙️ 수신 중 — ${chunksReceived} 청크`, 'success');
        }

        // AudioContext resume (혹시 suspended 상태라면)
        if (audioCtx && audioCtx.state === 'suspended') {
          audioCtx.resume().catch(() => {});
        }
      }
    };

    ws.onerror = () => updateStatus('WS 오류', 'error');
    ws.onclose = () => {
      ws = null;
      updateStatus('연결 끊김', 'offline');
    };
  }

  function stopWs() {
    if (ws) { try { ws.close(); } catch(_) {} ws = null; }
    appendQueue = [];
    appending   = false;
  }

  // ─────────────────────────────────────────────
  // 볼륨
  // ─────────────────────────────────────────────
  volSlider.addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    volVal.textContent = `${v}%`;
    audioEl.volume = v / 100;
    if (gainNode) gainNode.gain.value = v / 100;
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
    statusBadge.textContent   = text;
    statusBadge.className = `status-box status-${type}`;
  }
});
