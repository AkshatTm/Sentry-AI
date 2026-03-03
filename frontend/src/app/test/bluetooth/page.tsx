/**
 * Test Page: Bluetooth / Proximity Tether
 *
 * Raw state dump of useProximityTether for manual verification.
 * The "Pair Device" button triggers navigator.bluetooth.requestDevice()
 * via the hook's requestPairing() — must originate from a user gesture.
 */

"use client";

import { useProximityTether } from "@/hooks/useProximityTether";

export default function BluetoothTestPage() {
  const { requestPairing, ...displayState } = useProximityTether();

  return (
    <main style={{ padding: "2rem", fontFamily: "monospace" }}>
      <h1 style={{ fontFamily: "sans-serif" }}>Test — Bluetooth / Proximity Tether</h1>

      <button
        onClick={requestPairing}
        style={{
          marginTop: "1rem",
          padding: "0.5rem 1.25rem",
          cursor: "pointer",
          fontSize: "0.9rem",
        }}
      >
        Pair Device
      </button>

      <pre
        style={{
          marginTop: "1.5rem",
          fontSize: "0.8rem",
          whiteSpace: "pre-wrap",
          background: "var(--color-surface)",
          padding: "1rem",
          borderRadius: "0.5rem",
        }}
      >
        {JSON.stringify(displayState, null, 2)}
      </pre>
    </main>
  );
}
