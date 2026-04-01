const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

async function callGemini(prompt) {
  const res = await fetch(`${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.8 },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty response from Gemini");
  return text;
}

function extractJSON(raw) {
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const cleaned = match ? match[1].trim() : raw.trim();
  return JSON.parse(cleaned);
}

function validate(parsed, check) {
  if (parsed == null) throw new Error("Parsed result is null");
  const str = JSON.stringify(parsed);
  if (str.length > 5000) throw new Error("Response too long");
  check(parsed);
  return parsed;
}

async function withRetry(fn) {
  try {
    return await fn();
  } catch (e) {
    console.warn("Agent failed, retrying once:", e.message);
    return await fn();
  }
}

// ── Copy Agent ──────────────────────────────────────────────────────────────
async function copyAgent(title, brand) {
  const brandCtx = brand.channelName
    ? `Channel: ${brand.channelName}, Niche: ${brand.niche}, Audience: ${brand.audience}.`
    : "";

  const prompt = `You are a YouTube thumbnail headline expert.
Given this video title: "${title}"
${brandCtx}
Return exactly 3 punchy thumbnail headlines, each UNDER 6 words.
Respond ONLY with a JSON array of 3 strings, no explanation.
Example: ["Headline One","Headline Two","Headline Three"]`;

  return withRetry(async () => {
    const raw = await callGemini(prompt);
    const parsed = extractJSON(raw);
    return validate(parsed, (p) => {
      if (!Array.isArray(p) || p.length !== 3)
        throw new Error("Copy agent must return array of 3");
      if (p.some((h) => typeof h !== "string" || h.split(/\s+/).length > 8))
        throw new Error("Headlines must be short strings");
    });
  });
}

// ── Style Agent ─────────────────────────────────────────────────────────────
async function styleAgent(title, brand) {
  const brandCtx = brand.channelName
    ? `Channel: ${brand.channelName}, Niche: ${brand.niche}, Audience: ${brand.audience}.`
    : "";

  const prompt = `You are a YouTube thumbnail visual-style advisor.
Given this video title: "${title}"
${brandCtx}
Return a JSON object with these exact keys:
- mood (string): the emotional tone
- primaryColor (hex string)
- accentColor (hex string)
- fontStyle (string): e.g. "bold sans-serif"
- bgSuggestion (string): a short background description

Respond ONLY with the JSON object, no explanation.`;

  return withRetry(async () => {
    const raw = await callGemini(prompt);
    const parsed = extractJSON(raw);
    return validate(parsed, (p) => {
      const keys = ["mood", "primaryColor", "accentColor", "fontStyle", "bgSuggestion"];
      for (const k of keys) {
        if (typeof p[k] !== "string" || p[k].length === 0)
          throw new Error(`Style agent missing key: ${k}`);
      }
    });
  });
}

// ── CTR Agent ───────────────────────────────────────────────────────────────
async function ctrAgent(headlines, title) {
  const prompt = `You are a YouTube click-through-rate analyst.
Video title: "${title}"
Headlines: ${JSON.stringify(headlines)}

Score each headline 1-10 for YouTube CTR potential. Return a JSON array sorted best-first.
Each element: { "headline": "...", "score": N, "reason": "..." }
Respond ONLY with the JSON array, no explanation.`;

  return withRetry(async () => {
    const raw = await callGemini(prompt);
    const parsed = extractJSON(raw);
    return validate(parsed, (p) => {
      if (!Array.isArray(p) || p.length === 0)
        throw new Error("CTR agent must return non-empty array");
      for (const item of p) {
        if (typeof item.score !== "number" || !item.headline || !item.reason)
          throw new Error("CTR item missing fields");
      }
    });
  });
}

// ── Coordinator ─────────────────────────────────────────────────────────────
export async function POST(request) {
  try {
    const { title, brand = {} } = await request.json();

    if (!title || typeof title !== "string") {
      return Response.json({ error: "title is required" }, { status: 400 });
    }

    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "your-gemini-api-key-here") {
      return Response.json(
        { error: "GEMINI_API_KEY not configured. Add it to .env.local" },
        { status: 500 }
      );
    }

    // Phase 1: Copy + Style in parallel
    const [headlines, style] = await Promise.all([
      copyAgent(title, brand),
      styleAgent(title, brand),
    ]);

    // Phase 2: CTR agent depends on headlines
    const ranked = await ctrAgent(headlines, title);

    return Response.json({ headlines, style, ranked });
  } catch (err) {
    console.error("Generate error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
