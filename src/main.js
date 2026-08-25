/**
 * main.js: Main Application Launcher & UI Controller
 * Binds DOM elements to AudioEngine, Mapper, Synthesizers, OscSender, Mixer, and Canvas Visualizers.
 */

import { AudioEngine } from './audio/AudioEngine.js';
import { OscSender } from './net/OscSender.js';
import { WebRtcSender } from './net/WebRtcSender.js';
import { ScopeVisualizer } from './visualizers/ScopeVisualizer.js';
import { SpectrumVisualizer } from './visualizers/SpectrumVisualizer.js';
import { TensionGraph } from './visualizers/TensionGraph.js';

document.addEventListener('DOMContentLoaded', () => {
  const audioEngine = new AudioEngine();
  const oscSender = new OscSender();
  const webRtcSender = new WebRtcSender();

  audioEngine.onStreamChange = (stream) => {
    webRtcSender.setStream(stream);
  };

  // Canvases & Visualizers
  const scopeCanvas = document.getElementById('scope-canvas');
  const spectrumCanvas = document.getElementById('spectrum-canvas');
  const tensionCanvas = document.getElementById('tension-canvas');

  const scopeVis = new ScopeVisualizer(scopeCanvas);
  const spectrumVis = new SpectrumVisualizer(spectrumCanvas);
  const tensionGraph = new TensionGraph(tensionCanvas);

  // DOM Controls
  const startBtn = document.getElementById('start-btn');
  const deviceSelect = document.getElementById('audio-device-select');
  const panicBtn = document.getElementById('panic-btn');
  const latencyDisplay = document.getElementById('latency-display');
  const softclipBadge = document.getElementById('softclip-badge');
  const feedbackBadge = document.getElementById('feedback-badge');

  // Panel 1: Signal Conditioning
  const inputGainSlider = document.getElementById('input-gain');
  const inputGainVal = document.getElementById('input-gain-val');

  const hpfCutoffSlider = document.getElementById('hpf-cutoff');
  const hpfCutoffVal = document.getElementById('hpf-cutoff-val');

  const bpfLowCutSlider = document.getElementById('bpf-lowcut');
  const bpfLowCutVal = document.getElementById('bpf-lowcut-val');

  const bpfHighCutSlider = document.getElementById('bpf-highcut');
  const bpfHighCutVal = document.getElementById('bpf-highcut-val');

  const gateThreshSlider = document.getElementById('gate-thresh');
  const gateThreshVal = document.getElementById('gate-thresh-val');

  // Presets
  const btnWide = document.getElementById('preset-wide');
  const btnFriction = document.getElementById('preset-friction');
  const btnImpact = document.getElementById('preset-impact');

  // Panel 2: Feature Extraction
  const rmsSmoothSlider = document.getElementById('rms-smooth');
  const rmsSmoothVal = document.getElementById('rms-smooth-val');

  const onsetThreshSlider = document.getElementById('onset-thresh');
  const onsetThreshVal = document.getElementById('onset-thresh-val');

  const refractoryMsSlider = document.getElementById('refractory-ms');
  const refractoryMsVal = document.getElementById('refractory-ms-val');

  const rmsBarFill = document.getElementById('rms-bar-fill');
  const rmsValueText = document.getElementById('rms-value-text');
  const centroidValText = document.getElementById('centroid-val');
  const onsetLed = document.getElementById('onset-led');

  // Panel 3: Organic Muscle Synth Controls
  const organicSensitivitySlider = document.getElementById('organic-sensitivity');
  const organicSensitivityVal = document.getElementById('organic-sensitivity-val');

  const organicRandomnessSlider = document.getElementById('organic-randomness');
  const organicRandomnessVal = document.getElementById('organic-randomness-val');

  const creakGainSlider = document.getElementById('creak-gain');
  const creakGainVal = document.getElementById('creak-gain-val');
  const btnSoloCreak = document.getElementById('btn-solo-creak');

  const frictionGainSlider = document.getElementById('friction-gain');
  const frictionGainVal = document.getElementById('friction-gain-val');
  const btnSoloFriction = document.getElementById('btn-solo-friction');

  const breathGainSlider = document.getElementById('breath-gain');
  const breathGainVal = document.getElementById('breath-gain-val');
  const btnSoloBreath = document.getElementById('btn-solo-breath');

  // Debug & Master Mixer
  const rawDebugToggle = document.getElementById('raw-debug-toggle');
  const rawDebugContainer = document.getElementById('raw-debug-container');
  const rawGainSlider = document.getElementById('raw-gain');
  const rawGainVal = document.getElementById('raw-gain-val');

  const masterGainSlider = document.getElementById('master-gain');
  const masterGainVal = document.getElementById('master-gain-val');

  // Panel 4: OSC Network Transmitter Controls
  const oscEnableToggle = document.getElementById('osc-enable-toggle');
  const oscTriggerOnlyToggle = document.getElementById('osc-trigger-only-toggle');
  const oscServerUrlInput = document.getElementById('osc-server-url');
  const oscTargetHostInput = document.getElementById('osc-target-host');
  const oscUdpPortInput = document.getElementById('osc-udp-port');
  const oscRateSlider = document.getElementById('osc-rate-slider');
  const oscRateVal = document.getElementById('osc-rate-val');
  const oscStatusBadge = document.getElementById('osc-status-badge');

  // State
  let lastFeatureData = { rms: 0, onset: false, spectralCentroid: 0 };

  // Initialize Audio Engine on Start Button Click
  startBtn.addEventListener('click', async () => {
    try {
      startBtn.textContent = '⏳ Initializing...';
      startBtn.disabled = true;

      const deviceId = deviceSelect.value || null;
      await audioEngine.init(deviceId);

      // Apply initial optimized defaults for high sensitivity
      audioEngine.updateWorkletParams({
        inputGainDb: parseFloat(inputGainSlider.value),
        gateThresholdDb: parseFloat(gateThreshSlider.value),
        onsetThreshold: parseFloat(onsetThreshSlider.value),
        rmsSmoothTimeMs: parseFloat(rmsSmoothSlider.value)
      });

      startBtn.textContent = '⚡ Engine Active';
      startBtn.classList.remove('btn-primary');
      startBtn.style.background = '#00ffa3';
      startBtn.style.color = '#0b0f19';

      // Start 60fps visualizer render loop
      requestAnimationFrame(renderLoop);
    } catch (err) {
      console.error('Failed to initialize AudioEngine', err);
      alert(`Could not start Audio Engine: ${err.message}. Please verify microphone permissions.`);
      startBtn.textContent = '🎤 Start Audio Engine';
      startBtn.disabled = false;
    }
  });

  // Device selection change
  deviceSelect.addEventListener('change', async () => {
    if (audioEngine.isInitialized) {
      try {
        await audioEngine.setAudioInput(deviceSelect.value);
      } catch (err) {
        console.error('Failed to switch audio input device', err);
        alert(`Could not switch audio input: ${err.message}`);
        // Revert dropdown selection to current active device
        deviceSelect.value = audioEngine.currentDeviceId || '';
      }
    }
  });

  // Automatically refresh device list when audio hardware is attached/detached
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', () => {
      if (audioEngine.isInitialized) {
        audioEngine.enumerateAudioDevices();
      }
    });
  }

  // Latency & Device List callbacks
  audioEngine.onLatencyUpdate = (latencyMs, sr) => {
    latencyDisplay.textContent = `Latency: ${latencyMs} ms (${sr / 1000}kHz)`;
  };

  audioEngine.onDeviceList = (devices) => {
    const activeDeviceId = audioEngine.currentDeviceId !== null ? audioEngine.currentDeviceId : deviceSelect.value;
    deviceSelect.innerHTML = '<option value="">Default Wireless Mic Input</option>';
    devices.forEach((dev, idx) => {
      const opt = document.createElement('option');
      opt.value = dev.deviceId;
      opt.textContent = dev.label || `Wireless Mic Channel ${idx + 1}`;
      deviceSelect.appendChild(opt);
    });
    // Preserve currently active device selection in UI dropdown
    deviceSelect.value = activeDeviceId || '';
  };

  // Feature Updates from Audio Engine
  audioEngine.onFeatureUpdate = (features) => {
    lastFeatureData = features;

    // Dispatch features to OSC Transmitter
    oscSender.sendFeatures(features);

    // RMS Bar & Gauge
    const rmsPct = Math.min(100, Math.round(features.rms * 100 * 3.5));
    rmsBarFill.style.width = `${rmsPct}%`;
    rmsValueText.textContent = features.rms.toFixed(3);

    // Spectral Centroid
    const centroidHz = Math.round(features.spectralCentroid);
    centroidValText.textContent = `${centroidHz} Hz`;

    // Onset LED Indicator
    if (features.onset) {
      onsetLed.classList.add('active');
      setTimeout(() => onsetLed.classList.remove('active'), 120);
    }

    // Soft Clipper Warning Badge
    if (features.softClipActive) {
      softclipBadge.classList.remove('hidden');
      setTimeout(() => softclipBadge.classList.add('hidden'), 800);
    }

    // Pass sample to Tension History Graph
    tensionGraph.addSample(features.rms, features.onset);
  };

  // Acoustic Feedback Suppressed Callback
  audioEngine.feedbackSuppressor = {
    ...audioEngine.feedbackSuppressor,
    onFeedbackDetected: (peakHz) => {
      feedbackBadge.textContent = `FEEDBACK SUPPRESSED (${peakHz} Hz)`;
      feedbackBadge.classList.remove('hidden');
      setTimeout(() => feedbackBadge.classList.add('hidden'), 2500);
    }
  };

  // Panic Mute Button
  panicBtn.addEventListener('click', () => {
    if (audioEngine.mixer) {
      const isMuted = audioEngine.mixer.togglePanicMute();
      if (isMuted) {
        panicBtn.classList.add('active');
        panicBtn.textContent = '🔇 PANIC MUTED';
      } else {
        panicBtn.classList.remove('active');
        panicBtn.textContent = '⚡ PANIC MUTE';
      }
    }
  });

  // Slider Event Listeners & Updates
  inputGainSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    inputGainVal.textContent = `${val} dB`;
    audioEngine.updateWorkletParams({ inputGainDb: val });
  });

  hpfCutoffSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    hpfCutoffVal.textContent = `${val} Hz`;
    audioEngine.updateWorkletParams({ hpfCutoff: val });
  });

  bpfLowCutSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    bpfLowCutVal.textContent = `${val} Hz`;
    audioEngine.updateWorkletParams({ bpfLowCut: val });
  });

  bpfHighCutSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    bpfHighCutVal.textContent = `${val} Hz`;
    audioEngine.updateWorkletParams({ bpfHighCut: val });
  });

  gateThreshSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    gateThreshVal.textContent = `${val} dB`;
    audioEngine.updateWorkletParams({ gateThresholdDb: val });
  });

  // Bandpass Preset Buttons
  btnWide.addEventListener('click', () => {
    bpfLowCutSlider.value = 60;
    bpfHighCutSlider.value = 4000;
    bpfLowCutVal.textContent = '60 Hz';
    bpfHighCutVal.textContent = '4000 Hz';
    audioEngine.updateWorkletParams({ bpfLowCut: 60, bpfHighCut: 4000 });
  });

  btnFriction.addEventListener('click', () => {
    bpfLowCutSlider.value = 200;
    bpfHighCutSlider.value = 2500;
    bpfLowCutVal.textContent = '200 Hz';
    bpfHighCutVal.textContent = '2500 Hz';
    audioEngine.updateWorkletParams({ bpfLowCut: 200, bpfHighCut: 2500 });
  });

  btnImpact.addEventListener('click', () => {
    bpfLowCutSlider.value = 80;
    bpfHighCutSlider.value = 800;
    bpfLowCutVal.textContent = '80 Hz';
    bpfHighCutVal.textContent = '800 Hz';
    audioEngine.updateWorkletParams({ bpfLowCut: 80, bpfHighCut: 800 });
  });

  // Feature Extraction Sliders
  rmsSmoothSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    rmsSmoothVal.textContent = `${val} ms`;
    audioEngine.updateWorkletParams({ rmsSmoothTimeMs: val });
  });

  onsetThreshSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    onsetThreshVal.textContent = val.toFixed(3);
    audioEngine.updateWorkletParams({ onsetThreshold: val });
  });

  refractoryMsSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    refractoryMsVal.textContent = `${val} ms`;
    audioEngine.updateWorkletParams({ refractoryMs: val });
  });

  // Organic Muscle Synth Controls
  organicSensitivitySlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    organicSensitivityVal.textContent = `${val}x`;
    if (audioEngine.organicSynth) {
      audioEngine.organicSynth.sensitivityBoost = val;
    }
  });

  organicRandomnessSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    organicRandomnessVal.textContent = `${val}%`;
    if (audioEngine.organicSynth) {
      audioEngine.organicSynth.randomness = val / 100.0;
    }
  });

  creakGainSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value) / 100;
    creakGainVal.textContent = `${e.target.value}%`;
    if (audioEngine.organicSynth) {
      audioEngine.organicSynth.setLayerGain('creak', val);
    }
  });

  frictionGainSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value) / 100;
    frictionGainVal.textContent = `${e.target.value}%`;
    if (audioEngine.organicSynth) {
      audioEngine.organicSynth.setLayerGain('friction', val);
    }
  });

  breathGainSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value) / 100;
    breathGainVal.textContent = `${e.target.value}%`;
    if (audioEngine.organicSynth) {
      audioEngine.organicSynth.setLayerGain('breath', val);
    }
  });

  // Layer Solo Buttons Toggle
  function toggleSolo(layerName, btn) {
    if (!audioEngine.organicSynth) return;
    const currentSoloState = audioEngine.organicSynth.soloStates[layerName];
    const newSoloState = !currentSoloState;
    audioEngine.organicSynth.setSolo(layerName, newSoloState);

    if (newSoloState) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  }

  btnSoloCreak.addEventListener('click', () => toggleSolo('creak', btnSoloCreak));
  btnSoloFriction.addEventListener('click', () => toggleSolo('friction', btnSoloFriction));
  btnSoloBreath.addEventListener('click', () => toggleSolo('breath', btnSoloBreath));

  // Debug Raw Feed Toggle
  rawDebugToggle.addEventListener('change', (e) => {
    if (e.target.checked) {
      rawDebugContainer.classList.remove('hidden');
      if (audioEngine.mixer) audioEngine.mixer.rawMuted = false;
    } else {
      rawDebugContainer.classList.add('hidden');
      if (audioEngine.mixer) {
        audioEngine.mixer.rawMuted = true;
        audioEngine.mixer.setRawLevel(0);
      }
    }
  });

  rawGainSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value) / 100;
    rawGainVal.textContent = `${e.target.value}%`;
    if (audioEngine.mixer) audioEngine.mixer.setRawLevel(val);
  });

  masterGainSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value) / 100;
    masterGainVal.textContent = `${e.target.value}%`;
    if (audioEngine.mixer) audioEngine.mixer.setMasterLevel(val);
  });

  // ----------------------------------------------------
  // OSC Transmission Controls
  // ----------------------------------------------------
  oscSender.onStatusChange = (connected, statusText) => {
    if (connected) {
      oscStatusBadge.textContent = 'ONLINE';
      oscStatusBadge.className = 'badge badge-success';
    } else {
      oscStatusBadge.textContent = 'OFFLINE';
      oscStatusBadge.className = 'badge';
    }
  };

  // Initialize OSC parameters from DOM inputs
  oscSender.setUrl(oscServerUrlInput.value.trim());
  oscSender.setTargetHost(oscTargetHostInput.value.trim());
  oscSender.setTargetUdpPort(oscUdpPortInput.value.trim());
  oscSender.setUpdateRate(parseInt(oscRateSlider.value, 10));
  if (oscTriggerOnlyToggle) {
    oscSender.setTriggerOnly(oscTriggerOnlyToggle.checked);
  }

  oscEnableToggle.addEventListener('change', (e) => {
    oscSender.setEnabled(e.target.checked);
  });

  if (oscTriggerOnlyToggle) {
    oscTriggerOnlyToggle.addEventListener('change', (e) => {
      oscSender.setTriggerOnly(e.target.checked);
    });
  }

  oscServerUrlInput.addEventListener('change', (e) => {
    oscSender.setUrl(e.target.value.trim());
  });

  oscTargetHostInput.addEventListener('input', (e) => {
    oscSender.setTargetHost(e.target.value.trim());
  });
  oscTargetHostInput.addEventListener('change', (e) => {
    oscSender.setTargetHost(e.target.value.trim());
  });

  oscUdpPortInput.addEventListener('input', (e) => {
    oscSender.setTargetUdpPort(e.target.value.trim());
  });
  oscUdpPortInput.addEventListener('change', (e) => {
    oscSender.setTargetUdpPort(e.target.value.trim());
  });

  oscRateSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    oscRateVal.textContent = `${val} Hz`;
    oscSender.setUpdateRate(val);
  });

  // ----------------------------------------------------
  // WebRTC Audio Streamer Controls
  // ----------------------------------------------------
  const webrtcEnableToggle = document.getElementById('webrtc-enable-toggle');
  const webrtcStatusBadge = document.getElementById('webrtc-status-badge');
  const webrtcWsUrlInput = document.getElementById('webrtc-ws-url');
  const webrtcPeerIdInput = document.getElementById('webrtc-peer-id');
  const webrtcLocalInputs = document.getElementById('webrtc-local-inputs');
  const webrtcPeerjsInputs = document.getElementById('webrtc-peerjs-inputs');

  let activeWebrtcMode = 'local';

  webRtcSender.onStatusChange = (statusText, badgeType) => {
    webrtcStatusBadge.textContent = statusText;
    let badgeClass = 'badge';
    if (badgeType === 'success') badgeClass = 'badge badge-success';
    else if (badgeType === 'warning') badgeClass = 'badge badge-warning';
    else if (badgeType === 'error') badgeClass = 'badge badge-danger';
    else if (badgeType === 'info') badgeClass = 'badge badge-info';
    webrtcStatusBadge.className = badgeClass;
  };

  document.querySelectorAll('input[name="webrtc-mode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      activeWebrtcMode = e.target.value;
      if (activeWebrtcMode === 'local') {
        webrtcLocalInputs.classList.remove('hidden');
        webrtcPeerjsInputs.classList.add('hidden');
      } else {
        webrtcLocalInputs.classList.add('hidden');
        webrtcPeerjsInputs.classList.remove('hidden');
      }

      if (webrtcEnableToggle.checked) {
        startWebRtcStream();
      }
    });
  });

  function startWebRtcStream() {
    if (!audioEngine.micStream) {
      alert('Microphone Audio Engine is not initialized! Please click "Start Audio Engine" first.');
      webrtcEnableToggle.checked = false;
      return;
    }

    webRtcSender.setStream(audioEngine.micStream);

    if (activeWebrtcMode === 'local') {
      const wsUrl = webrtcWsUrlInput.value.trim();
      webRtcSender.setWsUrl(wsUrl);
      webRtcSender.startLocalSignaling();
    } else {
      const peerId = webrtcPeerIdInput.value.trim() || 'mmg-sub-mic';
      webRtcSender.startPeerJs(peerId);
    }
  }

  webrtcEnableToggle.addEventListener('change', (e) => {
    if (e.target.checked) {
      startWebRtcStream();
    } else {
      webRtcSender.stop();
    }
  });

  webrtcWsUrlInput.addEventListener('change', () => {
    if (webrtcEnableToggle.checked && activeWebrtcMode === 'local') {
      startWebRtcStream();
    }
  });

  // 60fps Visualizer Animation Loop
  function renderLoop() {
    if (audioEngine.analyser) {
      const bpfLow = parseFloat(bpfLowCutSlider.value);
      const bpfHigh = parseFloat(bpfHighCutSlider.value);

      scopeVis.render(audioEngine.analyser, lastFeatureData.onset);
      spectrumVis.render(audioEngine.analyser, bpfLow, bpfHigh, audioEngine.ctx.sampleRate);
      tensionGraph.render();
    }
    requestAnimationFrame(renderLoop);
  }
});
