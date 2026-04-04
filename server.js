require('dotenv').config();
const express  = require('express');
const multer   = require('multer');
const fetch    = require('node-fetch');
const path     = require('path');
const fs       = require('fs');
const session  = require('cookie-session');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { log: activityLog }          = require('./activity-logger');

const app  = express();
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY      = process.env.GEMINI_API_KEY;
const GEMINI_API_URL      = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent';
const GEMINI_API_URL_FB   = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent';
const GEMINI_TEXT_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const OPENROUTER_API_URL  = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_KEY      = process.env._0xOK;
const OPENROUTER_MODEL    = process.env._0xOM || 'openai/gpt-oss-20b';

// ─── Brand knowledge base (prepended to every image generation) ────────────────
const BRAND_KB = `Brand Visual Style Guide for Professional Thumbnails:
- High contrast, bold aesthetic with cinematic quality
- Dark gritty or dramatic backgrounds
- Text rendered directly in the image with professional YouTube thumbnail typography
- Text style variety (pick the best for each thumbnail):
  * 3D extruded/embossed bold white text with depth and dark shadows (classic)
  * Metallic chrome or silver text with reflections and shine
  * Neon glow text (electric blue, red, green) with bloom effect against dark backgrounds
  * Bold gradient text (white-to-gold, red-to-orange, blue-to-cyan) with 3D depth
  * Clean modern sans-serif with colored highlight strips/banners behind key words
  * Distressed/grunge textured text for edgy or dramatic topics
  * Glass/transparent text with refraction effect for premium/tech topics
- Key highlight words: Use contrasting color — yellow/gold, red banner, neon accent, or colored underline
- Questions and exclamation points for engagement
- Text interacts with scene — can overlap subjects, have realistic depth and occlusion
- Layout 9:16: bold text in upper 40%, subject in center/lower area
- Layout 16:9: subject on right 30-40%, bold text block on left 60-70%
- Props and setting must match the topic (e.g. law books for legal, maps for geopolitics, charts for finance, etc.)
- Cinematic lighting: rim light on subject, key light from front-right, subtle vignette on edges
- Subjects and people must match the topic context and ethnicity where relevant
- Hyper-realistic photographic quality, no cartoons or illustrations`;

// ─── Multer config ─────────────────────────────────────────────────────────────
const storage = multer.memoryStorage();
const upload  = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
    allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error('Only image files are allowed'));
  }
});

// ─── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: false }));

// ─── Session ───────────────────────────────────────────────────────────────────
if (!process.env.SESSION_SECRET) {
  console.error('FATAL: SESSION_SECRET is not set — refusing to start with an insecure default.');
  process.exit(1);
}
const isProduction = process.env.NODE_ENV === 'production';
if (isProduction) app.set('trust proxy', 1);
// cookie-session stores the session in a signed cookie — no server-side store
// required, so it works correctly in Vercel's stateless serverless environment.
app.use(session({
  name:     'session',
  keys:     [process.env.SESSION_SECRET],
  maxAge:   24 * 60 * 60 * 1000,
  httpOnly: true,
  sameSite: 'lax',
  secure:   isProduction
}));

// ─── Rate limiting ─────────────────────────────────────────────────────────────
const imageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? 'unknown'),
  handler: (req, res) => {
    res.status(429).json({
      error: `Too many requests — you can generate up to 5 images per minute. Please wait ${Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000)}s and try again.`
    });
  }
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? 'unknown'),
  handler: (req, res) => {
    res.status(429).json({
      error: `Too many login attempts — please wait ${Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000)}s and try again.`
    });
  }
});

const promptLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? 'unknown'),
  handler: (req, res) => {
    res.status(429).json({
      error: `Too many prompt requests — please wait ${Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000)}s and try again.`
    });
  }
});

// ─── Auth middleware ───────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session?.loggedIn) return next();
  if (req.method !== 'GET') {
    return res.status(401).json({ error: 'Unauthorised. Please log in.' });
  }
  res.redirect('/login');
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PUBLIC ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/login', (req, res) => {
  if (req.session?.loggedIn) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/api/login', loginLimiter, (req, res) => {
  const { username, password } = req.body;
  const validUser = process.env.LOGIN_USER;
  const validPass = process.env.LOGIN_PASS;

  if (!validUser || !validPass) {
    return res.status(500).json({ error: 'Login credentials not configured in .env' });
  }

  if (username === validUser && password === validPass) {
    req.session.loggedIn = true;
    req.session.user     = username;
    activityLog(username, 'login', { ip: req.ip });
    return res.json({ success: true });
  }

  const safeUser = String(username || '').replace(/[^\x20-\x7E]/g, '').slice(0, 64);
  activityLog('unknown', 'login-failed', { ip: req.ip, attempted: safeUser });
  res.status(401).json({ error: 'Invalid username or password.' });
});

app.post('/api/logout', (req, res) => {
  const user = req.session.user;
  req.session = null; // clears the cookie-session cookie
  activityLog(user, 'logout', {});
  res.json({ success: true });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    keyConfigured: !!GEMINI_API_KEY && GEMINI_API_KEY !== 'your_gemini_api_key_here',
    loggedIn: !!req.session?.loggedIn
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  AUTH WALL
// ═══════════════════════════════════════════════════════════════════════════════
app.use(requireAuth);

// ─── Protected static files ────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─── Current user ──────────────────────────────────────────────────────────────
app.get('/api/me', (req, res) => {
  res.json({ user: req.session.user || 'User' });
});

// ─── Preset faces ──────────────────────────────────────────────────────────────
app.get('/api/presets', (req, res) => {
  const presetsDir = path.join(__dirname, 'public', 'presets');
  const allowed    = ['.jpg', '.jpeg', '.png', '.svg', '.gif', '.webp'];
  try {
    if (!fs.existsSync(presetsDir)) return res.json({ presets: [] });
    const presets = fs.readdirSync(presetsDir)
      .filter(f => allowed.includes(path.extname(f).toLowerCase()))
      .sort()
      .map(filename => ({
        filename,
        name: path.basename(filename, path.extname(filename))
          .replace(/-/g, ' ')
          .replace(/_/g, ' ')
          .replace(/\b\w/g, c => c.toUpperCase()),
        url: `/presets/${filename}`
      }));
    res.json({ presets });
  } catch (err) {
    console.error('Presets error:', err.message);
    res.json({ presets: [] });
  }
});

// ─── Suggest prompt ────────────────────────────────────────────────────────────
app.post('/api/suggest-prompt', promptLimiter, async (req, res) => {
  try {
    const { topic, category, aspectRatio } = req.body;
    if (!topic && !category) {
      return res.status(400).json({ error: 'Topic or category is required.' });
    }
    if ((topic && topic.length > 500) || (category && category.length > 200)) {
      return res.status(400).json({ error: 'Topic or category is too long.' });
    }

    const ratioLabel = aspectRatio === '9:16' ? '9:16' : '16:9';
    const platform   = aspectRatio === '9:16' ? 'Instagram Reels / YouTube Shorts' : 'YouTube';

    const systemPrompt = `You are an expert thumbnail prompt engineer for ${platform} content.

Topic: "${topic || category}"
Format: ${ratioLabel}

First, ANALYZE the topic to determine:
- CATEGORY: What kind of content is this? (e.g. exam prep, current affairs, geopolitics, finance, tech, lifestyle, motivation, etc.)
- SUBJECTS: Who/what should appear? (e.g. students for exams, world leaders for geopolitics, collage of news events for current affairs, etc.)
- PROPS: What objects fit the topic? (e.g. law books for legal, world maps for geopolitics, stock charts for finance, newspapers for current affairs, etc.)
- HEADLINE: Convert the topic into a punchy ALL-CAPS headline (2-8 words)

Generate exactly 3 thumbnail prompt variants with DIFFERENT scenes.
Each prompt must include both a cinematic scene AND detailed 3D text rendering instructions.

For the TEXT portion:
- Each prompt should use a DIFFERENT text style from these options:
  * 3D extruded/embossed bold white text with depth and dark shadows (classic style)
  * Metallic chrome/silver text with reflections and shine
  * Neon glow text (electric blue, red, green) with bloom effect on dark background
  * Bold gradient text (white-to-gold, red-to-orange) with 3D depth
  * Clean modern sans-serif with colored highlight strips/banners behind key words
  * Distressed/grunge textured text for edgy topics
- Key highlight words: use a contrasting color — yellow/gold, red banner, neon accent, or colored underline
- Add question mark or exclamation for engagement where appropriate
- Text should be in the upper portion of the image, large and dominant

Format each prompt EXACTLY like this:
Cinematic ${ratioLabel} thumbnail: [scene — subject, setting, cinematic lighting, topic-relevant props]; bold 3D extruded white text "[MAIN TEXT]" with strong depth and dark shadow in upper area, [highlight word] in yellow/gold 3D text [or on red/colored banner]; hyper-realistic photographic quality

Rules:
- Subjects, people, props, and settings MUST match the topic (not generic students unless topic is academic)
- For current affairs: use collage of relevant news imagery, world leaders, event photos
- For geopolitics: use maps, flags, political figures, dramatic lighting
- For exams/academics: use Indian students, law books, OMR sheets, classrooms
- Dark dramatic backgrounds with cinematic lighting
- Text MUST be described as 3D/embossed/extruded — never flat
- Vary the scenes: Prompt 1 = people/figures relevant to topic, Prompt 2 = action/emotion scene, Prompt 3 = symbolic/abstract concept

Return ONLY 3 numbered lines:
1. [prompt 1]
2. [prompt 2]
3. [prompt 3]`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);

    let raw = '';

    // ── Try OpenRouter first, fall back to Gemini ──────────────────────────────
    if (OPENROUTER_KEY) {
      const orRes = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${OPENROUTER_KEY}`,
          'HTTP-Referer':  process.env.APP_URL || `http://localhost:${PORT}`,
          'X-Title':       'ThumbAI'
        },
        body: JSON.stringify({
          model:      OPENROUTER_MODEL,
          messages:   [{ role: 'user', content: systemPrompt }],
          temperature: 0.8,
          max_tokens:  2500
        }),
        signal: controller.signal
      });
      clearTimeout(timer);
      const orData = await orRes.json();
      if (orRes.ok) {
        raw = orData?.choices?.[0]?.message?.content?.trim() || '';
      } else {
        console.warn('[OpenRouter] Error:', orData?.error?.message || orRes.status, '— falling back to Gemini');
      }
    }

    // ── Fallback: Gemini text model ────────────────────────────────────────────
    if (!raw) {
      if (!GEMINI_API_KEY || GEMINI_API_KEY === 'your_gemini_api_key_here') {
        return res.status(500).json({ error: 'No prompt API configured (set GEMINI_API_KEY or _0xOK in .env).' });
      }
      const ctrl2 = new AbortController();
      const timer2 = setTimeout(() => ctrl2.abort(), 30000);
      const gRes = await fetch(`${GEMINI_TEXT_API_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt }] }],
          generationConfig: { temperature: 0.8, maxOutputTokens: 2500 }
        }),
        signal: ctrl2.signal
      });
      clearTimeout(timer2);
      const gData = await gRes.json();
      if (!gRes.ok) {
        return res.status(gRes.status).json({ error: gData?.error?.message || 'Gemini API error' });
      }
      raw = gData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    }

    if (!raw) return res.status(500).json({ error: 'No prompt returned. Try a different topic.' });

    // Parse numbered lines "1. ...", "2. ...", "3. ..."
    const prompts = raw
      .split('\n')
      .map(l => l.trim())
      .filter(l => /^\d+\.\s+/.test(l))
      .map(l => l.replace(/^\d+\.\s+/, '').trim())
      .filter(Boolean);

    if (prompts.length === 0) {
      // Fallback: return whole text as single prompt
      activityLog(req.session.user, 'suggest-prompt', { topic: (topic || category || '').slice(0, 80) });
      return res.json({ success: true, prompts: [raw] });
    }

    activityLog(req.session.user, 'suggest-prompt', { topic: (topic || category || '').slice(0, 80) });
    res.json({ success: true, prompts });
  } catch (err) {
    console.error('Suggest prompt error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ─── Generate thumbnail ────────────────────────────────────────────────────────
app.post('/api/generate', imageLimiter, async (req, res) => {
  try {
    if (!GEMINI_API_KEY || GEMINI_API_KEY === 'your_gemini_api_key_here') {
      return res.status(500).json({ error: 'Gemini API key not configured. Please set GEMINI_API_KEY in your .env file.' });
    }

    const { prompt, aspectRatio } = req.body;
    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: 'Prompt is required.' });
    }
    if (prompt.length > 2000) {
      return res.status(400).json({ error: 'Prompt exceeds maximum length of 2000 characters.' });
    }

    const dimPrefix = aspectRatio === '9:16'
      ? 'Create a 9:16 portrait image (1008x1792px) for Instagram Reels / YouTube Shorts.'
      : 'Create a 16:9 landscape image (1792x1008px) for YouTube thumbnails.';

    const enhancedPrompt =
      `${dimPrefix}\n\n` +
      `Visual Style Guidelines:\n${BRAND_KB}\n\n` +
      `Design Request: ${prompt.trim()}\n\n` +
      `Create a professional, eye-catching thumbnail optimized for ${aspectRatio === '9:16' ? 'Instagram Reels' : 'YouTube'}. ` +
      `Render ALL text directly in the image as bold 3D extruded/embossed text with photorealistic depth, shadows, and lighting effects. ` +
      `Text must look like professional YouTube thumbnail typography — thick, 3D, with strong drop shadows. No flat or plain text. ` +
      `The scene, subjects, props, and setting must match the topic described above — do not default to generic academic/student imagery unless the topic is about education. ` +
      `The image must be vibrant, high-contrast, and designed to maximize click-through rates. No letterboxing or borders.`;

    const requestBody = {
      contents: [{ parts: [{ text: enhancedPrompt }] }],
      generationConfig: { responseModalities: ['IMAGE', 'TEXT'] }
    };

    // ── Try new model first, fall back to flash-exp ────────────────────────────
    const ctrl = new AbortController();
    const tId  = setTimeout(() => ctrl.abort(), 60000);

    let response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: ctrl.signal
    });
    clearTimeout(tId);

    // If new model not available, fall back silently
    if (response.status === 404 || response.status === 400) {
      console.log('[Generate] gemini-3-pro-image-preview not available, falling back to flash-exp');
      const ctrl2 = new AbortController();
      const tId2  = setTimeout(() => ctrl2.abort(), 60000);
      response = await fetch(`${GEMINI_API_URL_FB}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: ctrl2.signal
      });
      clearTimeout(tId2);
    }

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data?.error?.message || 'Gemini API error' });
    }

    const candidates = data?.candidates || [];
    for (const candidate of candidates) {
      for (const part of candidate?.content?.parts || []) {
        if (part.inlineData?.mimeType?.startsWith('image/')) {
          activityLog(req.session.user, 'generate', { ratio: aspectRatio });
          return res.json({
            success:    true,
            imageData:  part.inlineData.data,
            mimeType:   part.inlineData.mimeType,
            aspectRatio
          });
        }
      }
    }

    return res.status(500).json({ error: 'No image was returned by Gemini. Try a different prompt.' });
  } catch (err) {
    console.error('Generate error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ─── Face swap ─────────────────────────────────────────────────────────────────
app.post('/api/faceswap', imageLimiter, upload.fields([
  { name: 'sourceImage', maxCount: 1 },
  { name: 'targetImage', maxCount: 1 }
]), async (req, res) => {
  try {
    if (!GEMINI_API_KEY || GEMINI_API_KEY === 'your_gemini_api_key_here') {
      return res.status(500).json({ error: 'Gemini API key not configured. Please set GEMINI_API_KEY in your .env file.' });
    }

    const sourceFile = req.files?.sourceImage?.[0];
    const targetFile = req.files?.targetImage?.[0];

    if (!sourceFile || !targetFile) {
      return res.status(400).json({ error: 'Both source image (face to use) and target image (face to replace) are required.' });
    }

    const sourceBase64 = sourceFile.buffer.toString('base64');
    const targetBase64 = targetFile.buffer.toString('base64');
    const sourceMime   = sourceFile.mimetype;
    const targetMime   = targetFile.mimetype;

    // Detailed photorealistic face-swap prompt (based on original LPT Cover Creator)
    const defaultPrompt =
      `YOUR MISSION: Create a PHOTOREALISTIC composite where the head from the Source Face image appears to have ALWAYS been part of the scene in the Target Image. The result must look like a real photograph, not an edited image.\n\n` +
      `COMPLETE HEAD REPLACEMENT:\n` +
      `1. IDENTIFY the main character in the Target Image whose head will be replaced\n` +
      `2. EXTRACT the complete head from the Source Face: entire face (eyes, nose, mouth, cheeks, chin, forehead, jawline), complete hair (every strand, full hairstyle, colour, texture, length), ears if visible, facial hair if present, neck upper portion to blend with body\n` +
      `3. REPLACE the character's head in the Target Image with the head from the Source Face\n` +
      `4. PRESERVE the exact facial expression and emotion from the Target Image — match the exact mouth position, eye expression, and eyebrow position\n\n` +
      `CRITICAL PHOTOREALISTIC BLENDING:\n` +
      `- LIGHTING: Analyse lighting direction, intensity, and colour in the Target Image. Re-light the Source Face head to exactly match. Add highlights and shadows accordingly.\n` +
      `- SKIN TONE: Adjust skin tone from the Source Face to match the lighting conditions of the Target Image. Ensure skin looks natural and consistent.\n` +
      `- NECK BLEND: Seamlessly blend where head meets body — no visible seam, no colour mismatch, no harsh edges. Match skin tone at junction.\n` +
      `- HAIR: Blend hair edges naturally with the background. Preserve hair texture and style. No artificial cutout edges.\n` +
      `- SCALE: Match the head size proportionally to the body in the Target Image.\n\n` +
      `OUTPUT REQUIREMENTS:\n` +
      `- Return the complete image maintaining the EXACT same aspect ratio, composition, and dimensions as the Target Image\n` +
      `- Every element of the Target Image must be preserved EXCEPT the head\n` +
      `- The result must look like a real, unedited photograph`;

    const prompt = req.body.prompt?.trim() || defaultPrompt;

    const requestBody = {
      contents: [{
        parts: [
          { text: 'Source Face image (use this face):' },
          { inlineData: { mimeType: sourceMime, data: sourceBase64 } },
          { text: 'Target image (replace the face in this image with the face from the Source Face above):' },
          { inlineData: { mimeType: targetMime, data: targetBase64 } },
          { text: prompt }
        ]
      }],
      generationConfig: {
        temperature: 0.4,
        topK: 32,
        topP: 1,
        maxOutputTokens: 4096,
        responseModalities: ['IMAGE', 'TEXT']
      }
    };

    const ctrl2 = new AbortController();
    const tId2  = setTimeout(() => ctrl2.abort(), 90000);
    let fsResponse = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: ctrl2.signal
    });
    clearTimeout(tId2);

    if (fsResponse.status === 404 || fsResponse.status === 400) {
      const ctrl3 = new AbortController();
      const tId3  = setTimeout(() => ctrl3.abort(), 90000);
      fsResponse = await fetch(`${GEMINI_API_URL_FB}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: ctrl3.signal
      });
      clearTimeout(tId3);
    }

    const response = fsResponse;
    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data?.error?.message || 'Gemini API error' });
    }

    const candidates = data?.candidates || [];
    for (const candidate of candidates) {
      for (const part of candidate?.content?.parts || []) {
        if (part.inlineData?.mimeType?.startsWith('image/')) {
          activityLog(req.session.user, 'faceswap', {});
          return res.json({
            success:   true,
            imageData: part.inlineData.data,
            mimeType:  part.inlineData.mimeType
          });
        }
      }
    }

    let textResponse = '';
    for (const candidate of candidates) {
      for (const part of candidate?.content?.parts || []) {
        if (part.text) textResponse += part.text;
      }
    }

    return res.status(500).json({
      error: textResponse || 'No image was returned. Gemini may have declined due to safety filters. Try different images.'
    });
  } catch (err) {
    console.error('Face swap error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ─── Catch-all → serve frontend ────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start (only when run directly, not when imported by Vercel) ───────────────
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n🚀 AI Thumbnail Generator running at http://localhost:${PORT}`);
    if (!GEMINI_API_KEY || GEMINI_API_KEY === 'your_gemini_api_key_here') {
      console.warn('⚠️  WARNING: GEMINI_API_KEY is not set in .env — API calls will fail.\n');
    } else {
      console.log('✅ Gemini API key loaded.');
    }
    if (!process.env.LOGIN_USER || !process.env.LOGIN_PASS) {
      console.warn('⚠️  WARNING: LOGIN_USER and LOGIN_PASS are not set in .env — login will be broken.\n');
    } else {
      console.log(`✅ Login configured for user: ${process.env.LOGIN_USER}\n`);
    }
  });
}

module.exports = app;
