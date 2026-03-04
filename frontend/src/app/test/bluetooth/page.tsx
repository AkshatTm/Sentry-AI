/**
 * Test Page: Bluetooth / Proximity Tether
 *
 * Raw state dump of useProximityTether for manual verification.
 * The "Pair Device" button triggers navigator.bluetooth.requestDevice()
 * via the hook's requestPairing() — must originate from a user gesture.
 */

"use client";

import { useState } from "react";
import { useProximityTether } from "@/hooks/useProximityTether";

export default function BluetoothTestPage() {
  const { requestPairing, ...displayState } = useProximityTether();
  const [namePrefix, setNamePrefix] = useState("");

  return (
    <main style={{ padding: "2rem", fontFamily: "monospace" }}>
      <h1 style={{ fontFamily: "sans-serif" }}>Test — Bluetooth / Proximity Tether</h1>

      <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="text"
          value={namePrefix}
          onChange={(e) => setNamePrefix(e.target.value)}
          placeholder='Device name prefix (e.g. "boAt")'
          style={{
            padding: "0.5rem 0.75rem",
            fontSize: "0.9rem",
            borderRadius: "0.35rem",
            border: "1px solid #888",
            width: "260px",
            background: "var(--color-surface, #1a1a1a)",
            color: "inherit",
          }}
        />
        <button
          onClick={() => requestPairing(namePrefix || undefined)}
          style={{
            padding: "0.5rem 1.25rem",
            cursor: "pointer",
            fontSize: "0.9rem",
          }}
        >
          Pair Device
        </button>
      </div>

      <p style={{ marginTop: "0.75rem", fontSize: "0.8rem", color: "#aaa", maxWidth: "480px" }}>
        <strong>Tip:</strong> Enter the first few letters of your device name
        (as shown in your PC&apos;s Bluetooth settings) to filter the list.
        For boAt earbuds try <em>&quot;boAt&quot;</em> or <em>&quot;Boat&quot;</em>.
        Leave blank to see all nearby BLE devices.
      </p>

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
