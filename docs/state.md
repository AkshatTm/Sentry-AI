# Project Status & Changelog

| Field | Value |
|-------|-------|
| **Product** | SentryOS |
| **Status** | Feature-Complete |
| **Last Updated** | 2026-03-02 |
| **Version** | 1.0.0 |

---

## Current Status

**All development phases are complete.** The application compiles cleanly (`tsc --noEmit` passes) and is ready for deployment and demonstration.

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Python AI Sensory Engine | Completed |
| Phase 2 | React Sensor Hooks (WebSocket + Bluetooth) | Completed |
| Phase 3 | Kinetic UI & Chameleon Engine | Completed |
| Phase 4 | Master Integration & Polish | Completed |

---

## Implemented Components

### Backend

| Component | File | Description |
|-----------|------|-------------|
| FastAPI Application | `backend/main.py` | Lifespan management, WebSocket broadcaster (10 Hz), REST health probe, ADR-03 single-client enforcement |
| Data Models | `backend/models.py` | `SensorPayload` dataclass, `ThreadSafeState` mutex-guarded container |
| Vision Thread | `backend/vision_thread.py` | Daemon thread: camera capture loop, frame orchestration, optional debug overlay (`SENTRY_DEBUG=1`) |
| Face Detection | `backend/vision_tracker.py` | MediaPipe BlazeFace short-range wrapper (≤ 2m, CPU-optimized) |
| Color Extraction | `backend/color_extractor.py` | Pure function: frame → center ROI (100×100px) → MiniBatchKMeans → HEX |
| Dependencies | `backend/requirements.txt` | FastAPI, uvicorn, MediaPipe, OpenCV, scikit-learn, NumPy |

### Frontend — Hooks

| Hook | File | Description |
|------|------|-------------|
| `useSecuritySocket` | `frontend/src/hooks/useSecuritySocket.ts` | WebSocket client with ADR-01 validation, React 18 Strict Mode safety (100ms debounce), exponential backoff reconnection (1s → 5s cap) |
| `useProximityTether` | `frontend/src/hooks/useProximityTether.ts` | Web Bluetooth lifecycle: `watchAdvertisements()` primary / GATT fallback, RSSI threshold (-70 dBm), 10s staleness timer, ADR-02 fail-closed |
| `useSecurityState` | `frontend/src/hooks/useSecurityState.ts` | State machine consolidator: derives `SecurityState` enum via `deriveSecurityState()` pure function, `useMemo` optimized |
| `useAuthGuard` | `frontend/src/hooks/useAuthGuard.ts` | sessionStorage route guard, redirects to `/` if `sentry_auth` key absent |

### Frontend — Components

| Component | File | Description |
|-----------|------|-------------|
| `ChameleonWrapper` | `frontend/src/components/ChameleonWrapper.tsx` | Motion Value Tunnelling for CSS variable injection at 60fps with zero re-renders. Saturation Guard rejects S < 15% and L < 10% |
| `GlassOverlay` | `frontend/src/components/GlassOverlay.tsx` | Framer Motion `filter` variants: SECURE (clear) → BLURRED (blur 24px + grayscale 80%) → LOCKED (blur 40px + grayscale 100% + brightness 40%). 400ms transitions |
| `LockScreen` | `frontend/src/components/LockScreen.tsx` | AnimatePresence full-screen overlay: pulsing lock icon, 5-bar RSSI meter, device info, re-pair button. Auto-heals on BLE restore |
| `PresentationModeProvider` | `frontend/src/context/PresentationModeContext.tsx` | Keyboard override engine: `Ctrl+Shift+L/B/S/0`. Subtle bottom-right toast. React 18 Strict Mode safe |

### Frontend — Pages

| Route | File | Description |
|-------|------|-------------|
| `/` | `frontend/src/app/page.tsx` | Glassmorphism login: pre-filled email, simulated 800ms auth, sessionStorage persistence |
| `/dashboard` | `frontend/src/app/dashboard/page.tsx` | Master dashboard: auth guard + presentation override + security state + enterprise mock content |
| `/test/bluetooth` | `frontend/src/app/test/bluetooth/page.tsx` | Isolated BLE hook state dump |
| `/test/privacy` | `frontend/src/app/test/privacy/page.tsx` | Isolated WebSocket hook state dump |
| `/test/chameleon` | `frontend/src/app/test/chameleon/page.tsx` | Color engine test harness with preset swatches, saturation guard panel, stress tests |

---

## Architecture Decision Register

| ID | Decision | Rationale | Status |
|----|----------|-----------|--------|
| ADR-01 | Flat WebSocket JSON schema | Minimal parsing; direct field access; no nested objects | Enforced |
| ADR-02 | Bluetooth fail-closed (LOCKED) | Zero-trust: absence of presence proof = maximum restriction | Enforced |
| ADR-03 | Single WebSocket client limit | Prevents state conflicts; close code `4001` | Enforced |
| ADR-04 | Debug overlay gated by `SENTRY_DEBUG=1` | Zero production overhead | Enforced |
| ADR-05 | snake_case → camelCase at hook boundary | Python/TS convention bridge; single transform point | Enforced |
| ADR-06 | 100ms debounce on WS connect | React 18 Strict Mode mount-unmount-remount survival | Enforced |
| ADR-07 | Motion Value Tunnelling for CSS | Zero re-renders during color transitions | Enforced |
| ADR-08 | Saturation Guard (S ≥ 15%, L ≥ 10%) | Prevents grey/black themes from degrading readability | Enforced |
| ADR-09 | LockScreen auto-heal on BLE restore | Informational lock; automatic session resumption | Enforced |
| ADR-10 | sessionStorage for demo auth | Self-destructs on tab close; clean demo reset | Enforced |
| ADR-11 | Presentation override above hook layer | Clean separation; sensors unaffected by override | Enforced |

---

## Known Limitations

| Area | Limitation | Impact |
|------|-----------|--------|
| WebSocket Security | No authentication beyond CORS origin validation | Acceptable for localhost; requires auth layer for network deployment |
| Camera Retry | Exhausts after 5 attempts (1s → 10s backoff) | Requires backend restart after persistent camera failure |
| Color Clustering | `MiniBatchKMeans` with `random_state=42` | Deterministic but may favor non-perceptual "dominant" in mixed scenes |
| Hot Reload | `reload=False` in uvicorn | Hot-reload unsafe with background threads; manual restart required |
| Web Bluetooth | `watchAdvertisements()` experimental | Requires Chrome flag on some builds; GATT fallback auto-activates |
| HTTPS | Web Bluetooth requires HTTPS in production | `localhost` exempt during development |
| BLE Pairing | `requestPairing()` requires user gesture | Cannot auto-trigger on mount (spec requirement) |
| Auth | sessionStorage demo auth | Not suitable for production; no password validation |

---

## Pre-Demo Checklist

### 1. Chrome BLE Flag (One-Time Setup)

1. Navigate to `chrome://flags/#enable-experimental-web-platform-features`
2. Set flag to **Enabled** → **Relaunch**
3. Verify: DevTools console → `navigator.bluetooth` returns `Bluetooth` object

> **No BLE hardware?** Set `NEXT_PUBLIC_BLE_BYPASS=true` before starting the frontend.

### 2. Start Backend

```powershell
cd backend
.venv\Scripts\Activate.ps1
python main.py
```

Expected: `Uvicorn running on http://0.0.0.0:8000` + `Camera 0 opened successfully`

Optional debug overlay: `$env:SENTRY_DEBUG="1"; python main.py`

### 3. Start Frontend

```powershell
cd frontend
npm run dev
```

With BLE bypass: `$env:NEXT_PUBLIC_BLE_BYPASS="true"; npm run dev`

### 4. Verify Stack

| Check | Expected |
|-------|----------|
| `http://localhost:3000` | Glassmorphism login card |
| Login with any password | 800ms pulse → redirect to `/dashboard` |
| TopBar WS chip | Green (connected) |
| TopBar face count | Integer (0 or 1) |
| Background glow | Color shifts with scene changes |

### 5. Presentation Shortcuts

| Shortcut | Effect |
|----------|--------|
| `Ctrl + Shift + L` | Force LOCKED |
| `Ctrl + Shift + B` | Force BLURRED |
| `Ctrl + Shift + S` | Force SECURE |
| `Ctrl + Shift + 0` | Release override (sensors resume) |

### 6. Emergency Fallbacks

| Problem | Fix |
|---------|-----|
| Camera not detected | UI enters BLURRED. Restart backend on machine with webcam |
| BLE hardware absent | Set `NEXT_PUBLIC_BLE_BYPASS=true`, restart frontend. Use `Ctrl+Shift+S` for SECURE |
| WebSocket disconnect | Restart backend. Frontend auto-reconnects (max 5s backoff) |
| Login loops | DevTools → `sessionStorage.setItem('sentry_auth','1')` → navigate to `/dashboard` |
| Multiple faces detected | Step out of frame briefly, or use `Ctrl+Shift+S` override |

---

## Changelog

### v1.0.0 (2026-03-02) — Initial Release

**Phase 4: Master Integration & Polish**
- Added `PresentationModeProvider` with keyboard shortcuts and presenter toast
- Added login page with glassmorphism design and sessionStorage auth
- Added `useAuthGuard` route protection hook
- Integrated presentation override into dashboard (`finalSecurityState = overrideState ?? securityState`)
- Added override indicator strip (yellow, z-40)

**Phase 3: Kinetic UI & Chameleon Engine**
- Added `ChameleonWrapper` with Motion Value Tunnelling and Saturation Guard
- Added `GlassOverlay` with three-state Framer Motion filter variants
- Added `LockScreen` with AnimatePresence, RSSI meter, auto-heal
- Added `useSecurityState` consolidation hook with pure `deriveSecurityState()`
- Added Chameleon test harness (`/test/chameleon`)
- Refactored dashboard to enterprise mock terminal layout

**Phase 2: React Sensor Hooks**
- Added `useSecuritySocket` with ADR-01 validation, Strict Mode safety, exponential backoff
- Added `useProximityTether` with `watchAdvertisements()` primary, GATT fallback, RSSI threshold
- Added Web Bluetooth TypeScript augmentations
- Added isolated test routes (`/test/bluetooth`, `/test/privacy`)

**Phase 1: Python AI Sensory Engine**
- Implemented FastAPI WebSocket broadcaster at 10 Hz
- Implemented MediaPipe BlazeFace face detection on daemon thread
- Implemented MiniBatchKMeans dominant color extraction at 1 Hz
- Implemented ThreadSafeState with mutex-guarded snapshots
- Implemented REST health probe (`GET /health`)
- Implemented single-client WebSocket limit (ADR-03, close code 4001)
- Implemented debug overlay gated by `SENTRY_DEBUG=1`
