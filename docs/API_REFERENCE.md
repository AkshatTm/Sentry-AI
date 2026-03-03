# API Reference

| Field | Value |
|-------|-------|
| **Product** | SentryOS |
| **Version** | 1.0.0 |
| **Base URL** | `http://localhost:8000` |
| **WebSocket** | `ws://localhost:8000/ws` |
| **Last Updated** | 2026-03-02 |

---

## 1. REST Endpoints

### GET /health

Liveness and readiness probe. Returns the current engine status, vision thread health, and uptime.

**Request:**

```
GET /health HTTP/1.1
Host: localhost:8000
```

**Response (200 OK):**

```json
{
  "status": "ok",
  "service": "SentryOS",
  "engine": {
    "face_count": 1,
    "dominant_color": "#4A90E2",
    "system_status": "active",
    "timestamp": 1678882345.123
  },
  "vision_thread_alive": true,
  "uptime_seconds": 123.45
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | `string` | Always `"ok"` if the server is responding |
| `service` | `string` | Service identifier (`"SentryOS"`) |
| `engine` | `object` | Latest `ThreadSafeState` snapshot (see §2.3) |
| `vision_thread_alive` | `boolean` | `true` if the daemon vision thread is running |
| `uptime_seconds` | `float` | Seconds since server start |

**Use Cases:**
- Frontend verifies backend is alive before attempting WebSocket upgrade
- Distinguish between "backend down" vs. "backend up but camera failed"
- Monitoring and health checks

---

## 2. WebSocket Protocol

### 2.1 Connection

**Endpoint:** `ws://localhost:8000/ws`

**Direction:** Unidirectional (server → client push). The client does not need to send any messages.

**Client Limit:** Single client only (ADR-03). If a second client attempts to connect while one is active, the server accepts the connection and immediately closes it with:

| Close Code | Reason | Meaning |
|-----------|--------|---------|
| `4001` | `single_client_limit` | Another client is already connected |

### 2.2 Connection Lifecycle

```
Client                                          Server
  │                                               │
  ├── WebSocket Upgrade Request ─────────────────►│
  │                                               │
  │                          ┌────────────────────┤  Check: is another client connected?
  │                          │ No                  │
  │                          ▼                     │
  │◄── 101 Switching Protocols ───────────────────┤
  │                                               │
  │◄── Handshake Event ──────────────────────────┤  {"event": "connected", ...}
  │                                               │
  │◄── Sensor Payload ───────────────────────────┤  Every 100ms (10 Hz)
  │◄── Sensor Payload ───────────────────────────┤
  │◄── Sensor Payload ───────────────────────────┤
  │    ...                                        │
  │                                               │
  ├── Close ──────────────────────────────────────►│  Client disconnects
  │                                               │  Slot released
```

### 2.3 Handshake Event

Sent once immediately after connection acceptance. Allows the client to verify protocol compatibility.

```json
{
  "event": "connected",
  "message": "SentryOS WebSocket ready",
  "version": "1.0.0"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `event` | `string` | Event type identifier |
| `message` | `string` | Human-readable status message |
| `version` | `string` | Protocol version (semver) |

### 2.4 Sensor Payload (ADR-01)

Broadcast continuously at 10 Hz (every 100ms). This is the canonical data contract between backend and frontend.

```json
{
  "face_count": 1,
  "dominant_color": "#4A90E2",
  "system_status": "active",
  "timestamp": 1678882345.123
}
```

**Field Reference:**

| Field | Type | Values | Description |
|-------|------|--------|-------------|
| `face_count` | `int` | `-1`, `0`, `1`, `2`, ... | Number of human faces detected in the current frame. `-1` indicates a camera fault (no valid frame available) |
| `dominant_color` | `string` | 7-character HEX | Dominant color extracted from the center 100×100px ROI via MiniBatchKMeans clustering. Example: `"#4A90E2"` |
| `system_status` | `string` | `"initializing"` · `"active"` · `"camera_unavailable"` | Current state of the AI engine |
| `timestamp` | `float` | Unix epoch seconds | Server-side timestamp of when the snapshot was taken |

**`system_status` Values:**

| Value | Meaning | Frontend Action |
|-------|---------|----------------|
| `"initializing"` | Backend started, vision thread has not delivered first frame | Show connecting indicator |
| `"active"` | Camera open, frames processing normally | Normal operation |
| `"camera_unavailable"` | `cv2.VideoCapture.read()` returning `False` after retry exhaustion | Treat as security fault → BLURRED |

**`face_count` Interpretation:**

| Value | Meaning | Security State (if BLE present) |
|-------|---------|-------------------------------|
| `-1` | Camera fault — no valid frame | BLURRED |
| `0` | No face detected — user absent | BLURRED |
| `1` | Single face — authorized user | SECURE |
| `2+` | Multiple faces — potential shoulder surfer | BLURRED |

### 2.5 Client Messages

The WebSocket channel is designed as server → client push only. If the client sends messages, the server silently drains them (a background task reads and discards) to prevent the internal read buffer from growing unbounded. No client-sent messages are processed.

---

## 3. CORS Configuration

The backend allows cross-origin requests from the Next.js development server:

| Setting | Value |
|---------|-------|
| `allow_origins` | `["http://localhost:3000"]` |
| `allow_credentials` | `true` |
| `allow_methods` | `["*"]` |
| `allow_headers` | `["*"]` |

---

## 4. Frontend Hook Contracts

These TypeScript interfaces define the data shapes consumed by the React frontend.

### 4.1 `useSecuritySocket()` Return Shape

```typescript
interface UseSecuritySocketReturn {
  /** Parsed sensor data from the last valid WebSocket message, or null */
  sensorData: SensorPayload | null;

  /** true when the WebSocket is in `open` state */
  isConnected: boolean;

  /** Granular connection lifecycle status */
  socketStatus: "idle" | "connecting" | "open" | "closed" | "error";
}

interface SensorPayload {
  /** -1 = camera fault, 0 = no face, 1+ = count */
  faceCount: number;

  /** 7-char HEX string, e.g. "#4A90E2" */
  dominantColor: string;

  /** "initializing" | "active" | "camera_unavailable" */
  systemStatus: string;

  /** Unix epoch seconds */
  timestamp: number;
}
```

> **Note:** The hook performs snake_case → camelCase transformation (ADR-05) at the boundary. Backend emits `face_count`; frontend exposes `faceCount`.

### 4.2 `useProximityTether()` Return Shape

```typescript
interface UseProximityTetherReturn {
  /** true = LOCKED (ADR-02 fail-closed — defaults true until paired) */
  isDisconnected: boolean;

  /** false if navigator.bluetooth is unavailable */
  isSupported: boolean;

  /** Paired BLE device name, or null */
  deviceName: string | null;

  /** Last RSSI reading in dBm, or null */
  rssi: number | null;

  /** Human-readable status for UI display */
  statusMessage: string;

  /** Triggers BLE pairing dialog. MUST be called from a user gesture */
  requestPairing: () => Promise<void>;
}
```

### 4.3 `useSecurityState()` Return Shape

```typescript
type SecurityState = "SECURE" | "BLURRED" | "LOCKED";

interface SecurityStateResult {
  securityState: SecurityState;

  // Camera / WebSocket
  faceCount: number | null;
  dominantColor: string | null;
  socketStatus: SocketStatus;
  isConnected: boolean;

  // Bluetooth / Proximity
  isDisconnected: boolean;
  isSupported: boolean;
  statusMessage: string;
  deviceName: string | null;
  rssi: number | null;
  requestPairing: () => Promise<void>;
}
```

---

## 5. Error Responses

### 5.1 WebSocket Close Codes

| Code | Reason | Cause |
|------|--------|-------|
| `1000` | Normal closure | Client or server initiated clean disconnect |
| `1001` | `server_shutdown` | Backend shutting down gracefully |
| `4001` | `single_client_limit` | Second client attempted to connect (ADR-03) |

### 5.2 Frontend Error Handling

| Scenario | Frontend Behavior |
|----------|-------------------|
| WebSocket connection refused | `socketStatus: "error"`, exponential backoff reconnect (1s → 2s → 4s → 5s cap) |
| WebSocket close (any code) | `socketStatus: "closed"`, auto-reconnect with backoff |
| Close code `4001` | Specific warning logged: "Another tab/window may already be connected" |
| Invalid JSON payload | Silently dropped; `sensorData` retains last valid value |
| Payload fails ADR-01 validation | Silently dropped; type guard rejects malformed data |

---

## 6. Rate Limits & Performance

| Metric | Value |
|--------|-------|
| WebSocket broadcast rate | 10 Hz (100ms) |
| Face detection rate | Every frame (~15-30 FPS) |
| Color extraction rate | 1 Hz (1 sample/second) |
| Max concurrent WebSocket clients | 1 (ADR-03) |
| Reconnect backoff | 1s → 2s → 4s → 5s (cap) |
| Connect debounce (Strict Mode) | 100ms |
| RSSI staleness timeout | 10 seconds |
| RSSI proximity threshold | -70 dBm (~2m range) |
