const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

async function callGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  const res = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${err}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return text;
}

function extractJSON(text) {
  // Strip markdown code fences if present
  const stripped = text.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
  // Find first [ or { and last ] or }
  const firstArr = stripped.indexOf('[');
  const firstObj = stripped.indexOf('{');
  if (firstArr === -1 && firstObj === -1) return null;

  let start, endChar;
  if (firstArr !== -1 && (firstObj === -1 || firstArr < firstObj)) {
    start = firstArr;
    endChar = ']';
  } else {
    start = firstObj;
    endChar = '}';
  }
  const end = stripped.lastIndexOf(endChar);
  if (end === -1) return null;
  return stripped.slice(start, end + 1);
}

function validateJSON(text, type) {
  const jsonStr = extractJSON(text);
  if (!jsonStr) throw new Error('No JSON found in response');
  if (jsonStr.length > 10000) throw new Error('Response exceeds reasonable length');
  const parsed = JSON.parse(jsonStr);
  if (type === 'array' && !Array.isArray(parsed)) throw new Error('Expected JSON array');
  if (type === 'object' && (typeof parsed !== 'object' || Array.isArray(parsed)))
    throw new Error('Expected JSON object');
  return parsed;
}

async function withRetry(fn, validate, type) {
  try {
    const result = await fn();
    if (!result || result.trim() === '') throw new Error('Empty response from agent');
    return validate(result, type);
  } catch (firstErr) {
    // Retry once
    try {
      const result = await fn();
      if (!result || result.trim() === '') throw new Error('Empty response on retry');
      return validate(result, type);
    } catch (secondErr) {
      throw new Error(`Agent failed after retry: ${secondErr.message}`);
    }
  }
}

// ── Copy Agent ──────────────────────────────────────────────────────────────
async function runCopyAgent({ title, channelName, niche, audience }) {
  const context = [
    channelName && `Channel: ${channelName}`,
    niche && `Niche: ${niche}`,
    audience && `Audience: ${audience}`,
  ]
    .filter(Boolean)
    .join(', ');

  const prompt = `You are a YouTube thumbnail copy expert.
Generate exactly 3 punchy thumbnail headlines for a video titled: "${title}".
${context ? `Context — ${context}.` : ''}
Rules:
- Each headline must be under 6 words
- Headlines must be bold, curiosity-driving, and optimized for YouTube clicks
- Return ONLY a raw JSON array of 3 strings, no explanation, no markdown

Example output: ["Headline One", "Second Headline Here", "Third Bold Line"]`;

  return withRetry(() => callGemini(prompt), validateJSON, 'array');
}

// ── Style Agent ──────────────────────────────────────────────────────────────
async function runStyleAgent({ title, channelName, niche, audience }) {
  const context = [
    channelName && `Channel: ${channelName}`,
    niche && `Niche: ${niche}`,
    audience && `Audience: ${audience}`,
  ]
    .filter(Boolean)
    .join(', ');

  const prompt = `You are a YouTube thumbnail design expert.
Suggest a visual style for a thumbnail for a video titled: "${title}".
${context ? `Context — ${context}.` : ''}
Return ONLY a raw JSON object with these exact keys:
- mood: (string, e.g. "energetic", "mysterious", "professional")
- primaryColor: (hex color string, e.g. "#FF5733")
- accentColor: (hex color string)
- fontStyle: (string, e.g. "bold sans-serif", "condensed impact", "script")
- bgSuggestion: (string, brief background description under 10 words)

No explanation, no markdown, just the JSON object.`;

  return withRetry(() => callGemini(prompt), validateJSON, 'object');
}

// ── CTR Agent ────────────────────────────────────────────────────────────────
async function runCTRAgent(headlines) {
  const prompt = `You are a YouTube CTR optimization expert.
Score each of the following thumbnail headlines for YouTube click-through rate potential.
Headlines: ${JSON.stringify(headlines)}

For each headline, provide:
- score: integer from 1 to 10 (10 = highest CTR potential)
- reason: one sentence explaining the score

Return ONLY a raw JSON array, sorted from highest to lowest score, with this shape:
[{"headline": "...", "score": 9, "reason": "..."}, ...]

No explanation, no markdown, just the JSON array.`;

  const result = await withRetry(() => callGemini(prompt), validateJSON, 'array');

  // Ensure each item has required fields
  return result.map((item) => ({
    headline: String(item.headline ?? ''),
    score: Number(item.score ?? 0),
    reason: String(item.reason ?? ''),
  }));
}

// ── Coordinator ──────────────────────────────────────────────────────────────
export async function POST(request) {
  try {
    const body = await request.json();
    const { title, channelName, niche, audience } = body;

    if (!title || title.trim() === '') {
      return Response.json({ error: 'Video title is required' }, { status: 400 });
    }

    const input = { title: title.trim(), channelName, niche, audience };

    // Phase 1: Copy + Style run in parallel
    const [headlines, style] = await Promise.all([
      runCopyAgent(input),
      runStyleAgent(input),
    ]);

    // Phase 2: CTR agent uses headlines output
    const rankedHeadlines = await runCTRAgent(headlines);

    return Response.json({ headlines: rankedHeadlines, style });
  } catch (err) {
    console.error('[generate] error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
