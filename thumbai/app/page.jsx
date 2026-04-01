"use client";

import { useState } from "react";

const styles = {
  page: {
    maxWidth: 720,
    margin: "0 auto",
    padding: "48px 24px",
    fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
    color: "#111",
  },
  h1: {
    fontSize: 28,
    fontWeight: 700,
    marginBottom: 4,
  },
  subtitle: {
    color: "#666",
    fontSize: 14,
    marginBottom: 32,
  },
  label: {
    display: "block",
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 6,
    color: "#333",
  },
  input: {
    width: "100%",
    padding: "10px 12px",
    fontSize: 15,
    border: "1px solid #ddd",
    borderRadius: 8,
    outline: "none",
    boxSizing: "border-box",
    marginBottom: 16,
  },
  brandToggle: {
    background: "none",
    border: "none",
    color: "#666",
    fontSize: 13,
    cursor: "pointer",
    padding: 0,
    marginBottom: 16,
    textDecoration: "underline",
  },
  brandGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 12,
    marginBottom: 16,
  },
  button: {
    width: "100%",
    padding: "12px 0",
    fontSize: 15,
    fontWeight: 600,
    color: "#fff",
    background: "#111",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
  },
  buttonDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  agentStatus: {
    marginTop: 24,
    display: "flex",
    gap: 12,
  },
  agentPill: {
    flex: 1,
    padding: "10px 14px",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    textAlign: "center",
  },
  pillPending: {
    background: "#f5f5f5",
    color: "#999",
  },
  pillRunning: {
    background: "#fffae6",
    color: "#b38600",
  },
  pillDone: {
    background: "#e6ffe6",
    color: "#1a7a1a",
  },
  pillError: {
    background: "#ffe6e6",
    color: "#cc0000",
  },
  section: {
    marginTop: 32,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 700,
    marginBottom: 12,
  },
  card: {
    border: "1px solid #eee",
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
  },
  headlineText: {
    fontSize: 18,
    fontWeight: 700,
    marginBottom: 6,
  },
  score: {
    display: "inline-block",
    background: "#111",
    color: "#fff",
    borderRadius: 6,
    padding: "2px 8px",
    fontSize: 13,
    fontWeight: 700,
    marginRight: 8,
  },
  reason: {
    color: "#666",
    fontSize: 13,
  },
  styleGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
  },
  styleItem: {
    padding: 12,
    borderRadius: 8,
    background: "#fafafa",
  },
  styleLabel: {
    fontSize: 11,
    color: "#999",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    marginBottom: 4,
  },
  styleValue: {
    fontSize: 14,
    fontWeight: 600,
  },
  colorSwatch: {
    display: "inline-block",
    width: 16,
    height: 16,
    borderRadius: 4,
    marginRight: 8,
    verticalAlign: "middle",
    border: "1px solid #ddd",
  },
  error: {
    marginTop: 24,
    padding: 16,
    background: "#ffe6e6",
    borderRadius: 8,
    color: "#cc0000",
    fontSize: 14,
  },
};

export default function Home() {
  const [title, setTitle] = useState("");
  const [brand, setBrand] = useState({ channelName: "", niche: "", audience: "" });
  const [showBrand, setShowBrand] = useState(false);
  const [loading, setLoading] = useState(false);
  const [agentStates, setAgentStates] = useState({ copy: "idle", style: "idle", ctr: "idle" });
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleGenerate = async () => {
    if (!title.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setAgentStates({ copy: "running", style: "running", ctr: "pending" });

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), brand }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Generation failed");
      }

      setAgentStates({ copy: "done", style: "done", ctr: "done" });
      setResult(data);
    } catch (err) {
      setAgentStates((prev) => ({
        copy: prev.copy === "running" ? "error" : prev.copy,
        style: prev.style === "running" ? "error" : prev.style,
        ctr: prev.ctr === "pending" ? "error" : prev.ctr,
      }));
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const pillStyle = (state) => ({
    ...styles.agentPill,
    ...(state === "idle" || state === "pending" ? styles.pillPending : {}),
    ...(state === "running" ? styles.pillRunning : {}),
    ...(state === "done" ? styles.pillDone : {}),
    ...(state === "error" ? styles.pillError : {}),
  });

  const agentLabel = (name, state) => {
    const icons = { idle: "○", pending: "◌", running: "◎", done: "✓", error: "✕" };
    return `${icons[state] || "○"} ${name}`;
  };

  return (
    <div style={styles.page}>
      <h1 style={styles.h1}>ThumbAI</h1>
      <p style={styles.subtitle}>Multi-agent thumbnail headline generator</p>

      <div>
        <label style={styles.label}>Video Title</label>
        <input
          style={styles.input}
          placeholder="e.g. I Built a $10M App in 30 Days"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !loading && handleGenerate()}
        />
      </div>

      <button style={styles.brandToggle} onClick={() => setShowBrand(!showBrand)}>
        {showBrand ? "Hide" : "Show"} brand memory fields
      </button>

      {showBrand && (
        <div style={styles.brandGrid}>
          {["channelName", "niche", "audience"].map((field) => (
            <div key={field}>
              <label style={styles.label}>
                {field === "channelName" ? "Channel Name" : field.charAt(0).toUpperCase() + field.slice(1)}
              </label>
              <input
                style={styles.input}
                placeholder={field === "channelName" ? "My Channel" : field === "niche" ? "Tech, Gaming..." : "18-35 developers"}
                value={brand[field]}
                onChange={(e) => setBrand({ ...brand, [field]: e.target.value })}
              />
            </div>
          ))}
        </div>
      )}

      <button
        style={{ ...styles.button, ...(loading || !title.trim() ? styles.buttonDisabled : {}) }}
        onClick={handleGenerate}
        disabled={loading || !title.trim()}
      >
        {loading ? "Generating..." : "Generate Thumbnails"}
      </button>

      {(loading || result || error) && (
        <div style={styles.agentStatus}>
          <div style={pillStyle(agentStates.copy)}>{agentLabel("Copy Agent", agentStates.copy)}</div>
          <div style={pillStyle(agentStates.style)}>{agentLabel("Style Agent", agentStates.style)}</div>
          <div style={pillStyle(agentStates.ctr)}>{agentLabel("CTR Agent", agentStates.ctr)}</div>
        </div>
      )}

      {error && <div style={styles.error}>{error}</div>}

      {result && (
        <>
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Ranked Headlines</h2>
            {result.ranked.map((item, i) => (
              <div key={i} style={styles.card}>
                <div style={styles.headlineText}>{item.headline}</div>
                <span style={styles.score}>{item.score}/10</span>
                <span style={styles.reason}>{item.reason}</span>
              </div>
            ))}
          </div>

          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Style Guide</h2>
            <div style={styles.styleGrid}>
              <div style={styles.styleItem}>
                <div style={styles.styleLabel}>Mood</div>
                <div style={styles.styleValue}>{result.style.mood}</div>
              </div>
              <div style={styles.styleItem}>
                <div style={styles.styleLabel}>Font Style</div>
                <div style={styles.styleValue}>{result.style.fontStyle}</div>
              </div>
              <div style={styles.styleItem}>
                <div style={styles.styleLabel}>Primary Color</div>
                <div style={styles.styleValue}>
                  <span style={{ ...styles.colorSwatch, background: result.style.primaryColor }} />
                  {result.style.primaryColor}
                </div>
              </div>
              <div style={styles.styleItem}>
                <div style={styles.styleLabel}>Accent Color</div>
                <div style={styles.styleValue}>
                  <span style={{ ...styles.colorSwatch, background: result.style.accentColor }} />
                  {result.style.accentColor}
                </div>
              </div>
              <div style={{ ...styles.styleItem, gridColumn: "1 / -1" }}>
                <div style={styles.styleLabel}>Background Suggestion</div>
                <div style={styles.styleValue}>{result.style.bgSuggestion}</div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
