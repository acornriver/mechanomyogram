# Mechanomyogram (MMG) Interactive System — *Silence*

A real-time biophysical muscle sound interactive and DSP processing system developed for the artwork/performance project **"Silence"**.

---

## 📖 About the Project

**"Silence"** is an artistic and musical performance work supported and selected by the **Korea National University of Arts (K-Arts / 한예종)** Artist Support & Grant Program.

This project is built upon open-source foundations and inspired by the **xsenth / Xth Sense** biophysical interactive instrument paradigm. It captures acoustic muscle vibrations (**Mechanomyogram / MMG**) via physical acoustic sensors, processing organic bio-signals in real time into interactive sound design, synthesis, OSC routing, and visual streams.

---

## ✨ Features

- **Biophysical Signal Conditioning & DSP:**
  - Low-latency real-time Web Audio API signal processing pipeline.
  - Multi-band filtering (High-pass, Band-pass, Low-pass) tailored for mechanomyographic friction and muscle contractions.
  - Dynamic noise gating, soft clipping, and feedback suppression.

- **Audio Synthesis & FX Engine:**
  - **Granular & Texture Synthesizer:** Real-time granular buffer freezing, density, jitter, and pitch shifting.
  - **Sub-Bass Resonator:** Sub-harmonic synthesis derived from physical muscle impacts.
  - **Stereo Spatial Imager & Delay:** Multi-tap feedback delay and stereo widening.

- **Feature Extraction & Modulation:**
  - Peak amplitude, RMS energy, and Spectral Centroid tracking.
  - Real-time visualizers (Waveform Oscilloscope, FFT Spectrum Analyzer, Stereo Lissajous Goniometer).

- **Network & Bridge Connectivity:**
  - **OSC (Open Sound Control) Bridge:** Broadcasts live bio-parameter control data to Max/MSP, Pure Data, SuperCollider, Ableton Live, or TouchDesigner via Node.js WebSocket/UDP bridge.
  - **WebRTC / PeerJS Remote Streaming:** Live audio streaming and control receiver interface (`receiver.html`).

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or later recommended)
- A microphone or piezo/acoustic sensor interface (e.g., Xth Sense sensor or contact mic)

### Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/acornriver/mechanomyogram.git
cd mechanomyogram
npm install
```

### Running the System

Start the web studio and the OSC bridge simultaneously:

```bash
npm run start
# or
npm run dev:all
```

Alternatively, you can run components individually:

- **Web UI & Audio Engine:**
  ```bash
  npm run dev
  ```
  Open `http://localhost:5173` in a modern Web Audio-compatible browser (Chrome, Brave, Edge).

- **OSC Bridge Server:**
  ```bash
  npm run osc-bridge
  ```

- **Remote Receiver Interface:**
  Open `receiver.html` in your browser to monitor remote audio and real-time OSC/PeerJS streams.

---

## 🛠 Tech Stack

- **Frontend & DSP:** Vanilla JavaScript (ES Modules), Web Audio API, Canvas 2D API, Vite
- **Networking:** WebSocket (`ws`), WebRTC (PeerJS), OSC (Open Sound Control)
- **Runtime:** Node.js

---

## 🙏 Acknowledgments & Credits

- **Korea National University of Arts (K-Arts / 한예종):** Supported and selected through the K-Arts Artist Support Program for the creation of *"Silence"*.
- **Open Source Community & xsenth / Xth Sense:** Built upon the open-source concept and legacy of biophysical acoustic sensing and mechanomyography instruments.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
