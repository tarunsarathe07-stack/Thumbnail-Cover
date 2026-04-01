"use client";

import { useState } from "react";

const styles = {
  container: {
    maxWidth: 720,
    margin: "0 auto",
    padding: "48px 24px",
  },
  header: {
    textAlign: "center",
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: 700,
    letterSpacing: "-0.02em",
    marginBottom: 8,
  },
  subtitle: {
    color: "#888",
    fontSize: 15,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    marginBottom: 40,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: "#aaa",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: 4,
  },
  input: {
    width: "100%",
    padding: "12px 16px",
    fontSize: 16,
    background: "#161616",
    border: "1px solid #2a2a2a",
    borderRadius: 8,
    color: "#ededed",
    outline: "none",
  },
  smallInputRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 12,
  },
  button: {
    padding: "14px 24px",
    fontSize: 16,
    fontWeight: 600,
    background: "#7c3aed",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
    cursor: "not-allowed",
  },
  agentRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 12,
    marginBottom: 32,
  },
  agentCard: {
    padding: "16px",
    background: "#161616",
    border: "1px solid #2a2a2a",
    borderRadius: 8,
    textAlign: "center",
  },
  agentName: {
    fontSize: 13,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: 8,
  },
  spinner: {
    display: "inline-block",
    width: 20,
    height: 20,
    border: "2px solid #333",
    borderTopColor: "#7c3aed",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  done: {
    color: "#34d399",
    fontWeight: 600,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 700,
    marginBottom: 16,
    borderBottom: "1px solid #2a2a2a",
    paddingBottom: 8,
  },
  rankCard: {
    padding: 16,
    background: "#161616",
    border: "1px solid #2a2a2a",
    borderRadius: 8,
    marginBottom: 12,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
  },
  rankBadge: {
    background: "#7c3aed",
    color: "#fff",
    fontWeight: 700,
    fontSize: 14,
    borderRadius: 6,
    padding: "4px 10px",
    flexShrink: 0,
  },
  rankHeadline: {
    fontSize: 18,
    fontWeight: 600,
    marginBottom: 4,
  },
  rankReason: {
    fontSize: 13,
    color: "#888",
  },
  styleCard: {
    padding: 20,
    background: "#161616",
    border: "1px solid #2a2a2a",
    borderRadius: 8,
  },
  styleRow: {
    display: "flex",
    justifyContent: "space-between",
    padding: "8px 0",
    borderBottom: "1px solid #1e1e1e",
    fontSize: 14,
  },
  styleKey: {
    color: "#888",
    textTransform: "capitalize",
  },
  colorSwatch: {
    display: "inline-block",
    width: 14,
    height: 14,
    borderRadius: 3,
    marginRight: 8,
    verticalAlign: "middle",
    border: "1px solid #333",
  },
  error: {
    padding: 16,
    background: "#2d1215",
    border: "1px solid #5c2127",
    borderRadius: 8,
    color: "#f87171",
    fontSize: 14,
  },
};

export default function Home() {
  const [title, setTitle] = useState("");
  const [channelName, setChannelName] = useState("");
  const [niche, setNiche] = useState("");
  const [audience, setAudience] = useState("");
  const [loading, setLoading] = useState(false);
  const [agentStatus, setAgentStatus] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setAgentStatus({ copy: "running", style: "running", ctr: "waiting" });

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          brand: { channelName, niche, audience },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Request failed");
      }

      setAgentStatus({ copy: "done", style: "done", ctr: "done" });
      setResult(data);
    } catch (err) {
      setError(err.message);
      setAgentStatus(null);
    } finally {
      setLoading(false);
    }
  }

  function renderAgentStatus(name, status) {
    return (
      <div style={styles.agentCard}>
        <div style={styles.agentName}>{name}</div>
        {status === "running" && <div style={styles.spinner} />}
        {status === "waiting" && <span style={{ color: "#666" }}>Waiting...</span>}
        {status === "done" && <span style={styles.done}>Done</span>}
      </div>
    );
  }

  const isColor = (v) => typeof v === "string" && v.startsWith("#");

  return (
    <div style={styles.container}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <header style={styles.header}>
        <h1 style={styles.title}>ThumbAI</h1>
        <p style={styles.subtitle}>Multi-agent YouTube thumbnail generator</p>
      </header>

      <form onSubmit={handleSubmit} style={styles.form}>
        <div>
          <div style={styles.label}>Video Title</div>
          <input
            style={styles.input}
            type="text"
            placeholder="Enter your YouTube video title..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>

        <div style={styles.smallInputRow}>
          <div>
            <div style={styles.label}>Channel Name</div>
            <input
              style={styles.input}
              type="text"
              placeholder="Optional"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
            />
          </div>
          <div>
            <div style={styles.label}>Niche</div>
            <input
              style={styles.input}
              type="text"
              placeholder="Optional"
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
            />
          </div>
          <div>
            <div style={styles.label}>Audience</div>
            <input
              style={styles.input}
              type="text"
              placeholder="Optional"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
            />
          </div>
        </div>

        <button
          type="submit"
          style={{
            ...styles.button,
            ...(loading ? styles.buttonDisabled : {}),
          }}
          disabled={loading}
        >
          {loading ? "Generating..." : "Generate Thumbnail Ideas"}
        </button>
      </form>

      {agentStatus && (
        <div style={styles.agentRow}>
          {renderAgentStatus("Copy Agent", agentStatus.copy)}
          {renderAgentStatus("Style Agent", agentStatus.style)}
          {renderAgentStatus("CTR Agent", agentStatus.ctr)}
        </div>
      )}

      {error && <div style={styles.error}>{error}</div>}

      {result && (
        <>
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Ranked Headlines</h2>
            {result.ranked.map((item, i) => (
              <div key={i} style={styles.rankCard}>
                <div style={{ flex: 1 }}>
                  <div style={styles.rankHeadline}>{item.headline}</div>
                  <div style={styles.rankReason}>{item.reason}</div>
                </div>
                <div style={styles.rankBadge}>{item.score}/10</div>
              </div>
            ))}
          </div>

          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Style Guide</h2>
            <div style={styles.styleCard}>
              {Object.entries(result.style).map(([key, value]) => (
                <div key={key} style={styles.styleRow}>
                  <span style={styles.styleKey}>{key.replace(/([A-Z])/g, " $1")}</span>
                  <span>
                    {isColor(value) && (
                      <span style={{ ...styles.colorSwatch, background: value }} />
                    )}
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
