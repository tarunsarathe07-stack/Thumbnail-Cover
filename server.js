require('dotenv').config();
const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const OpenAI   = require('openai');
const { toFile } = require('openai');
const session  = require('cookie-session');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { log: activityLog }          = require('./activity-logger');

const app  = express();
const PORT = process.env.PORT || 3000;

// OpenAI
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const openaiClient   = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

// ================= PROMPT SYSTEM =================

const VISUAL_PROMPT_SYSTEM = `You are a thumbnail visual prompt generator.

Return a SHORT visual prompt.

Rules:
- Max 15–20 words
- Only visual elements
- No storytelling
- No sentences
- Comma-separated phrases only

Format:
subject, action/emotion, key props, lighting, camera style

Return ONLY the prompt.`;

const HEADLINE_SYSTEM = `You are a YouTube thumbnail copywriter.

Generate a SHORT, powerful headline.

Rules:
- Max 3–5 words
- High curiosity or urgency
- No filler words
- Click-worthy

Examples:
CLAT in 7 Months → "CRACK CLAT FAST"
Manipur protest → "VIOLENCE ERUPTS"
IPL win → "MI CREATE HISTORY"

Return ONLY the headline.`;

// ================= CATEGORY =================

function detectCategory(input = '') {
  if (input.match(/clat|exam|study|upsc/i)) return 'education';
  if (input.match(/war|attack|protest|news|blast/i)) return 'news';
  return 'viral';
}

function getCategoryStyle(category) {
  if (category === 'education') {
    return `
- clean desk setup
- books, laptop
- calm cinematic lighting
- focused expression`;
  }

  if (category === 'news') {
    return `
- dramatic lighting
- emotional faces
- smoke, chaos
- urgency`;
  }

  return `
- exaggerated emotion
- bold colors
- dynamic framing`;
}

function getLayoutStyle() {
  const layouts = [
    'text top, subject center',
    'text center overlay, subject behind',
    'text bottom, subject top'
  ];
  return layouts[Math.floor(Math.random() * layouts.length)];
}

// ================= TEXT GENERATION =================

async function createTextCompletion(systemPrompt, userInput, maxTokens = 80) {
  const completion = await openaiClient.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userInput }
    ],
    max_tokens: maxTokens
  });

  return completion.choices[0].message.content?.trim() || '';
}

async function generateVisualPrompt(input) {
  return createTextCompletion(VISUAL_PROMPT_SYSTEM, input, 80);
}

function sanitizeHeadline(headline, fallbackInput) {
  const cleaned = String(headline || '').replace(/["']/g, '').trim();

  if (!cleaned) {
    return fallbackInput.split(' ').slice(0, 4).join(' ').toUpperCase();
  }

  return cleaned.split(' ').slice(0, 5).join(' ');
}

async function generateHeadline(input) {
  const raw = await createTextCompletion(HEADLINE_SYSTEM, input, 40);
  return sanitizeHeadline(raw, input);
}

// ================= FINAL PROMPT =================

function buildThumbnailPrompt({ visualPrompt, headline, category, layoutStyle }) {
  const categoryStyle = getCategoryStyle(category);

  return `
Create a high-quality YouTube thumbnail.

Subject:
${visualPrompt}

Headline:
"${headline}"

Style:
- cinematic lighting
- high contrast (not over-saturated)
- realistic skin tones
- professional color grading

Composition:
- clear focal subject
- close-up framing
- depth and separation

Text Layout:
- BIG bold headline
- high contrast colors
- strong readability

Layout:
- ${layoutStyle}

Category Style:
${categoryStyle}

Quality:
- ultra sharp
- photorealistic
- professional thumbnail
`.trim();
}

// ================= MIDDLEWARE =================

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: false }));

if (!process.env.SESSION_SECRET) {
  console.error('SESSION_SECRET missing');
  process.exit(1);
}

app.use(session({
  name: 'session',
  keys: [process.env.SESSION_SECRET],
  maxAge: 24 * 60 * 60 * 1000
}));

const imageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  keyGenerator: (req) => ipKeyGenerator(req.ip),
});

// ================= ROUTES =================

// Generate Thumbnail
app.post('/api/generate', imageLimiter, async (req, res) => {
  try {
    if (!openaiClient) {
      return res.status(500).json({ error: 'OpenAI key missing' });
    }

    const userInput = req.body.prompt?.trim();
    if (!userInput) {
      return res.status(400).json({ error: 'Prompt required' });
    }

    const category = detectCategory(userInput);
    const layoutStyle = getLayoutStyle();

    const [visualPromptRaw, headline] = await Promise.all([
      generateVisualPrompt(userInput),
      generateHeadline(userInput)
    ]);

    const visualPrompt = visualPromptRaw || userInput;

    const finalPrompt = buildThumbnailPrompt({
      visualPrompt,
      headline,
      category,
      layoutStyle
    });

    const result = await openaiClient.images.generate({
      model: 'gpt-image-2',
      prompt: finalPrompt,
      size: '1024x1792',
      quality: 'high'
    });

    const imageData = result.data?.[0]?.b64_json;

    res.json({
      success: true,
      imageData,
      mimeType: 'image/png'
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ================= START =================

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});