"use client";

import { useEffect, useState } from "react";

export default function SyncNotice() {
  const [message, setMessage] = useState("");

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      setMessage(detail?.message || "Planilha sincronizada com sucesso.");
      setTimeout(() => setMessage(""), 6000);
    };

    window.addEventListener("google-sheets-synced", handler);
    return () => window.removeEventListener("google-sheets-synced", handler);
  }, []);

  if (!message) return null;

  return (
    <div style={{
      position: "fixed", right: 20, bottom: 20, zIndex: 9999,
      background: "#166534", color: "#fff", padding: "16px 22px",
      borderRadius: 10, boxShadow: "0 4px 18px #0003"
    }}>
      ✓ {message}
      <button onClick={() => setMessage("")} style={{
        marginLeft: 16, background: "transparent", color: "#fff",
        border: 0, cursor: "pointer"
      }}>✕</button>
    </div>
  );
}
