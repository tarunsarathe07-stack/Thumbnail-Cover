require('dotenv').config();
const express  = require('express');
const multer   = require('multer');
const fetch    = require('node-fetch');
const path     = require('path');
const fs       = require('fs');
const OpenAI   = require('openai');
const { toFile } = require('openai');
const session  = require('cookie-session');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
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

// ─── Session-based generation rate limiter (in-memory) ────────────────────────
const sessionGenCounts = new Map(); // key: username → { count, resetAt }
const SESSION_GEN_LIMIT  = 10;
const SESSION_GEN_WINDOW = 60 * 60 * 1000; // 1 hour

function checkSessionRateLimit(username) {
  const now    = Date.now();
  const record = sessionGenCounts.get(username);
  if (!record || now > record.resetAt) {
    sessionGenCounts.set(username, { count: 1, resetAt: now + SESSION_GEN_WINDOW });
    return true;
  }
  if (record.count >= SESSION_GEN_LIMIT) return false;
  record.count++;
  return true;
}

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
    req.session.credits  = req.session.credits ?? 120;
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
  res.json({
    user:    req.session.user || 'User',
    credits: req.session.credits ?? 120
  });
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
    const { topic, category } = req.body;
    const userInput = (topic || category || '').trim();
    if (!userInput) {
      return res.status(400).json({ error: 'Topic or category is required.' });
    }
    if (userInput.length > 500) {
      return res.status(400).json({ error: 'Topic is too long.' });
    }

    const completion = await openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a YouTube thumbnail strategist. Convert the user's topic into a visual image prompt engineered for maximum click-through rate.

RULE 1 — TOPIC PRESERVATION (most important):
Never replace, rename, or substitute the user's topic.
Use the exact subject, named entities, and event from the input.
"Supreme Court strikes down reservation" → output must feature the Supreme Court and reservation policy — not a generic judge or activist.
"UAE leaves OPEC" → output must reference UAE and OPEC visually.
"CLAT 2026 last 30 days" → output must feature a CLAT student, not a generic student.
Build the visual around the actual topic. Never invent a substitute narrative.

RULE 2 — FACE DOMINANCE:
Include a human face showing extreme emotion matching the topic sentiment.
Shock, disbelief, fear, excitement — pick the one that fits.
Close-up framing, face fills 50%+ of the left side of the frame.

RULE 3 — CONTRAST & POP:
Vivid complementary colours. Subject pops against background.
High contrast. No muddy or flat tones.

RULE 4 — CURIOSITY GAP:
One unexpected or unresolved visual element that makes the viewer ask "what happened?"

RULE 5 — TEXT PLACEMENT ZONE:
Reserve the right third of the frame as clear negative space for title text overlay.
Always end with: 'clear text space right third'.

RULE 6 — DEPTH & DRAMA:
Cinematic depth-of-field, rim lighting, or volumetric light rays.
Never flat lighting.

RULE 7 — SIMPLICITY:
One hero subject. One background. Maximum two supporting elements.

OUTPUT FORMAT:
Comma-separated visual phrases only. No sentences. No markdown. No explanation.
Structure: [hero subject + emotion tied to actual topic], [environment matching topic],
[lighting], [camera angle], [colour palette], [text placement], [typography style]
Maximum 90 words.

TYPOGRAPHY — append exactly one:
- News/politics/current affairs → 'distressed grunge bold typography, breaking news style'
- Education/exam/CLAT/study → 'clean bold sans-serif, academic poster style'
- Legal/court/justice/Supreme Court → 'newspaper headline bold, official document style'
- Conflict/war/drama → 'movie poster epic lettering, metallic embossed'
- Finance/business/economy/OPEC → 'sleek modern sans-serif, Forbes magazine style'
- Default → 'bold high-contrast modern typography'

NEVER include: bullet points, lists, watermarks, YouTube UI elements, play buttons.
One powerful visual concept only.`
        },
        { role: 'user', content: userInput }
      ],
      max_tokens: 120
    });

    const rawPrompt = completion.choices[0].message.content?.trim();
    const prompt = `Title: ${userInput}\n\n${rawPrompt}`;
    if (!prompt) {
      return res.status(500).json({ error: 'No prompt returned. Try a different topic.' });
    }

    activityLog(req.session.user, 'suggest-prompt', { topic: userInput.slice(0, 80) });
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

    // MOVE 5 — Session-level rate limit
    if (!checkSessionRateLimit(req.session.user)) {
      return res.status(429).json({ error: 'Too many requests. Please wait before generating again.' });
    }

    // MOVE 1 — Credit check
    const currentCredits = req.session.credits ?? 120;
    if (currentCredits <= 0) {
      return res.status(402).json({ error: 'No credits remaining.' });
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

    // MOVE 3 — Quality validation
    const validQualities = ['low', 'medium', 'high'];
    if (!validQualities.includes(quality)) quality = 'medium';

    let size;
    if (aspectRatio === '9:16') size = '1024x1792';
    else                        size = '1792x1024';

    const finalPrompt = `${sanitized},
cinematic composition, dramatic lighting,
bold integrated title text,
professional YouTube thumbnail,
ultra realistic, high contrast,
no watermarks, no bullet points,
no checklists, no text lists`;

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
        quality
      });
    }

    const imageData = result.data?.[0]?.b64_json;
    if (!imageData) {
      return res.status(500).json({ error: 'No image returned by OpenAI. Try a different prompt.' });
    }

    // MOVE 1 — Deduct credits after success
    const cost = quality === 'high' ? 2 : 1;
    req.session.credits = Math.max(0, currentCredits - cost);

    activityLog(req.session.user, 'generate', { ratio: aspectRatio, quality, creditsLeft: req.session.credits });
    return res.json({
      success:         true,
      imageData,
      mimeType:        'image/png',
      aspectRatio,
      creditsRemaining: req.session.credits
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
