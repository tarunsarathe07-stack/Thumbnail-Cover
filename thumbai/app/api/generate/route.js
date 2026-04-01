import { NextResponse } from "next/server";

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

async function callGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7 },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty response from Gemini");
  return text;
}

function extractJSON(text) {
  const match = text.match(/[\[{][\s\S]*[\]}]/);
  if (!match) throw new Error("No JSON found in response");
  return JSON.parse(match[0]);
}

function validateNotEmpty(parsed, label) {
  if (parsed === null || parsed === undefined) {
    throw new Error(`${label}: parsed result is empty`);
  }
  if (Array.isArray(parsed) && parsed.length === 0) {
    throw new Error(`${label}: returned empty array`);
  }
  if (typeof parsed === "object" && Object.keys(parsed).length === 0) {
    throw new Error(`${label}: returned empty object`);
  }
  const str = JSON.stringify(parsed);
  if (str.length > 5000) {
    throw new Error(`${label}: response too large (${str.length} chars)`);
  }
}

async function callAgentWithRetry(promptFn, label) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await callGemini(promptFn());
      const parsed = extractJSON(raw);
      validateNotEmpty(parsed, label);
      return parsed;
    } catch (err) {
      if (attempt === 1) throw new Error(`${label} failed after retry: ${err.message}`);
    }
  }
}

// --- Agent prompt builders ---

function copyPrompt(title, brand) {
  let context = `Video title: "${title}"`;
  if (brand.channelName) context += `\nChannel: ${brand.channelName}`;
  if (brand.niche) context += `\nNiche: ${brand.niche}`;
  if (brand.audience) context += `\nTarget audience: ${brand.audience}`;

  return `You are a YouTube thumbnail copy expert. Given the following video info, generate exactly 3 punchy thumbnail headlines. Each headline must be under 6 words.

${context}

Respond ONLY with a JSON array of 3 strings. Example: ["Headline One", "Headline Two", "Headline Three"]`;
}

function stylePrompt(title, brand) {
  let context = `Video title: "${title}"`;
  if (brand.channelName) context += `\nChannel: ${brand.channelName}`;
  if (brand.niche) context += `\nNiche: ${brand.niche}`;
  if (brand.audience) context += `\nTarget audience: ${brand.audience}`;

  return `You are a YouTube thumbnail style designer. Given the following video info, suggest a visual style.

${context}

Respond ONLY with a JSON object containing exactly these keys:
- "mood": a 1-2 word mood description
- "primaryColor": a hex color code
- "accentColor": a hex color code
- "fontStyle": a font style suggestion (e.g. "Bold Sans-Serif")
- "bgSuggestion": a brief background description`;
}

function ctrPrompt(headlines) {
  return `You are a YouTube CTR (click-through rate) optimization expert. Score each of these thumbnail headlines from 1-10 for YouTube click-through rate potential.

Headlines: ${JSON.stringify(headlines)}

Respond ONLY with a JSON array of objects, each with "headline", "score" (number 1-10), and "reason" (brief explanation). Sort by score descending.`;
}

export async function POST(request) {
  try {
    const { title, brand = {} } = await request.json();

    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return NextResponse.json({ error: "Video title is required" }, { status: 400 });
    }

    // Phase 1: Copy + Style agents in parallel
    const [headlines, style] = await Promise.all([
      callAgentWithRetry(() => copyPrompt(title, brand), "Copy Agent"),
      callAgentWithRetry(() => stylePrompt(title, brand), "Style Agent"),
    ]);

    // Phase 2: CTR agent uses headlines from Phase 1
    const ranked = await callAgentWithRetry(() => ctrPrompt(headlines), "CTR Agent");

    return NextResponse.json({ headlines, style, ranked });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
