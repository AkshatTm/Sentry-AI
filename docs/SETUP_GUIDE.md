# Setup Guide

| Field | Value |
|-------|-------|
| **Product** | SentryOS |
| **Platforms** | Windows 10+, macOS 12+, Ubuntu 20.04+ |
| **Last Updated** | 2026-03-02 |

---

## 1. Prerequisites

### 1.1 Required Software

| Software | Version | Download | Verification |
|----------|---------|----------|-------------|
| **Python** | 3.10+ | [python.org](https://python.org/downloads/) | `python --version` |
| **Node.js** | 20 LTS+ | [nodejs.org](https://nodejs.org/) | `node --version` |
| **npm** | Bundled | Included with Node.js | `npm --version` |
| **Git** | Latest | [git-scm.com](https://git-scm.com/) | `git --version` |
| **Google Chrome** | 91+ | [chrome.google.com](https://www.google.com/chrome/) | `chrome://version` |

### 1.2 Hardware Requirements

| Component | Required | Recommended |
|-----------|----------|-------------|
| **Webcam** | Any USB or built-in laptop camera | 720p integrated webcam |
| **Bluetooth** | Not required (bypass available) | BLE 4.0+ adapter |
| **RAM** | 4 GB | 8 GB |
| **CPU** | Dual-core x86_64 | Quad-core |
| **Disk** | ~500 MB (dependencies) | 1 GB |

---

## 2. Installation

### 2.1 Clone the Repository

```bash
git clone https://github.com/AkshatTm/Sentry-AI.git
cd Sentry-AI
```

### 2.2 Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv .venv

# Activate — Windows PowerShell
.venv\Scripts\Activate.ps1

# Activate — Windows CMD
.venv\Scripts\activate.bat

# Activate — macOS / Linux
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

**Expected output:** All packages install without errors. `mediapipe` and `opencv-python` may take a moment to download (~100 MB total).

### 2.3 Frontend Setup

```bash
cd frontend

# Install Node.js dependencies
npm install
```

**Expected output:** All packages resolve. `framer-motion` and `lucide-react` are the largest.

---

## 3. Running the Application

### 3.1 Start the Backend

```bash
cd backend

# Activate virtual environment (if not already active)
# Windows: .venv\Scripts\Activate.ps1
# macOS/Linux: source .venv/bin/activate

python main.py
```

**Expected console output:**

```
HH:MM:SS  INFO      sentryos.main  ============================================================
HH:MM:SS  INFO      sentryos.main    SentryOS AI Sensory Engine — Starting Up
HH:MM:SS  INFO      sentryos.main  ============================================================
HH:MM:SS  INFO      sentryos.main  Vision thread launched
INFO:     Uvicorn running on http://0.0.0.0:8000
HH:MM:SS  INFO      sentryos.vision  Camera 0 opened successfully
```

**Verify:** Open a browser or new terminal and check the health endpoint:

```bash
# PowerShell
Invoke-WebRequest http://localhost:8000/health | Select-Object -ExpandProperty Content

# curl
curl http://localhost:8000/health
```

Expected: `{"status":"ok","service":"SentryOS","engine":{...},"vision_thread_alive":true,...}`

### 3.2 Start the Frontend

```bash
cd frontend
npm run dev
```

**Expected console output:**

```
▶ Next.js 14.x.x
- Local: http://localhost:3000
```

Open `http://localhost:3000` in Google Chrome.

### 3.3 Quick Verification Checklist

| # | Check | Expected Result |
|---|-------|-----------------|
| 1 | Navigate to `http://localhost:3000` | Glassmorphism login page with pre-filled email |
| 2 | Enter any password and submit | 800ms animation → "ACCESS GRANTED" → redirect to `/dashboard` |
| 3 | Dashboard loads | TopBar visible with WS and BLE status chips |
| 4 | WebSocket chip (TopBar) | Green, showing live face count |
| 5 | Look at webcam | Face count = `1` |
| 6 | Hold colored object to camera center | Background glow shifts color within ~2s |

---

## 4. Configuration

### 4.1 Environment Variables

| Variable | Where | Default | Description |
|----------|-------|---------|-------------|
| `SENTRY_DEBUG` | Backend | Not set | Set to `1` to enable OpenCV debug overlay showing face bounding boxes, ROI rectangle, FPS counter, and dominant color swatch |
| `NEXT_PUBLIC_BLE_BYPASS` | Frontend | Not set | Set to `true` to disable Bluetooth proximity tether (for development and demos without BLE hardware) |

### 4.2 Backend with Debug Overlay

```powershell
# Windows PowerShell
$env:SENTRY_DEBUG = "1"
python main.py

# macOS / Linux
SENTRY_DEBUG=1 python main.py
```

The debug overlay opens an OpenCV window showing:
- Green rectangles around detected faces
- Yellow rectangle marking the 100×100px color sampling ROI
- FPS counter in the top-left corner
- Dominant color swatch in the bottom-left corner

Press `q` in the debug window to exit.

### 4.3 Frontend with BLE Bypass

```powershell
# Windows PowerShell
$env:NEXT_PUBLIC_BLE_BYPASS = "true"
npm run dev

# macOS / Linux
NEXT_PUBLIC_BLE_BYPASS=true npm run dev
```

When bypassed, the Bluetooth tether is disabled and the UI security state depends only on the camera sensor. The initial state will be BLURRED instead of LOCKED.

---

## 5. Web Bluetooth Setup

> **This section is only required if you want to use the Bluetooth proximity tether feature.** If you don't have BLE hardware, use the `NEXT_PUBLIC_BLE_BYPASS=true` environment variable instead.

### 5.1 Enable Experimental Web Platform Features

Some Chrome builds require an experimental flag for the `watchAdvertisements()` API:

1. Open Chrome and navigate to: `chrome://flags/#enable-experimental-web-platform-features`
2. Set the flag to **Enabled**
3. Click **Relaunch**

### 5.2 Verify Bluetooth API

Open Chrome DevTools (F12) → Console:

```javascript
navigator.bluetooth
// Should return: Bluetooth {}
// If undefined: flag not enabled or browser unsupported
```

### 5.3 Pairing a Device

1. Navigate to the Dashboard (`/dashboard`) or the Bluetooth test page (`/test/bluetooth`)
2. Click the **Pair** button in the TopBar or test page
3. Chrome will display the native Bluetooth pairing dialog
4. Select your BLE device (smartwatch, earbuds, etc.)
5. The device name and RSSI will appear in the TopBar

> **Note:** `requestPairing()` must be triggered by a user gesture (click). This is a Web Bluetooth specification requirement — it cannot be auto-triggered on page load.

### 5.4 RSSI Behavior

| RSSI Range | Distance (approx.) | State |
|-----------|-------------------|-------|
| > -70 dBm | < 2 meters | SECURE (if face count = 1) |
| ≤ -70 dBm | > 2 meters | LOCKED |
| No signal for 10s | Out of range | LOCKED |

---

## 6. Network Configuration

### 6.1 Default Ports

| Service | Port | Protocol |
|---------|------|----------|
| Backend (FastAPI) | `8000` | HTTP / WebSocket |
| Frontend (Next.js) | `3000` | HTTP |

### 6.2 CORS

The backend accepts cross-origin requests from `http://localhost:3000` only. If you change the frontend port, update the `allow_origins` list in `backend/main.py`.

### 6.3 WebSocket

The frontend connects to `ws://localhost:8000/ws`. This URL is hardcoded in `useSecuritySocket.ts`. For deployment to a different host, update the `WS_URL` constant.

---

## 7. Troubleshooting

### 7.1 Backend Issues

| Problem | Symptom | Solution |
|---------|---------|----------|
| **Camera not found** | `camera_unavailable` in health check | Ensure webcam is connected and not in use by another application. Check `cv2.VideoCapture(0)` in Python REPL |
| **MediaPipe import error** | `ImportError: mediapipe` | Verify Python 3.10+. Reinstall: `pip install mediapipe --force-reinstall` |
| **Port 8000 in use** | `Address already in use` | Kill the process: `netstat -ano \| findstr :8000` → `taskkill /PID <pid> /F` (Windows) |
| **Module not found** | `ModuleNotFoundError` | Ensure virtual environment is activated. Run `pip install -r requirements.txt` |

### 7.2 Frontend Issues

| Problem | Symptom | Solution |
|---------|---------|----------|
| **WebSocket won't connect** | Grey WS chip in TopBar | Ensure backend is running on port 8000. Check browser console for errors |
| **BLE not available** | `navigator.bluetooth is undefined` | Enable Chrome experimental flag (§5.1). Use HTTPS in production (localhost is exempt) |
| **Login loop** | Redirects back to `/` after login | Clear sessionStorage: DevTools → Application → Session Storage → Clear. Or: `sessionStorage.setItem('sentry_auth','1')` in console |
| **Type errors on build** | `tsc` errors | Run `npm install` to ensure `@types/web-bluetooth` is installed |
| **Port 3000 in use** | `EADDRINUSE` | Kill the process or use `npm run dev -- -p 3001` |

### 7.3 Integration Issues

| Problem | Symptom | Solution |
|---------|---------|----------|
| **CORS errors** | Console shows blocked cross-origin request | Backend must be on `localhost:8000`, frontend on `localhost:3000` |
| **Stale face count** | Face count stuck at old value | Backend vision thread may have crashed. Restart: `python main.py` |
| **Chameleon not updating** | Color doesn't change | Ensure colored object is in center of frame (100×100px ROI). Check `dominant_color` in health endpoint |

---

## 8. Development Workflow

### 8.1 Running Both Services

For development, run the backend and frontend in separate terminal windows:

**Terminal 1 (Backend):**
```bash
cd backend
.venv\Scripts\Activate.ps1   # Windows
python main.py
```

**Terminal 2 (Frontend):**
```bash
cd frontend
npm run dev
```

### 8.2 Frontend Type Checking

```bash
cd frontend
npx tsc --noEmit
```

### 8.3 Frontend Linting

```bash
cd frontend
npm run lint
```

### 8.4 Test Routes

Use the isolated test routes during development to verify individual subsystems:

| Route | Purpose |
|-------|---------|
| `/test/bluetooth` | Raw BLE hook state dump (RSSI, device name, connection status) |
| `/test/privacy` | Raw WebSocket hook state dump (face count, color, connection) |
| `/test/chameleon` | Color engine playground (manual injection, saturation guard, stress test) |

---

## 9. Production Considerations

> SentryOS is currently designed for local development and demo use. The following changes would be required for production deployment:

| Area | Current | Production Requirement |
|------|---------|----------------------|
| WebSocket | `ws://` (unencrypted) | `wss://` with TLS termination |
| Authentication | sessionStorage demo auth | OAuth 2.0 / SAML / enterprise SSO |
| BLE | `localhost` exemption | HTTPS required for Web Bluetooth |
| CORS | `localhost:3000` only | Configure for production domain |
| Backend host | `0.0.0.0:8000` | Reverse proxy (nginx) with SSL |
| Logging | Console stdout | Structured logging to monitoring platform |
| Process management | Manual `python main.py` | systemd / Docker / PM2 |
