'use client';

import { useState } from 'react';

const styles = {
  page: {
    minHeight: '100vh',
    backgroundColor: '#0f0f0f',
    color: '#f0f0f0',
    fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
    padding: '40px 20px',
  },
  container: {
    maxWidth: '720px',
    margin: '0 auto',
  },
  header: {
    marginBottom: '40px',
    textAlign: 'center',
  },
  title: {
    fontSize: '2rem',
    fontWeight: 800,
    letterSpacing: '-0.03em',
    margin: '0 0 8px',
    background: 'linear-gradient(135deg, #fff 0%, #aaa 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  subtitle: {
    fontSize: '0.9rem',
    color: '#666',
    margin: 0,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    marginBottom: '40px',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '0.8rem',
    fontWeight: 600,
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  input: {
    backgroundColor: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: '8px',
    color: '#f0f0f0',
    fontSize: '0.95rem',
    outline: 'none',
    padding: '12px 14px',
    transition: 'border-color 0.15s',
    width: '100%',
    boxSizing: 'border-box',
  },
  optionalGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: '12px',
  },
  button: {
    backgroundColor: '#fff',
    border: 'none',
    borderRadius: '8px',
    color: '#000',
    cursor: 'pointer',
    fontSize: '0.95rem',
    fontWeight: 700,
    padding: '14px 20px',
    transition: 'opacity 0.15s',
    letterSpacing: '-0.01em',
  },
  buttonDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  agentStatus: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    marginBottom: '32px',
    padding: '20px',
    backgroundColor: '#151515',
    borderRadius: '10px',
    border: '1px solid #222',
  },
  agentStatusTitle: {
    fontSize: '0.75rem',
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    marginBottom: '6px',
  },
  agentRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '0.9rem',
  },
  spinner: {
    width: '14px',
    height: '14px',
    border: '2px solid #333',
    borderTop: '2px solid #fff',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
    flexShrink: 0,
  },
  dot: (color) => ({
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: color,
    flexShrink: 0,
  }),
  section: {
    marginBottom: '32px',
  },
  sectionTitle: {
    fontSize: '0.75rem',
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    marginBottom: '14px',
  },
  headlineCard: (rank) => ({
    backgroundColor: '#151515',
    border: `1px solid ${rank === 0 ? '#3a3a3a' : '#1e1e1e'}`,
    borderRadius: '10px',
    padding: '16px 18px',
    marginBottom: '10px',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '14px',
  }),
  rankBadge: (rank) => ({
    flexShrink: 0,
    width: '28px',
    height: '28px',
    borderRadius: '6px',
    backgroundColor: rank === 0 ? '#fff' : '#222',
    color: rank === 0 ? '#000' : '#666',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.75rem',
    fontWeight: 800,
  }),
  headlineText: {
    fontSize: '1rem',
    fontWeight: 700,
    margin: '0 0 4px',
    lineHeight: 1.3,
  },
  reasonText: {
    fontSize: '0.8rem',
    color: '#666',
    margin: 0,
    lineHeight: 1.4,
  },
  scoreBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '8px',
  },
  scoreTrack: {
    flex: 1,
    height: '4px',
    backgroundColor: '#222',
    borderRadius: '2px',
    overflow: 'hidden',
  },
  scoreFill: (score) => ({
    height: '100%',
    width: `${score * 10}%`,
    backgroundColor: score >= 8 ? '#4ade80' : score >= 6 ? '#facc15' : '#f87171',
    borderRadius: '2px',
    transition: 'width 0.6s ease',
  }),
  scoreLabel: {
    fontSize: '0.75rem',
    color: '#555',
    flexShrink: 0,
    width: '28px',
    textAlign: 'right',
  },
  styleCard: {
    backgroundColor: '#151515',
    border: '1px solid #2a2a2a',
    borderRadius: '10px',
    padding: '20px',
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
  },
  styleField: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  styleFieldFull: {
    gridColumn: '1 / -1',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  styleLabel: {
    fontSize: '0.7rem',
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  styleValue: {
    fontSize: '0.9rem',
    fontWeight: 600,
    color: '#ddd',
  },
  colorSwatch: (hex) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '0.9rem',
    fontWeight: 600,
    color: '#ddd',
  }),
  swatchCircle: (hex) => ({
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    backgroundColor: hex,
    border: '1px solid rgba(255,255,255,0.1)',
    flexShrink: 0,
  }),
  errorBox: {
    backgroundColor: '#1a0a0a',
    border: '1px solid #3a1a1a',
    borderRadius: '8px',
    color: '#f87171',
    fontSize: '0.875rem',
    padding: '14px 16px',
    marginBottom: '24px',
  },
};

const agentPhases = [
  { key: 'copy', label: 'Copy Agent', phase: 1 },
  { key: 'style', label: 'Style Agent', phase: 1 },
  { key: 'ctr', label: 'CTR Agent', phase: 2 },
];

function AgentIndicator({ agentKey, phase, currentPhase, done }) {
  const isActive = currentPhase === phase;
  const isDone = done;
  const isPending = currentPhase < phase;

  let icon;
  if (isDone) {
    icon = <span style={styles.dot('#4ade80')} />;
  } else if (isActive) {
    icon = <span style={styles.spinner} />;
  } else {
    icon = <span style={styles.dot('#333')} />;
  }

  return (
    <div style={styles.agentRow}>
      {icon}
      <span style={{ color: isDone ? '#aaa' : isActive ? '#fff' : '#444' }}>
        {agentPhases.find((a) => a.key === agentKey)?.label}
        {isActive && !isDone && (
          <span style={{ color: '#555', fontSize: '0.8rem' }}> — running</span>
        )}
        {isDone && (
          <span style={{ color: '#4ade80', fontSize: '0.8rem' }}> — done</span>
        )}
      </span>
    </div>
  );
}

export default function Home() {
  const [title, setTitle] = useState('');
  const [channelName, setChannelName] = useState('');
  const [niche, setNiche] = useState('');
  const [audience, setAudience] = useState('');
  const [loading, setLoading] = useState(false);
  const [agentPhase, setAgentPhase] = useState(0);
  const [agentsDone, setAgentsDone] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;

    setLoading(true);
    setResult(null);
    setError(null);
    setAgentPhase(1);
    setAgentsDone([]);

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, channelName, niche, audience }),
      });

      // Simulate phase transitions for UX
      const phaseTimer = setTimeout(() => {
        setAgentsDone(['copy', 'style']);
        setAgentPhase(2);
      }, 1800);

      const data = await res.json();
      clearTimeout(phaseTimer);

      if (!res.ok) {
        throw new Error(data.error || 'Unknown error');
      }

      setAgentsDone(['copy', 'style', 'ctr']);
      setAgentPhase(3);
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const inputFocusStyle = {
    ...styles.input,
    ':focus': { borderColor: '#444' },
  };

  return (
    <div style={styles.page}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input:focus { border-color: #444 !important; }
        button:hover:not(:disabled) { opacity: 0.85; }
      `}</style>

      <div style={styles.container}>
        <header style={styles.header}>
          <h1 style={styles.title}>ThumbAI</h1>
          <p style={styles.subtitle}>Multi-agent YouTube thumbnail generator</p>
        </header>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.fieldGroup}>
            <label style={styles.label} htmlFor="title">
              Video Title *
            </label>
            <input
              id="title"
              style={styles.input}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. I Built a $10K Business in 30 Days"
              required
              disabled={loading}
            />
          </div>

          <div style={styles.optionalGrid}>
            <div style={styles.fieldGroup}>
              <label style={styles.label} htmlFor="channel">
                Channel Name
              </label>
              <input
                id="channel"
                style={styles.input}
                type="text"
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
                placeholder="Optional"
                disabled={loading}
              />
            </div>
            <div style={styles.fieldGroup}>
              <label style={styles.label} htmlFor="niche">
                Niche
              </label>
              <input
                id="niche"
                style={styles.input}
                type="text"
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                placeholder="e.g. Finance"
                disabled={loading}
              />
            </div>
            <div style={styles.fieldGroup}>
              <label style={styles.label} htmlFor="audience">
                Audience
              </label>
              <input
                id="audience"
                style={styles.input}
                type="text"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="e.g. 25–34 entrepreneurs"
                disabled={loading}
              />
            </div>
          </div>

          <button
            type="submit"
            style={{
              ...styles.button,
              ...(loading || !title.trim() ? styles.buttonDisabled : {}),
            }}
            disabled={loading || !title.trim()}
          >
            {loading ? 'Generating…' : 'Generate Thumbnail Copy'}
          </button>
        </form>

        {loading && (
          <div style={styles.agentStatus}>
            <p style={styles.agentStatusTitle}>Agent Pipeline</p>
            {agentPhases.map((a) => (
              <AgentIndicator
                key={a.key}
                agentKey={a.key}
                phase={a.phase}
                currentPhase={agentPhase}
                done={agentsDone.includes(a.key)}
              />
            ))}
          </div>
        )}

        {error && (
          <div style={styles.errorBox}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {result && !loading && (
          <>
            <div style={styles.section}>
              <p style={styles.sectionTitle}>Ranked Headlines</p>
              {result.headlines.map((item, i) => (
                <div key={i} style={styles.headlineCard(i)}>
                  <div style={styles.rankBadge(i)}>#{i + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={styles.headlineText}>{item.headline}</p>
                    <p style={styles.reasonText}>{item.reason}</p>
                    <div style={styles.scoreBar}>
                      <div style={styles.scoreTrack}>
                        <div style={styles.scoreFill(item.score)} />
                      </div>
                      <span style={styles.scoreLabel}>{item.score}/10</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div style={styles.section}>
              <p style={styles.sectionTitle}>Style Recommendation</p>
              <div style={styles.styleCard}>
                <div style={styles.styleField}>
                  <span style={styles.styleLabel}>Mood</span>
                  <span style={styles.styleValue}>{result.style.mood}</span>
                </div>
                <div style={styles.styleField}>
                  <span style={styles.styleLabel}>Font Style</span>
                  <span style={styles.styleValue}>{result.style.fontStyle}</span>
                </div>
                <div style={styles.styleField}>
                  <span style={styles.styleLabel}>Primary Color</span>
                  <span style={styles.colorSwatch(result.style.primaryColor)}>
                    <span style={styles.swatchCircle(result.style.primaryColor)} />
                    {result.style.primaryColor}
                  </span>
                </div>
                <div style={styles.styleField}>
                  <span style={styles.styleLabel}>Accent Color</span>
                  <span style={styles.colorSwatch(result.style.accentColor)}>
                    <span style={styles.swatchCircle(result.style.accentColor)} />
                    {result.style.accentColor}
                  </span>
                </div>
                <div style={styles.styleFieldFull}>
                  <span style={styles.styleLabel}>Background</span>
                  <span style={styles.styleValue}>{result.style.bgSuggestion}</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
