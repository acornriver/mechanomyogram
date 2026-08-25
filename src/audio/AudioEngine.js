/**
 * AudioEngine: Master Web Audio API Controller
 * Initializes audio context with interactive low latency, captures raw microphone input,
 * loads AudioWorklet module, routes DSP signals, and coordinates feature extraction & synthesis.
 */

import { Mapper } from './Mapper.js';
import { OrganicMuscleSynth } from './OrganicMuscleSynth.js';
import { GranularSynth } from './GranularSynth.js';
import { ToneSynth } from './ToneSynth.js';
import { Mixer } from './Mixer.js';
import { FeedbackSuppressor } from './FeedbackSuppressor.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.micStream = null;
    this.sourceNode = null;
    this.workletNode = null;
    this.analyser = null;

    // Sub-modules
    this.mapper = new Mapper();
    this.organicSynth = null;
    this.granularSynth = null;
    this.toneSynth = null;
    this.mixer = null;
    this.feedbackSuppressor = null;

    // Callbacks for UI updates
    this.onFeatureUpdate = null;
    this.onDeviceList = null;
    this.onLatencyUpdate = null;
    this.onStreamChange = null;

    this.isInitialized = false;
    this.currentDeviceId = null;
    this.workletModuleLoaded = false;

    // Stored DSP Params
    this.params = {
      inputGainDb: 0.0,
      hpfCutoff: 40.0,
      bpfLowCut: 60.0,
      bpfHighCut: 4000.0,
      gateThresholdDb: -48.0,
      onsetThreshold: 0.08,
      refractoryMs: 75.0,
      rmsSmoothTimeMs: 50.0
    };
  }

  cleanupStream() {
    if (this.micStream) {
      this.micStream.getTracks().forEach(track => {
        try { track.stop(); } catch (_) {}
      });
      this.micStream = null;
    }

    if (this.sourceNode) {
      try { this.sourceNode.disconnect(); } catch (_) {}
      this.sourceNode = null;
    }

    if (this.workletNode) {
      try {
        this.workletNode.disconnect();
        this.workletNode.port.onmessage = null;
      } catch (_) {}
      this.workletNode = null;
    }
  }

  async setAudioInput(selectedDeviceId = null) {
    if (!this.ctx) {
      throw new Error('AudioContext is not initialized.');
    }

    // Clean up existing media stream & nodes
    this.cleanupStream();

    const targetDeviceId = selectedDeviceId || '';
    const constraints = {
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        latency: 0
      }
    };

    if (targetDeviceId && targetDeviceId !== 'default') {
      constraints.audio.deviceId = { exact: targetDeviceId };
    }

    try {
      this.micStream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      // Fallback if exact device constraint fails
      if (constraints.audio.deviceId) {
        console.warn('Exact device constraint failed, falling back to default input:', err);
        delete constraints.audio.deviceId;
        this.micStream = await navigator.mediaDevices.getUserMedia(constraints);
      } else {
        throw err;
      }
    }

    if (this.onStreamChange) {
      this.onStreamChange(this.micStream);
    }

    this.currentDeviceId = targetDeviceId;
    this.sourceNode = this.ctx.createMediaStreamSource(this.micStream);

    // Create Worklet Node
    this.workletNode = new AudioWorkletNode(this.ctx, 'muscle-processor');
    this.sourceNode.connect(this.workletNode);

    // Debug raw feed routing
    const rawFeedGain = this.ctx.createGain();
    this.workletNode.connect(rawFeedGain);
    if (this.mixer) {
      rawFeedGain.connect(this.mixer.rawGainNode);
    }

    // Connect to Analyser
    if (this.analyser) {
      this.workletNode.connect(this.analyser);
    }

    // Worklet Message Handler (Biophysical Features)
    this.workletNode.port.onmessage = (event) => {
      if (event.data.type === 'features') {
        this.handleFeatures(event.data);
      }
    };

    // Re-apply DSP parameters to new worklet node
    this.updateWorkletParams(this.params);

    this.updateLatencyInfo();
    await this.enumerateAudioDevices();
  }

  async init(selectedDeviceId = null) {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx({
        latencyHint: 'interactive',
        sampleRate: 44100
      });
    }

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    // Initialize Synths & Mixer once
    if (!this.organicSynth) {
      this.organicSynth = new OrganicMuscleSynth(this.ctx);
      this.granularSynth = new GranularSynth(this.ctx);
      this.toneSynth = new ToneSynth(this.ctx);
      this.mixer = new Mixer(this.ctx);
      this.feedbackSuppressor = new FeedbackSuppressor(this.ctx);

      // Connect Synths to Mixer
      this.organicSynth.outputNode.connect(this.mixer.organicGainNode);
      this.granularSynth.outputNode.connect(this.mixer.granularGainNode);
      this.toneSynth.outputNode.connect(this.mixer.toneGainNode);

      // Feedback Suppressor -> Master Gain -> Destination
      this.mixer.masterGainNode.connect(this.feedbackSuppressor.inputNode);
      this.feedbackSuppressor.outputNode.connect(this.ctx.destination);
    }

    // Create Main Analyser for Visualizers once
    if (!this.analyser) {
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.8;
    }

    // Load AudioWorklet Processor Module once
    if (!this.workletModuleLoaded) {
      try {
        await this.ctx.audioWorklet.addModule(new URL('./muscle-processor.js', import.meta.url));
      } catch (err) {
        console.warn('AudioWorklet module add error, attempting fallback URL', err);
        await this.ctx.audioWorklet.addModule('/src/audio/muscle-processor.js');
      }
      this.workletModuleLoaded = true;
    }

    // Connect Audio Input Stream
    await this.setAudioInput(selectedDeviceId);

    this.isInitialized = true;
  }

  updateWorkletParams(newParams) {
    Object.assign(this.params, newParams);
    if (this.workletNode) {
      this.workletNode.port.postMessage({
        type: 'updateParams',
        ...this.params
      });
    }
  }

  handleFeatures(data) {
    const { rms, onset, spectralCentroid, gateActive, softClipActive } = data;

    // Evaluate Mapping Curves for Synthesis Modulation
    const mappedFreq = this.mapper.mapValue(rms * 2.5, 'rmsToPitch');
    const mappedFilterCutoff = this.mapper.mapValue(rms * 3.0, 'rmsToFilter');
    const mappedGrainDensity = this.mapper.mapValue(rms * 2.0, 'rmsToGrainDensity');

    // 1. Update Organic Muscle Synth (Creak, Wet Friction, Breath)
    if (this.organicSynth) {
      this.organicSynth.updateFeatures(rms, spectralCentroid);
      if (onset) {
        this.organicSynth.triggerCreak(1.0);
      }
    }

    // 2. Legacy Tone / Granular Synths (Default muted in Mixer)
    if (this.toneSynth) {
      this.toneSynth.updateModulation(mappedFreq, mappedFilterCutoff, rms);
    }

    if (onset) {
      if (this.granularSynth) {
        this.granularSynth.triggerBurst(6, 1.25);
      }
      if (this.toneSynth) {
        this.toneSynth.triggerImpact(1.1);
      }
    }

    if (rms > 0.05 && Math.random() < mappedGrainDensity / 100) {
      if (this.granularSynth) {
        this.granularSynth.spawnGrain();
      }
    }

    // Dispatch UI Feature Updates
    if (this.onFeatureUpdate) {
      this.onFeatureUpdate({
        rms,
        onset,
        spectralCentroid,
        gateActive,
        softClipActive,
        mappedFreq,
        mappedFilterCutoff
      });
    }

    // Process Feedback Protection Check
    if (this.feedbackSuppressor) {
      this.feedbackSuppressor.update();
    }
  }

  async enumerateAudioDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(d => d.kind === 'audioinput');
      if (this.onDeviceList) {
        this.onDeviceList(audioInputs);
      }
    } catch (e) {
      console.warn('Could not enumerate devices', e);
    }
  }

  updateLatencyInfo() {
    if (!this.ctx) return;
    const baseLatency = this.ctx.baseLatency || 0;
    const outputLatency = this.ctx.outputLatency || 0;
    const totalLatencyMs = Math.round((baseLatency + outputLatency) * 1000 * 10) / 10;
    if (this.onLatencyUpdate) {
      this.onLatencyUpdate(totalLatencyMs, this.ctx.sampleRate);
    }
  }
}
