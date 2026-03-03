# System Architecture & Design

| Field | Value |
|-------|-------|
| **Product** | SentryOS |
| **Version** | 2.0.0 |
| **Pattern** | Decoupled Modular Monolith / Edge-Compute AI |
| **Last Updated** | 2026-03-02 |

---

## 1. Architectural Overview

SentryOS uses a **Decoupled Modular Monolith** architecture. Two independent runtime environments coexist in a single repository, communicating exclusively through a local WebSocket channel:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SentryOS System                                │
│                                                                             │
│  ┌──────────────────────────┐            ┌──────────────────────────────┐   │
│  │   Edge AI Engine         │  WS 10 Hz  │   Zero-Trust Terminal        │   │
│  │   Python / FastAPI       │ ──────────►│   Next.js / React            │   │
│  │                          │   JSON      │                              │   │
│  │  • Camera capture        │            │  • Security state machine    │   │
│  │  • Face detection        │            │  • Bluetooth proximity       │   │
│  │  • Color extraction      │            │  • Adaptive UI/UX            │   │
│  │  • Health monitoring     │            │  • Presentation mode         │   │
│  └──────────────────────────┘            └──────────────────────────────┘   │
│                                                                             │
│  Integration: WebSocket (ws://localhost:8000/ws)                            │
│  Direction:   Unidirectional (Server → Client push)                        │
│  Rate:        10 Hz (100ms intervals)                                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.1 Design Rationale

| Decision | Rationale |
|----------|-----------|
| **Separate runtimes** | Python's ML ecosystem (MediaPipe, scikit-learn, OpenCV) has no viable JavaScript equivalent; Next.js provides the richest browser API integration |
| **Local WebSocket** | Sub-10ms latency on localhost; no serialization overhead of REST polling; true push semantics |
| **Monorepo** | Single deployment unit; shared documentation; atomic version control |
| **Edge-only processing** | Privacy compliance (no cloud); zero network dependency; deterministic latency |

---

## 2. Module Architecture

### 2.1 Repository Structure

```
SentryOS_Project/
├── backend/                         # Python AI Engine (Port 8000)
│   ├── main.py                      # FastAPI app, lifespan, WS broadcaster, /health
│   ├── models.py                    # SensorPayload, ThreadSafeState (mutex)
│   ├── vision_thread.py             # Camera loop, frame orchestrator, debug overlay
│   ├── vision_tracker.py            # MediaPipe Face Detection wrapper
│   ├── color_extractor.py           # ROI → MiniBatchKMeans → HEX
│   ├── blaze_face_short_range.tflite # MediaPipe model artifact
│   └── requirements.txt
│
├── frontend/                        # Next.js Terminal (Port 3000)
│   └── src/
│       ├── app/
│       │   ├── page.tsx                         # Login (glassmorphism, sessionStorage)
│       │   ├── layout.tsx                       # Root layout
│       │   ├── globals.css                      # Tailwind base + CSS variables
│       │   ├── dashboard/page.tsx               # Master dashboard (auth + presentation)
│       │   └── test/
│       │       ├── bluetooth/page.tsx           # BLE hook diagnostic
│       │       ├── privacy/page.tsx             # WebSocket hook diagnostic
│       │       └── chameleon/page.tsx           # Color engine test harness
│       ├── components/
│       │   ├── ChameleonWrapper.tsx             # Motion Value → CSS variable bridge
│       │   ├── GlassOverlay.tsx                 # Security filter (blur/grayscale)
│       │   └── LockScreen.tsx                   # Full-screen BLE lock overlay
│       ├── context/
│       │   └── PresentationModeContext.tsx      # Keyboard override engine
│       ├── hooks/
│       │   ├── useSecuritySocket.ts             # WebSocket client (ADR-01)
│       │   ├── useProximityTether.ts            # Web Bluetooth lifecycle (ADR-02)
│       │   ├── useSecurityState.ts              # State machine consolidator
│       │   └── useAuthGuard.ts                  # Session route guard
│       └── types/
│           └── bluetooth.d.ts                   # Web Bluetooth TS augmentations
│
└── docs/                            # Documentation
```

### 2.2 Module Dependency Graph

```
                    ┌──────────────────────┐
                    │    Dashboard Page     │
                    └──────────┬───────────┘
                               │ uses
            ┌──────────────────┼──────────────────┐
            │                  │                  │
            ▼                  ▼                  ▼
    ┌───────────────┐  ┌──────────────┐  ┌───────────────┐
    │ useAuthGuard  │  │useSecurityState│  │Presentation   │
    └───────────────┘  └──────┬───────┘  │ModeContext    │
                              │ uses     └───────────────┘
                    ┌─────────┼─────────┐
                    ▼                   ▼
          ┌──────────────────┐  ┌──────────────────┐
          │useSecuritySocket │  │useProximityTether │
          └────────┬─────────┘  └──────────────────┘
                   │ connects
                   ▼
          ┌──────────────────┐
          │ Python Backend   │
          │ ws://…:8000/ws   │
          └──────────────────┘
```

---

## 3. Backend Architecture

### 3.1 Concurrency Model

The backend employs **thread isolation** to prevent the blocking `cv2.VideoCapture` and MediaPipe inference from stalling the async FastAPI event loop.

```
┌─────────────────────────────────┐          ┌──────────────────────────────┐
│       Vision Thread (daemon)     │          │   Main Thread (uvicorn)       │
│                                  │          │                              │
│  while running:                  │  mutex   │  FastAPI ASGI App            │
│    frame = camera.read()         │ ────────►│    /ws → broadcast loop      │
│    faces = mediapipe(frame)      │  write   │    /health → status probe    │
│    color = kmeans(roi(frame))    │          │                              │
│    state.update(faces, color)    │          │  state.get_snapshot()        │
│                                  │          │    └→ shallow dict copy      │
└─────────────────────────────────┘          └──────────────────────────────┘
```

| Thread | Responsibility | Blocking? | I/O |
|--------|---------------|-----------|-----|
| **Vision Thread** (daemon) | Camera read, face detection, color extraction | Yes (synchronous `cv2`) | Camera hardware |
| **Main Thread** (uvicorn) | ASGI event loop, WebSocket broadcast, REST | No (fully async) | Network I/O |

**Thread Safety:** All reads/writes to `SensorPayload` go through `ThreadSafeState`, which guards internal state with a `threading.Lock`. The lock is held only for shallow copies (dict snapshots), never during I/O or `await` calls, so contention is negligible.

### 3.2 Vision Pipeline

```
Camera Frame (30 FPS)
    │
    ├─── Every Frame ─────► MediaPipe Face Detection ──► face_count (int)
    │                         (short-range, ≤ 2m)
    │
    └─── Every 1.0s ──────► Center ROI (100×100px) ──► MiniBatchKMeans
                              Crop & reshape             K=3 clusters
                                                           │
                                                           ▼
                                                     dominant_color (HEX)
```

**Optimization decisions:**
- Face detection runs on **every frame** (latency-critical for security)
- Color extraction runs at **1 Hz** (aesthetic feature; CPU conservation)
- MiniBatchKMeans processes only a **100×100px ROI** (10,000 pixels vs. 2M+ for 1080p)
- `random_state=42` ensures deterministic clustering

### 3.3 Camera Lifecycle

```
Startup → Retry Loop (5 attempts, 1s → 10s backoff)
    ├── Success → system_status = "active"
    └── Failure → system_status = "camera_unavailable"
                  face_count = -1

Runtime → frame = camera.read()
    ├── Success → process normally
    └── ret=False → increment failure counter
                    5 consecutive failures → "camera_unavailable"
```

### 3.4 WebSocket Broadcasting

- **Rate:** 10 Hz (100ms intervals via `asyncio.sleep(0.1)`)
- **Direction:** Unidirectional server → client push
- **Client limit:** Single client enforced (ADR-03). Second connections receive close code `4001`.
- **Handshake:** On connect, server sends `{"event": "connected", "message": "SentryOS WebSocket ready", "version": "1.0.0"}`
- **Drain:** Background task consumes any client-sent messages to prevent buffer overflow

---

## 4. Frontend Architecture

### 4.1 Hook Abstraction Layer

All complex browser APIs (WebSocket, Bluetooth) are encapsulated in custom hooks, keeping the presentation layer focused on rendering.

| Hook | Input | Output | API |
|------|-------|--------|-----|
| `useSecuritySocket` | — | `sensorData`, `isConnected`, `socketStatus` | `ws://localhost:8000/ws` |
| `useProximityTether` | — | `isDisconnected`, `rssi`, `deviceName`, `requestPairing` | `navigator.bluetooth` |
| `useSecurityState` | (internal: both hooks above) | `securityState`, all sensor data | Composition |
| `useAuthGuard` | — | redirect side-effect | `sessionStorage` |

### 4.2 State Machine

The `useSecurityState` hook implements a deterministic finite state machine with three states. The `deriveSecurityState()` function is pure (no side effects) and exported separately for unit testing.

```
                    ┌──────────────────────┐
                    │   Sensor Inputs       │
                    │                      │
                    │  isDisconnected: bool │
                    │  faceCount: int|null  │
                    │  isConnected: bool    │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │  Priority Evaluation  │
                    │                      │
                    │  1. BLE disconnected? │──── yes ──► LOCKED
                    │  2. WS offline?       │──── yes ──► BLURRED
                    │  3. face = -1?        │──── yes ──► BLURRED
                    │  4. face = 0?         │──── yes ──► BLURRED
                    │  5. face > 1?         │──── yes ──► BLURRED
                    │  6. face = 1          │──── yes ──► SECURE
                    └──────────────────────┘
```

### 4.3 CSS Variable Engine (ChameleonWrapper)

To avoid React re-render overhead during continuous color updates, the Chameleon system uses **Motion Value Tunnelling**:

```
WebSocket dominantColor (HEX)
    │
    ▼
Framer Motion animate({ color: newHex })
    │
    ▼
MotionValue<string> onChange callback
    │
    ▼
document.documentElement.style.setProperty('--theme-primary', color)
    │
    ▼
CSS cascade: var(--theme-primary) → var(--theme-glow) → var(--theme-border)
             (via color-mix())
```

**Saturation Guard:** Colors with saturation < 15% or lightness < 10% are rejected. The system holds the last vivid color to prevent grey/black themes.

**Performance:** Zero React re-renders. The entire interpolation pipeline operates below React's reconciliation cycle at native 60 fps.

### 4.4 Security UI Components

| Component | State | Visual Effect |
|-----------|-------|--------------|
| `GlassOverlay` | SECURE | No filter; `pointerEvents: auto` |
| `GlassOverlay` | BLURRED | `blur(24px) + grayscale(80%)` ; `pointerEvents: none` |
| `GlassOverlay` | LOCKED | `blur(40px) + grayscale(100%) + brightness(40%)`; `pointerEvents: none` |
| `LockScreen` | LOCKED | Full-screen overlay with RSSI meter, device info, re-pair button |

All transitions use Framer Motion with 400ms ease-in-out easing.

### 4.5 Presentation Mode Override

The `PresentationModeContext` wraps the dashboard and provides keyboard-driven state overrides that sit **above** the sensor-derived state:

```
finalSecurityState = overrideState ?? securityState
```

| Shortcut | Override Value |
|----------|---------------|
| `Ctrl + Shift + L` | LOCKED |
| `Ctrl + Shift + B` | BLURRED |
| `Ctrl + Shift + S` | SECURE |
| `Ctrl + Shift + 0` | Release (sensors resume) |

---

## 5. Data Flow

### 5.1 End-to-End Pipeline

```
Camera ──► Vision Thread ──► ThreadSafeState ──► FastAPI /ws ──► WebSocket
  │              │                                                    │
  │         MediaPipe +                                               │
  │         K-Means                                                   │
  │                                                                   │
  └──────────────── < 250ms total ───────────────────────────────────►│
                                                                      │
                                                              useSecuritySocket
                                                                      │
                         useProximityTether ──────────────────►useSecurityState
                         (Web Bluetooth)                              │
                                                              deriveSecurityState()
                                                                      │
                                                              GlassOverlay / LockScreen
                                                              ChameleonWrapper
```

### 5.2 Error Propagation

| Failure Point | Detection | Backend Behavior | Frontend Behavior |
|--------------|-----------|-----------------|-------------------|
| Camera hardware | `cv2.read() → False` | `face_count: -1`, status: `camera_unavailable` | BLURRED |
| MediaPipe inference | Exception in vision thread | Logged; face_count unchanged | Stale data (safe) |
| WebSocket disconnect | Client `onclose` event | Slot released; ready for reconnect | BLURRED; exponential backoff reconnect |
| Bluetooth unavailable | `navigator.bluetooth === undefined` | N/A | LOCKED (fail-closed) |
| RSSI timeout (10s) | No advertisement events | N/A | LOCKED |

---

## 6. Architecture Decision Records (ADRs)

| ID | Decision | Context | Status |
|----|----------|---------|--------|
| ADR-01 | Flat WebSocket JSON schema | Minimal parsing overhead; direct field access; no nested objects | **Enforced** |
| ADR-02 | Bluetooth fail-closed (LOCKED) | Zero-trust principle: absence of proof of presence = maximum restriction | **Enforced** |
| ADR-03 | Single WebSocket client limit | Prevents state conflicts; simplifies broadcast logic; close code `4001` | **Enforced** |
| ADR-04 | Debug overlay gated by `SENTRY_DEBUG=1` | Zero overhead in production; visual debugging for development | **Enforced** |
| ADR-05 | snake_case → camelCase at hook boundary | Python convention on backend; TypeScript convention on frontend; transform once | **Enforced** |
| ADR-06 | 100ms debounce on WS connect | Survives React 18 Strict Mode mount-unmount-remount cycle | **Enforced** |
| ADR-07 | Motion Value Tunnelling for CSS variables | Zero re-renders during color transitions; native 60fps interpolation | **Enforced** |
| ADR-08 | Saturation Guard (S≥15%, L≥10%) | Prevents desaturated/dark colors from degrading UI readability | **Enforced** |
| ADR-09 | LockScreen auto-heal on BLE restore | Informational lock — system resumes automatically when tether is restored | **Enforced** |
| ADR-10 | sessionStorage for demo auth | Session self-destructs on tab close; clean state between demo runs | **Enforced** |
| ADR-11 | Presentation override above hook layer | Override doesn't pollute sensor data; clean separation of concerns | **Enforced** |

---

## 7. Security Considerations

### 7.1 Threat Model (In-Scope)

| Threat | Mitigation | Component |
|--------|-----------|-----------|
| Shoulder surfing | Active face counting + blur | Vision Thread → GlassOverlay |
| Device abandonment | BLE proximity tether | useProximityTether → LockScreen |
| Camera bypass | Fail-closed on camera fault | face_count = -1 → BLURRED |
| Bluetooth bypass | Fail-closed on BLE absence | isDisconnected = true → LOCKED |

### 7.2 Privacy Guarantees

- **No frame persistence:** Video frames exist only in memory during the processing loop. No frame is ever written to disk, transmitted over the network, or logged.
- **Metadata only:** The WebSocket payload contains only integers (`face_count`) and strings (`dominant_color`, `system_status`). No image data, facial features, or biometric identifiers are transmitted.
- **Local-only communication:** All traffic is `localhost`. No external endpoints are contacted.

### 7.3 Known Limitations

- WebSocket is unencrypted (`ws://` not `wss://`) — acceptable for localhost edge processing; would require TLS termination for network deployment.
- No WebSocket authentication beyond CORS origin validation.
- sessionStorage auth is for demo purposes only; not suitable for production.
- Camera retry exhausts after 5 attempts; requires manual restart after persistent camera failure.
