/**
 * Test Page: Privacy / WebSocket
 *
 * Raw state dump of useSecuritySocket for manual verification.
 * Displays the live ADR-01 sensor payload from the Python backend.
 */

"use client";

import { useSecuritySocket } from "@/hooks/useSecuritySocket";

export default function PrivacyTestPage() {
  const state = useSecuritySocket();

  return (
    <main style={{ padding: "2rem", fontFamily: "monospace" }}>
      <h1 style={{ fontFamily: "sans-serif" }}>Test — Privacy / WebSocket</h1>

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
        {JSON.stringify(
          {
            socketStatus: state.socketStatus,
            isConnected: state.isConnected,
            sensorData: state.sensorData,
          },
          null,
          2
        )}
      </pre>
    </main>
  );
}
