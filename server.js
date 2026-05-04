require('dotenv').config();
const express  = require('express');
const multer   = require('multer');
const fetch    = require('node-fetch');
const path     = require('path');
const fs       = require('fs');
const OpenAI   = require('openai');
const { toFile } = require('openai');
const session  = require('cookie-session');
const { rateLimit } = require('express-rate-limit');
// express-rate-limit does not export ipKeyGenerator; strip IPv6-mapped IPv4 inline
const ipKeyGenerator = (ip) => (ip ?? 'unknown').replace(/^::ffff:/, '');
const { log: activityLog }          = require('./activity-logger');

// ─── Required environment variables ───────────────────────────────────────────
// OPENAI_API_KEY  — OpenAI key for thumbnail generation (gpt-image-1.5)
// GEMINI_API_KEY  — Google Gemini key for face swap + prompt suggestions
// SESSION_SECRET  — Secret used to sign cookie-session cookies
// LOGIN_USER      — App login username
// LOGIN_PASS      — App login password

const app  = express();
const PORT = process.env.PORT || 3000;

// OpenAI — used by /api/v1/process
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
// Initialise lazily so the server starts cleanly even without the key set
const openaiClient   = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

// Gemini — used by /api/v1/transform and /api/v1/enhance
const GEMINI_API_KEY      = process.env.GEMINI_API_KEY;
const GEMINI_API_URL      = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent';
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

const REFERENCE_THUMBNAIL_RULES = `ScrollStop reference-quality rules:
- Make title typography a designed hero, not pasted text. If title-led, it should own about 35-50% of the frame.
- Use exact topic-specific props, institutions, people, books, symbols, places, or product cues instead of generic icons.
- Build three visible depth planes: foreground object, mid subject/action, background environment.
- Choose one cinematic color grade that fits the topic: amber study room, steel blue tech, sepia legal, red/grey crisis, gold/political, etc.
- Keep one strong visual idea. Avoid clutter, checklist walls, UI mockups, random warning triangles, random clocks, generic stock faces, tiny text, and default AI-thumbnail templates.`;

const DIRECTION_GUIDES = {
  auto: `Choose the strongest reference-quality archetype for the topic. Decide whether it should be typography-led, symbolic poster, face-led, documentary/news, academic, or tech rivalry.`,
  poster: `Symbolic premium poster. Use iconic objects at dramatic scale, strong title hierarchy, deep shadows, premium texture, and one memorable scene.`,
  news: `Urgent current-affairs drama. Use real institutions, flags, city/place cues, political/legal props, crowd or conflict context, and headline-scale typography.`,
  academic: `Ed-tech/exam quality. Use subject-specific books, notes, exam halls, study lamps, desks, admit cards, syllabus cues, Indian student context where relevant, and disciplined study-war-room lighting. Do not overuse clocks unless time pressure is central.`,
  tech: `AI/startup/business rivalry. Use product/entity-specific visual cues, futuristic or documentary lighting, polished hardware/interface-adjacent symbolism, and premium steel-blue/gold contrast.`,
  face: `Emotion-led thumbnail. Use a face only when expression carries the click; make it specific, intense, and context-aware rather than a generic stock reaction.`,
  typography: `Title-led design. Make typography the main composition with minimal but specific supporting imagery, strong font contrast, banners/highlights, and excellent readability.`
};

function formatLabelForRatio(aspectRatio) {
  return aspectRatio === '9:16'
    ? 'vertical 9:16 Shorts / Instagram Reels cover'
    : 'landscape 16:9 YouTube thumbnail';
}

function directionGuideFor(mode) {
  return DIRECTION_GUIDES[mode] || DIRECTION_GUIDES.auto;
}

function buildReferenceSuffix(formatLabel) {
  return `Render as a premium ${formatLabel}.

Reference-quality requirements:
- Integrate the exact title text as designed thumbnail typography, not as a plain caption.
- If the thumbnail is title-led, let typography occupy roughly 35-50% of the frame with mixed weight/color hierarchy.
- Include topic-specific props, entities, places, books, institutions, product symbols, or visual cues that prove the image understands the subject.
- Create three depth planes: foreground object, midground subject/action, background environment.
- Use one distinct cinematic color grade matched to the topic.
- Keep one clear focal idea with premium YouTube/Shorts cover polish.

Avoid default AI-thumbnail templates, random warning icons, random clocks unless central to the idea, generic stock faces, cluttered checklists, app UI, watermarks, tiny unreadable text, bullet lists, and side-panel layouts.`;
}

async function buildPremiumArtDirection(openaiClient, inputPrompt, aspectRatio) {
  const formatLabel = formatLabelForRatio(aspectRatio);
  const completion = await openaiClient.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are ScrollStop's final art director for premium thumbnail generation.

Rewrite the user's prompt into one decisive GPT Image prompt that matches these proven ScrollStop reference thumbnails:
${REFERENCE_THUMBNAIL_RULES}

Keep the user's title/topic and named entities exact. Do not invent unrelated people or false facts. Choose the strongest visual metaphor, typography system, props, color grade, and depth layout. The output must be image-generation prompt text only, under 180 words.`
      },
      {
        role: 'user',
        content: `Format: ${formatLabel}
User prompt or creative brief:
${inputPrompt}`
      }
    ],
    max_tokens: 260
  });

  return completion.choices[0].message.content?.trim();
}

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
  console.error('FATAL: SESSION_SECRET is not set.');
  // process.exit(1) kills the Vercel serverless process on every cold start,
  // causing FUNCTION_INVOCATION_FAILED before any response can be sent.
  // Register a catch-all 500 handler and halt further initialisation via return
  // (safe in CommonJS — Node wraps modules in a function).
  // Local `node server.js` still exits non-zero via the guard below.
  app.use((_req, res) => res.status(500).json({ error: 'Server misconfiguration: SESSION_SECRET is not set.' }));
  module.exports = app;
  if (require.main === module) process.exit(1);
  return; // stop initialising — prevents insecure handlers from being registered
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

// ─── Security response headers (all /api routes) ──────────────────────────────
app.use('/api', (req, res, next) => {
  res.removeHeader('X-Powered-By');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

// ═══════════════════════════════════════════════════════════════════════════════
//  PUBLIC ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/login', (req, res) => {
  if (req.session?.loggedIn) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/api/v1/auth', loginLimiter, (req, res) => {
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

app.post('/api/v1/end', (req, res) => {
  const user = req.session.user;
  req.session = null; // clears the cookie-session cookie
  activityLog(user, 'logout', {});
  res.json({ success: true });
});

app.get('/api/v1/status', (req, res) => {
  res.json({
    status: 'ok',
    keyConfigured: !!OPENAI_API_KEY,
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
app.get('/api/v1/session', (req, res) => {
  res.json({ user: req.session.user || 'User' });
});

// ─── Preset faces ──────────────────────────────────────────────────────────────
app.get('/api/v1/config', (req, res) => {
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

// ─── Suggest prompt (OpenAI gpt-4o-mini) ──────────────────────────────────────
app.post('/api/v1/enhance', promptLimiter, async (req, res) => {
  try {
    if (!openaiClient) {
      return res.status(500).json({ error: 'OpenAI API key not configured.' });
    }
    const { topic, category, aspectRatio } = req.body;
    const directionMode = String(req.body.directionMode || 'auto').toLowerCase();
    const directionGuide = directionGuideFor(directionMode);
    const userInput = (topic || category || '').trim();
    if (!userInput) {
      return res.status(400).json({ error: 'Topic or category is required.' });
    }
    if (userInput.length > 500) {
      return res.status(400).json({ error: 'Topic is too long.' });
    }

    const formatLabel = formatLabelForRatio(aspectRatio);
    const completion = await openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are ScrollStop's senior thumbnail art director. Convert the user's topic into a compact editable creative brief for GPT Image.

Match the quality of premium ScrollStop reference thumbnails:
${REFERENCE_THUMBNAIL_RULES}

Direction mode matters. Use it to choose taste, props, composition, color, and typography, but do not force a rigid template.

Output only the creative brief. Keep it under 950 characters so it fits in the app textarea.
Use this exact compact format:
Create a premium [format] for: "[exact title]"
TITLE: [exact words to render in the image]
TYPOGRAPHY: [size, weight, color, treatment — e.g. "oversized gold distressed, top 45% of frame"]
HERO: [main subject — specific, not generic]
PROPS: [2-3 topic-specific objects/entities/places, not generic symbols]
COLOR GRADE: [one cinematic palette — e.g. "warm amber shadows, dark charcoal background"]
DEPTH: FG [foreground object] | MG [midground subject/action] | BG [background environment]
AVOID: [short anti-generic constraints specific to this topic]`
        },
        {
          role: 'user',
          content: `Title/topic: ${userInput}
Format: ${formatLabel}
Direction mode: ${directionGuide}`
        }
      ],
      max_tokens: 260
    });

    const rawPrompt = completion.choices[0].message.content?.trim();
    const prompt = rawPrompt || `Create a premium ${formatLabel} for: "${userInput}"
TITLE: ${userInput}
TYPOGRAPHY: oversized bold hero typography with strong color contrast, occupying 35-50% of frame
HERO: compelling subject specific to the topic
PROPS: topic-specific objects, entities, places, or symbols that prove the subject
COLOR GRADE: cinematic palette matched to the topic
DEPTH: FG topic-relevant object | MG main subject | BG environment
AVOID: generic AI template, random warning icons, random clocks, stock faces, clutter, tiny text, UI, watermarks`;
    if (!prompt) {
      return res.status(500).json({ error: 'No prompt returned. Try a different topic.' });
    }

    activityLog(req.session.user, 'suggest-prompt', { topic: userInput.slice(0, 80), directionMode });
    res.json({ prompt });
  } catch (err) {
    console.error('Suggest prompt error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ─── Generate thumbnail (OpenAI gpt-image-2) ────────────────────────────────
app.post('/api/v1/process', imageLimiter, async (req, res) => {
  try {
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API key not configured. Please set OPENAI_API_KEY in your .env file.' });
    }

    let { prompt, aspectRatio, quality } = req.body;

    // MOVE 4 — Prompt sanitization
    const sanitized = String(prompt || '')
      .replace(/<[^>]*>/g, '')   // strip HTML tags
      .trim()
      .slice(0, 1000);
    if (!sanitized) {
      return res.status(400).json({ error: 'Prompt is required.' });
    }

    // MOVE 2 — Aspect ratio validation
    const validRatios = ['16:9', '9:16'];
    if (!validRatios.includes(aspectRatio)) {
      return res.status(400).json({ error: 'Invalid aspect ratio.' });
    }

    // Quality tier mapping
    const qualityMap = {
      'low':      'low',
      'instant':  'low',
      'standard': 'medium',
      'medium':   'medium',
      'premium':  'high',
      'high':     'high'
    };
    const imageQuality = qualityMap[quality?.toLowerCase()] || 'medium';

    let size;
    if (aspectRatio === '9:16') size = '1024x1792';
    else                        size = '1792x1024';

    const formatLabel = formatLabelForRatio(aspectRatio);
    let directedPrompt = sanitized;

    if (imageQuality === 'high') {
      try {
        const premiumPrompt = await buildPremiumArtDirection(openaiClient, sanitized, aspectRatio);
        if (premiumPrompt) directedPrompt = premiumPrompt.slice(0, 1600);
      } catch (preflightErr) {
        console.warn('Premium art direction preflight failed:', preflightErr.message);
      }
    }

    const finalPrompt = `${directedPrompt}

${buildReferenceSuffix(formatLabel)}`;

    let result;
    if (req.body.presenterImage) {
      const base64Data  = req.body.presenterImage.replace(/^data:image\/[^;]+;base64,/, '');
      const imageBuffer = Buffer.from(base64Data, 'base64');
      const imageFile   = await toFile(imageBuffer, 'presenter.png', { type: 'image/png' });
      result = await openaiClient.images.edit({
        model:  'gpt-image-2',
        image:  imageFile,
        prompt: finalPrompt,
        size,
        n:      1
      });
    } else {
      result = await openaiClient.images.generate({
        model:   'gpt-image-2',
        prompt:  finalPrompt,
        n:       1,
        size,
        quality: imageQuality
      });
    }

    const imageData = result.data?.[0]?.b64_json;
    if (!imageData) {
      return res.status(500).json({ error: 'No image returned by OpenAI. Try a different prompt.' });
    }

    activityLog(req.session.user, 'generate', { ratio: aspectRatio, quality });
    return res.json({
      success:     true,
      imageData,
      mimeType:    'image/png',
      aspectRatio
    });
  } catch (err) {
    console.error('Generate error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ─── Face swap (OpenAI gpt-image-2) ───────────────────────────────────────────
app.post('/api/v1/transform', imageLimiter, async (req, res) => {
  try {
    if (!openaiClient) {
      return res.status(500).json({ error: 'OpenAI API key not configured.' });
    }

    const { targetDescription, faceImageBase64 } = req.body;
    if (!targetDescription || !faceImageBase64) {
      return res.status(400).json({ error: 'targetDescription and faceImageBase64 are required.' });
    }
    if (targetDescription.length > 500) {
      return res.status(400).json({ error: 'Description is too long.' });
    }

    const imageBuffer = Buffer.from(faceImageBase64, 'base64');
    const imageFile   = await toFile(imageBuffer, 'face.png', { type: 'image/png' });

    const prompt = `Create a YouTube thumbnail with this person's face: ${targetDescription}. Maintain the person's facial features exactly.`;

    const result = await openaiClient.images.edit({
      model:  'gpt-image-2',
      image:  imageFile,
      prompt,
      n:      1
    });

    const imageData = result.data?.[0]?.b64_json;
    if (!imageData) {
      return res.status(500).json({ error: 'No image returned by OpenAI.' });
    }

    activityLog(req.session.user, 'faceswap', {});
    return res.json({ success: true, imageData, mimeType: 'image/png' });
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
    if (!OPENAI_API_KEY) {
      console.warn('⚠️  WARNING: OPENAI_API_KEY is not set in .env — image generation will fail.\n');
    } else {
      console.log('✅ OpenAI API key loaded.');
    }
    if (!GEMINI_API_KEY) {
      console.warn('⚠️  WARNING: GEMINI_API_KEY is not set in .env — face swap and prompt suggestions will fail.\n');
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
