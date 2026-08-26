# Mechanomyogram (MMG) Interactive System — *Silence*

A real-time biophysical muscle sound interactive and DSP processing system developed for the artwork/performance project **"Silence"**.

---

## 📖 About the Project

**"Silence"** is an artistic and musical performance work conceived by artist **Chaemin Jung (정채민)** and supported by the **Seoul Foundation for Arts and Culture (서울문화재단) K-Arts Creation Support Program (k-art 제작지원사업)**.

This project is built upon open-source foundations and deeply inspired by Marco Donnarumma's pioneering biophysical interactive instrument, the [**Xth Sense**](https://res.marcodonnarumma.com/projects/xth-sense/). It captures acoustic muscle vibrations (**Mechanomyogram / MMG**) via physical acoustic sensors, processing organic bio-signals in real time into interactive sound design, synthesis, OSC routing, and visual streams.

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

## 👥 Credits & Team

- **Lead Artist / Project Concept:** Chaemin Jung (정채민)
- **Technical Direction & Software Development:** Minhyeok Kang / acornriver (강민혁)
- **Dance & Performance:** Chaeyoung (채영), Seonghyun (성현)
- **Sound Design:** Seungmin Kim (김승민)

---

## 🙏 Acknowledgments & Credits
 
- **Seoul Foundation for Arts and Culture (서울문화재단):** Supported by the Seoul Foundation for Arts and Culture through the **K-Arts Creation Support Program (k-art 제작지원사업)** for the creation of *"Silence"*.
- **Marco Donnarumma & [Xth Sense](https://res.marcodonnarumma.com/projects/xth-sense/):** With deep respect and profound gratitude to **Marco Donnarumma** for his pioneering research, artistry, and the open-source legacy of the **Xth Sense** biophysical interactive instrument paradigm, which serves as the foundational inspiration for this project.
- **Open Source Community:** Thanks to the creative coding and open-source audio DSP communities.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
