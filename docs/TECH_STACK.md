# Technology Stack

| Field | Value |
|-------|-------|
| **Product** | SentryOS |
| **Version** | 2.0.0 |
| **Architecture** | Modular Monolith (Python Backend / Next.js Frontend) |
| **Last Updated** | 2026-03-02 |

---

## 1. System Requirements

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| **OS** | Windows 10 / macOS 12 / Ubuntu 20.04 | Windows 11 / macOS 14 / Ubuntu 22.04 |
| **Python** | 3.10 | 3.12 |
| **Node.js** | 20 LTS | 20 LTS (latest patch) |
| **Browser** | Chrome 91 | Chrome 120+ |
| **Camera** | Any USB/built-in webcam | 720p+ laptop webcam |
| **Bluetooth** | BLE 4.0 adapter (optional) | BLE 5.0 |
| **RAM** | 4 GB | 8 GB |
| **CPU** | Dual-core x86_64 | Quad-core (MediaPipe benefits from multi-core) |

---

## 2. Backend Stack

### 2.1 Runtime & Package Management

| Tool | Version | Purpose |
|------|---------|---------|
| **Python** | 3.10+ | Runtime for AI engine. Required for modern `asyncio`, type hints, and `match` statements |
| **pip** | Latest | Package installer. Used with `requirements.txt` (no Poetry/Pipenv) |
| **venv** | Built-in | Virtual environment isolation |

### 2.2 Framework & Networking

| Package | Version | Purpose | Rationale |
|---------|---------|---------|-----------|
| **FastAPI** | ≥ 0.100.0 | ASGI web framework | Native async support, WebSocket first-class, automatic OpenAPI docs, high performance |
| **uvicorn** | ≥ 0.23.0 | ASGI server | Production-grade ASGI server with lifespan event support |
| **websockets** | ≥ 11.0.3 | WebSocket protocol | Low-level WS implementation used internally by uvicorn |

### 2.3 Computer Vision & Machine Learning

| Package | Version | Purpose | Rationale |
|---------|---------|---------|-----------|
| **MediaPipe** | ≥ 0.10.0 | Face detection | Google's CPU-optimized ML framework; BlazeFace short-range model (≤ 2m); significantly outperforms Haar cascades and YOLO on laptop webcams in both accuracy and latency |
| **OpenCV** (`opencv-python`) | ≥ 4.8.0 | Video capture & ROI cropping | Industry standard for camera I/O; `VideoCapture` provides cross-platform webcam access |
| **scikit-learn** | ≥ 1.3.0 | Dominant color extraction | `MiniBatchKMeans` provides fast, incremental clustering on small pixel arrays |
| **NumPy** | ≥ 1.24.0 | Array operations | Bridge between OpenCV BGR frames and scikit-learn feature matrices |

### 2.4 Backend Dependencies (`requirements.txt`)

```
fastapi>=0.100.0
uvicorn[standard]>=0.23.0
websockets>=11.0.3
mediapipe>=0.10.0
opencv-python>=4.8.0
scikit-learn>=1.3.0
numpy>=1.24.0
```

---

## 3. Frontend Stack

### 3.1 Runtime & Package Management

| Tool | Version | Purpose |
|------|---------|---------|
| **Node.js** | 20 LTS+ | JavaScript runtime for Next.js build and dev server |
| **npm** | Bundled with Node | Package manager. Lockfile committed for reproducible builds |

### 3.2 Core Framework

| Package | Version | Purpose | Rationale |
|---------|---------|---------|-----------|
| **Next.js** | 14.2.4 | React framework (App Router) | File-based routing, server/client component model, optimized builds |
| **React** | ^18 | UI library | Concurrent features, Strict Mode, hooks ecosystem |
| **React DOM** | ^18 | DOM renderer | Standard React DOM binding |
| **TypeScript** | ^5 | Static typing | Strict typing on WebSocket payloads, component props, and hook contracts prevents integration errors |

### 3.3 Styling & Animation

| Package | Version | Purpose | Rationale |
|---------|---------|---------|-----------|
| **Tailwind CSS** | ^3.4.19 | Utility-first CSS | Rapid layout, `backdrop-blur` glass-morphism effects, CSS variable integration via `var()` |
| **PostCSS** | ^8.5.6 | CSS transformer | Required by Tailwind build pipeline |
| **Autoprefixer** | ^10.4.27 | Vendor prefixing | Cross-browser CSS compatibility |
| **Framer Motion** | ^12.34.3 | Animation engine | `MotionValue` tunnelling for CSS variable interpolation at 60fps; `AnimatePresence` for mount/unmount transitions; `filter` animation for blur/grayscale |

### 3.4 UI Components

| Package | Version | Purpose | Rationale |
|---------|---------|---------|-----------|
| **Lucide React** | ^0.576.0 | Icon library | Lightweight tree-shakeable SVGs; consistent stroke style; icons for Lock, Bluetooth, Shield, etc. |

### 3.5 Browser APIs (No npm package required)

| API | Specification | Browser Support | Purpose |
|-----|--------------|----------------|---------|
| **WebSocket** | RFC 6455 | All modern browsers | Real-time communication with Python backend |
| **Web Bluetooth** | W3C Draft | Chrome 91+ (experimental flag may be required) | BLE device pairing, RSSI polling, proximity detection |
| **sessionStorage** | Web Storage API | All modern browsers | Demo authentication state |

### 3.6 Development Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| **@types/node** | ^20 | Node.js type definitions |
| **@types/react** | ^18 | React type definitions |
| **@types/react-dom** | ^18 | ReactDOM type definitions |
| **@types/web-bluetooth** | ^0.0.21 | Web Bluetooth API type augmentations |
| **ESLint** | ^8 | Linting |
| **eslint-config-next** | 14.2.4 | Next.js-specific lint rules |

---

## 4. Excluded Technologies

The following are explicitly **not used** in SentryOS, by design:

| Category | Excluded | Reason |
|----------|----------|--------|
| **Database** | PostgreSQL, SQLite, Prisma, SQLAlchemy | Stateless edge system; no persistence required |
| **HTTP Client** | Axios, node-fetch | Native `WebSocket` and `fetch` APIs are sufficient |
| **State Management** | Redux, Zustand, Jotai | React Context + custom hooks provide adequate state management |
| **BLE Library** | noble, react-bluetooth | Native `navigator.bluetooth` preferred for security and bundle size |
| **Date/Time** | Moment.js, Day.js | Unix timestamps from `time.time()` are sufficient |
| **CSS-in-JS** | styled-components, Emotion | Tailwind CSS + CSS variables cover all styling needs |
| **Heavy ML Models** | YOLO, dlib, OpenCV Haar | MediaPipe BlazeFace is faster and more accurate on low-end hardware |
| **Cloud Services** | AWS, GCP, Azure | Edge-only processing; no external dependencies |

---

## 5. Environment Variables

| Variable | Runtime | Default | Description |
|----------|---------|---------|-------------|
| `SENTRY_DEBUG` | Backend | `unset` | Set to `1` to enable OpenCV debug overlay (face boxes, ROI, FPS, color swatch) |
| `NEXT_PUBLIC_BLE_BYPASS` | Frontend | `unset` | Set to `true` to skip Bluetooth tether enforcement (development/demos) |

---

## 6. Version Compatibility Matrix

| Backend | Frontend | Protocol | Status |
|---------|----------|----------|--------|
| Python 3.10 + FastAPI 0.100 | Next.js 14 + React 18 | ADR-01 JSON v1.0.0 | **Current** |

The backend and frontend communicate exclusively through the ADR-01 WebSocket JSON contract. Either side can be upgraded independently as long as the contract is maintained.
