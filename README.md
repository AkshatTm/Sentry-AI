<div align="center">

# SentryOS

### AI-Powered Zero-Trust Physical Endpoint Security

[![Python 3.10+](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)](https://python.org)
[![Next.js 14](https://img.shields.io/badge/Next.js-14-000000?logo=next.js)](https://nextjs.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100%2B-009688?logo=fastapi)](https://fastapi.tiangolo.com)
[![MediaPipe](https://img.shields.io/badge/MediaPipe-Face%20Detection-4285F4?logo=google)](https://mediapipe.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**SentryOS** is a proactive, edge-compute endpoint security system that continuously verifies the physical security of a workspace using computer vision, Bluetooth proximity tethering, and adaptive UI obfuscation — all processed locally with zero cloud dependency.

[Quick Start](#quick-start) · [Architecture](#architecture) · [Features](#features) · [Documentation](#documentation) · [Demo](#demo-mode)

</div>

---

## Overview

Traditional endpoint security relies on software perimeters — VPNs, firewalls, and session timeouts. SentryOS addresses the **physical zero-trust gap**: shoulder surfing, device abandonment, and unauthorized screen viewing.

The system fuses three independent security signals into a deterministic state machine:

| Signal | Technology | Threat Mitigated |
|--------|-----------|-----------------|
| **Face Detection** | MediaPipe + OpenCV | Shoulder surfing (multiple faces), user absence (zero faces) |
| **Proximity Tether** | Web Bluetooth RSSI | Device abandonment (user walks away) |
| **Chameleon UI** | K-Means color extraction | Visual clearance feedback via ambient color theming |

## Architecture

```
┌─────────────────────────────┐     WebSocket (10 Hz)     ┌──────────────────────────────┐
│     Python Backend          │ ──────────────────────►   │      Next.js Frontend        │
│                             │    JSON sensor payload     │                              │
│  ┌────────────────────────┐ │                            │  ┌────────────────────────┐  │
│  │ Vision Thread (daemon) │ │                            │  │ useSecuritySocket()    │  │
│  │  • MediaPipe faces     │ │                            │  │ useProximityTether()   │  │
│  │  • K-Means color       │ │                            │  │ useSecurityState()     │  │
│  └──────────┬─────────────┘ │                            │  └──────────┬─────────────┘  │
│             │ mutex          │                            │             │                │
│  ┌──────────▼─────────────┐ │                            │  ┌──────────▼─────────────┐  │
│  │ ThreadSafeState        │ │                            │  │ Security State Machine │  │
│  └──────────┬─────────────┘ │                            │  │ SECURE/BLURRED/LOCKED  │  │
│             │                │                            │  └────────────────────────┘  │
│  ┌──────────▼─────────────┐ │                            │  ┌────────────────────────┐  │
│  │ FastAPI /ws broadcaster│ │                            │  │ GlassOverlay + Lock    │  │
│  └────────────────────────┘ │                            │  │ ChameleonWrapper       │  │
│                             │                            │  └────────────────────────┘  │
└─────────────────────────────┘                            └──────────────────────────────┘
```

## Features

### Active Obfuscation (Camera)
Real-time face counting via MediaPipe. If **zero or more than one** face appears in the frame, the UI instantly applies a cryptographic blur (`blur(24px) + grayscale(80%)`) to all sensitive content.

### Hardware Proximity Tether (Bluetooth)
Binds the browser session to a BLE device (smartwatch, earbuds). If the device RSSI drops below `-70 dBm` (~2 m range), the session hard-locks with a full-screen overlay.

### Chameleon UI (Adaptive Theming)
Extracts the dominant color from a center-frame ROI using MiniBatchKMeans clustering. CSS custom properties update at 60 fps via Framer Motion value tunnelling — zero React re-renders.

### Presentation Mode
Keyboard shortcuts (`Ctrl+Shift+L/B/S/0`) override sensor-driven state for live demos. A subtle presenter-only toast confirms the active override.

## Quick Start

### Prerequisites

- **Python 3.10+** with `pip`
- **Node.js 20 LTS+** with `npm`
- **Webcam** (built-in laptop camera or USB)
- **Google Chrome 91+** (for Web Bluetooth support)

### Backend

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
python main.py
```

The backend starts at `http://localhost:8000` with a WebSocket endpoint at `ws://localhost:8000/ws`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend starts at `http://localhost:3000`.

> **No Bluetooth hardware?** Start the frontend with the BLE bypass:
> ```bash
> # Windows PowerShell
> $env:NEXT_PUBLIC_BLE_BYPASS="true"; npm run dev
>
> # macOS / Linux
> NEXT_PUBLIC_BLE_BYPASS=true npm run dev
> ```

### Verify the Stack

| Check | How | Expected |
|-------|-----|----------|
| Backend health | `GET http://localhost:8000/health` | `{"status": "ok", ...}` |
| WebSocket data | Open `/dashboard` → watch TopBar | Green `WS` chip, live face count |
| Camera | Look at webcam | Face count = `1` in TopBar |
| Chameleon | Hold colored object to camera | Background glow shifts to match |

## Routes

| Path | Description |
|------|-------------|
| `/` | Login page (glassmorphism, session auth) |
| `/dashboard` | Master integrated dashboard with all security subsystems |
| `/test/bluetooth` | Isolated BLE proximity tether diagnostic |
| `/test/privacy` | Isolated WebSocket + face detection diagnostic |
| `/test/chameleon` | Chameleon color engine test harness |

## Demo Mode

During presentations, use keyboard shortcuts to override live sensor state:

| Shortcut | Result |
|----------|--------|
| `Ctrl + Shift + L` | Force **LOCKED** (full lock screen) |
| `Ctrl + Shift + B` | Force **BLURRED** (privacy blur) |
| `Ctrl + Shift + S` | Force **SECURE** (clear dashboard) |
| `Ctrl + Shift + 0` | Release override (sensors resume) |

## Project Structure

```
SentryOS_Project/
├── backend/
│   ├── main.py                  # FastAPI app, WebSocket broadcaster, health probe
│   ├── models.py                # SensorPayload dataclass, ThreadSafeState (mutex)
│   ├── vision_thread.py         # Camera capture loop, frame orchestrator
│   ├── vision_tracker.py        # MediaPipe face detection wrapper
│   ├── color_extractor.py       # ROI → K-Means → HEX color
│   └── requirements.txt         # Python dependencies
│
├── frontend/
│   └── src/
│       ├── app/
│       │   ├── page.tsx              # Login page
│       │   ├── dashboard/page.tsx    # Master dashboard
│       │   └── test/                 # Isolated test routes
│       ├── components/
│       │   ├── ChameleonWrapper.tsx   # CSS variable injection engine
│       │   ├── GlassOverlay.tsx       # Security blur/lock filter
│       │   └── LockScreen.tsx         # Full-screen BLE lock overlay
│       ├── context/
│       │   └── PresentationModeContext.tsx  # Keyboard override engine
│       └── hooks/
│           ├── useSecuritySocket.ts   # WebSocket client
│           ├── useProximityTether.ts  # Web Bluetooth lifecycle
│           ├── useSecurityState.ts    # Security state machine
│           └── useAuthGuard.ts        # Session route guard
│
├── docs/                         # Project documentation
│   ├── PRD.md                    # Product Requirements Document
│   ├── Design.md                 # System Architecture & Design
│   ├── TECH_STACK.md             # Technology Stack Reference
│   ├── state.md                  # Project Status & Changelog
│   ├── API_REFERENCE.md          # WebSocket & REST API Reference
│   ├── SETUP_GUIDE.md            # Detailed Setup & Configuration
│   └── CONTRIBUTING.md           # Contribution Guidelines
│
└── README.md                     # This file
```

## Documentation

| Document | Description |
|----------|-------------|
| [Product Requirements](docs/PRD.md) | Problem statement, feature specifications, acceptance criteria |
| [Architecture & Design](docs/Design.md) | System design, concurrency model, state machine, data flow |
| [Tech Stack](docs/TECH_STACK.md) | Technology choices with rationale |
| [Project Status](docs/state.md) | Implementation status, changelog, known limitations |
| [API Reference](docs/API_REFERENCE.md) | WebSocket protocol, REST endpoints, data contracts |
| [Setup Guide](docs/SETUP_GUIDE.md) | Detailed installation, configuration, and troubleshooting |
| [Contributing](docs/CONTRIBUTING.md) | Code standards, PR workflow, development guidelines |

## Security Model

SentryOS follows a **fail-closed** security posture:

- **No Bluetooth device** → LOCKED (not BLURRED)
- **Camera failure** → BLURRED (not SECURE)
- **WebSocket disconnect** → BLURRED (not SECURE)
- **Zero faces detected** → BLURRED (user absent)
- **Multiple faces** → BLURRED (potential shoulder surfer)
- **Exactly one face + BLE in range** → SECURE

All image processing happens **in-memory only**. No frames are saved, recorded, or transmitted. Only integer face counts and HEX color strings leave the vision pipeline.

## License

This project is developed as part of the **INT428: Artificial Intelligence Essentials** coursework at Lovely Professional University.

---

<div align="center">
  <sub>Built with MediaPipe · FastAPI · Next.js · Framer Motion · Web Bluetooth</sub>
</div>
