# Product Requirements Document

| Field | Value |
|-------|-------|
| **Product** | SentryOS — AI-Powered Zero-Trust Physical Endpoint Security |
| **Version** | 2.0.0 |
| **Status** | Feature-Complete |
| **Last Updated** | 2026-03-02 |
| **Authors** | Akshat Tomar |
| **Stakeholders** | INT428 Faculty, LPU Computer Science Department |

---

## 1. Executive Summary

SentryOS is a proactive, zero-trust physical endpoint security system designed to mitigate threats that traditional software-only security perimeters cannot address. It uses edge-compute computer vision, Bluetooth Low Energy proximity tethering, and adaptive UI obfuscation to continuously verify the physical security of a remote workspace — all processed locally with zero cloud dependency.

The system operates as a modular monolith: a Python-based AI sensory engine (FastAPI) communicates with a Next.js reactive frontend over local WebSockets, delivering sub-250ms threat response times.

---

## 2. Problem Statement

### 2.1 Context

In enterprise remote and hybrid work environments (financial services, healthcare, government contractors), software-layer security is mature — VPNs, end-to-end encryption, multi-factor authentication, and JWT-based session management are industry standard. However, the **physical endpoint** remains the weakest link in the security chain.

### 2.2 Identified Threats

| Threat | Description | Current Mitigation | Gap |
|--------|-------------|-------------------|-----|
| **Shoulder Surfing** | Unauthorized bystander views sensitive screen content in shared/public spaces | Privacy screen filters (passive, easily circumvented) | No active detection or automated response |
| **Device Abandonment** | User leaves machine unlocked while stepping away briefly | OS inactivity timeout (typically 5+ min), manual `Win+L` | Relies on human compliance; large vulnerability window |
| **Unauthorized Access** | Opportunistic access to unlocked workstation | Password-based screen lock | No continuous physical presence verification |

### 2.3 Root Cause

Existing endpoint protections are **reactive** and **compliance-dependent**. A true zero-trust architecture requires continuous, automated, multi-factor physical presence authentication that operates independently of user behavior.

---

## 3. Product Vision

> **Shift endpoint security from reactive to proactive** by fusing real-time computer vision, hardware proximity sensing, and adaptive UI to create a workspace that autonomously defends its own physical perimeter.

### 3.1 Core Security Pillars

| # | Pillar | Mechanism | Response |
|---|--------|-----------|----------|
| 1 | **Active Obfuscation** | MediaPipe face detection via local webcam | UI blurs when 0 or 2+ faces detected |
| 2 | **Proximity Tether** | Web Bluetooth RSSI monitoring of paired BLE device | Session hard-locks when device leaves ~2 m range |
| 3 | **Chameleon UI** | K-Means dominant color extraction from camera ROI | Adaptive theming provides visual clearance feedback |

### 3.2 Design Principles

- **Privacy by Design** — No images are saved, recorded, or transmitted. Only metadata (integers and strings) leaves the vision pipeline.
- **Fail-Closed Security** — Every sensor failure defaults to the most restrictive state (LOCKED or BLURRED), never SECURE.
- **Edge-Only Processing** — All computation happens on the local machine. No external API calls, no cloud services.
- **Zero-Trust Physical Model** — The system never assumes the user is present; it continuously proves it.

---

## 4. Functional Requirements

### FR-1: Real-Time Face Detection

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|-------------------|
| FR-1.1 | System shall capture video from the default system webcam | P0 | `cv2.VideoCapture(0)` initializes successfully; graceful degradation on failure |
| FR-1.2 | System shall count human faces in each frame using MediaPipe | P0 | Accurate count at ≥15 FPS on standard CPU hardware |
| FR-1.3 | Face count shall be broadcast to frontend at 10 Hz | P0 | WebSocket payload received every ~100ms |
| FR-1.4 | Camera failures shall be reported as `face_count: -1` | P0 | Frontend treats `-1` as security fault → BLURRED |

### FR-2: Dominant Color Extraction

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|-------------------|
| FR-2.1 | System shall extract a 100×100px center-frame ROI | P1 | ROI centered regardless of input resolution |
| FR-2.2 | MiniBatchKMeans shall compute the dominant HEX color | P1 | Valid 7-character HEX string (e.g., `#4A90E2`) |
| FR-2.3 | Color extraction shall run at 1 Hz (rate-limited) | P1 | CPU usage remains stable; no thermal throttling |
| FR-2.4 | Desaturated colors (S < 15%) and near-black (L < 10%) shall be rejected | P1 | Chameleon holds last vivid color; no grey/black themes |

### FR-3: Proximity Tether (Bluetooth)

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|-------------------|
| FR-3.1 | System shall pair with a generic BLE device via `navigator.bluetooth.requestDevice()` | P0 | Pairing dialog opens on user click; device name displayed after pairing |
| FR-3.2 | System shall poll RSSI via `watchAdvertisements()` with GATT fallback | P0 | RSSI values update; GATT fallback activates on unsupported browsers |
| FR-3.3 | RSSI below `-70 dBm` shall trigger LOCKED state | P0 | UI transitions to lock screen within 250ms of threshold breach |
| FR-3.4 | 10-second RSSI staleness shall auto-lock the session | P0 | No advertisements for 10s → `isDisconnected = true` |
| FR-3.5 | Absent BLE support shall default to LOCKED (fail-closed) | P0 | `isDisconnected: true` when `navigator.bluetooth` unavailable |
| FR-3.6 | `NEXT_PUBLIC_BLE_BYPASS=true` shall disable the tether for development | P2 | Vision-only security operates independently |

### FR-4: Security State Machine

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|-------------------|
| FR-4.1 | System shall derive a single `SecurityState` from all sensor inputs | P0 | `deriveSecurityState()` passes truth table test cases |
| FR-4.2 | Bluetooth absence shall be absolute override (LOCKED) | P0 | Camera data ignored when BLE disconnected |
| FR-4.3 | Exactly 1 face + BLE present → SECURE | P0 | UI fully visible and interactive |
| FR-4.4 | All other combinations → BLURRED | P0 | `blur(24px) + grayscale(80%)` applied |

### FR-5: UI Obfuscation & Theming

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|-------------------|
| FR-5.1 | GlassOverlay shall apply CSS `filter` variants per state | P0 | Smooth 400ms transitions between SECURE/BLURRED/LOCKED |
| FR-5.2 | LockScreen shall display full-screen overlay in LOCKED state | P0 | RSSI meter, device info, re-pair button visible |
| FR-5.3 | ChameleonWrapper shall update CSS variables at 60 fps | P1 | Color transitions via Framer Motion with zero re-renders |
| FR-5.4 | All colors shall use CSS custom properties (no hardcoded hex) | P1 | `var(--theme-primary)` used throughout |

### FR-6: Presentation Mode

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|-------------------|
| FR-6.1 | Keyboard shortcuts shall override sensor-derived state | P1 | `Ctrl+Shift+L/B/S/0` work as documented |
| FR-6.2 | Override indicator shall be visible only to presenter | P1 | Subtle bottom-right toast + yellow strip below topbar |
| FR-6.3 | `Ctrl+Shift+0` shall release override and resume sensors | P1 | State returns to live sensor derivation |

### FR-7: Authentication

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|-------------------|
| FR-7.1 | Login page shall authenticate via sessionStorage | P1 | `sentry_auth` key set on successful login |
| FR-7.2 | Dashboard shall redirect to `/` if unauthenticated | P1 | `useAuthGuard` redirects immediately |
| FR-7.3 | Session shall expire on tab close | P1 | `sessionStorage` cleared by browser |

---

## 5. Non-Functional Requirements

| ID | Category | Requirement | Target |
|----|----------|-------------|--------|
| NFR-1 | **Latency** | End-to-end response (face enters frame → UI blurs) | < 250ms |
| NFR-2 | **Frame Rate** | Vision pipeline on standard laptop CPU | ≥ 15 FPS |
| NFR-3 | **Privacy** | Zero frame persistence (no save/record/transmit) | 100% compliance |
| NFR-4 | **Resilience** | Frontend operates with mock data when backend offline | Graceful degradation |
| NFR-5 | **Performance** | Frontend render cycle unaffected by color updates | 60 FPS maintained |
| NFR-6 | **Compatibility** | Web Bluetooth support | Chrome 91+ required |
| NFR-7 | **Security Posture** | Default state on any sensor failure | Fail-closed (LOCKED or BLURRED) |

---

## 6. Data Contract

### 6.1 WebSocket Payload (Backend → Frontend)

```json
{
  "face_count": 1,
  "dominant_color": "#4A90E2",
  "system_status": "active",
  "timestamp": 1678882345.123
}
```

| Field | Type | Description |
|-------|------|-------------|
| `face_count` | `int` | `-1` = camera fault, `0` = no face, `1+` = detected count |
| `dominant_color` | `string` | 7-character HEX color (e.g., `"#4A90E2"`) |
| `system_status` | `string` | `"initializing"` · `"active"` · `"camera_unavailable"` |
| `timestamp` | `float` | Unix epoch seconds |

> See [API Reference](API_REFERENCE.md) for complete protocol documentation.

---

## 7. Security State Truth Table

| BLE Status | Face Count | Derived State | Visual Effect |
|------------|-----------|--------------|---------------|
| Disconnected | Any | **LOCKED** | Full lock screen overlay |
| Connected | `null` / WS offline | **BLURRED** | `blur(24px) + grayscale(80%)` |
| Connected | `-1` (camera fault) | **BLURRED** | `blur(24px) + grayscale(80%)` |
| Connected | `0` (no face) | **BLURRED** | `blur(24px) + grayscale(80%)` |
| Connected | `> 1` (multiple faces) | **BLURRED** | `blur(24px) + grayscale(80%)` |
| Connected | `1` (single face) | **SECURE** | Full UI visible |

> **Rule:** Bluetooth is the absolute override. If hardware is absent, camera data is ignored and the system defaults to maximum security.

---

## 8. Out of Scope

The following are explicitly excluded from the current version:

- User identity verification (facial recognition / biometric matching)
- Multi-user role-based access control
- Cloud-based processing or remote API integrations
- Database persistence (stateless by design)
- Production HTTPS/WSS configuration
- Mobile device native application
- Audit logging to external systems

---

## 9. Glossary

| Term | Definition |
|------|-----------|
| **BLE** | Bluetooth Low Energy — wireless protocol for short-range communication |
| **RSSI** | Received Signal Strength Indicator — signal power measurement in dBm |
| **ROI** | Region of Interest — cropped subsection of a video frame |
| **K-Means** | Unsupervised clustering algorithm used for dominant color extraction |
| **MediaPipe** | Google's open-source framework for ML-based perception pipelines |
| **Fail-Closed** | Security posture where failures default to the most restrictive state |
| **ADR** | Architecture Decision Record — documented architectural choice |
| **GATT** | Generic Attribute Profile — Bluetooth LE data exchange protocol |
