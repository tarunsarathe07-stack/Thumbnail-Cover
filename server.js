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

// OpenAI — used by /api/generate
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
// Initialise lazily so the server starts cleanly even without the key set
const openaiClient   = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

// Gemini — used by /api/faceswap and /api/suggest-prompt
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

// ─── Suggest prompt (OpenAI gpt-4o-mini) ──────────────────────────────────────
app.post('/api/suggest-prompt', promptLimiter, async (req, res) => {
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
          content: `Convert the user's topic into a YouTube thumbnail image prompt.
Return comma-separated visual phrases only. Format:
[subject], [emotion], [environment], [lighting], [camera], [composition].
Maximum 80 words. No sentences. No markdown. No explanation.

Based on the topic type, append ONE font style descriptor:
- News/politics: add 'distressed grunge bold typography'
- Education/exam: add 'clean bold sans-serif typography'
- Legal/court: add 'newspaper headline bold typography'
- Dramatic/conflict: add 'movie poster epic title lettering'
- General: add 'bold high contrast typography'

Include this at the end of the generated prompt.`
        },
        { role: 'user', content: userInput }
      ],
      max_tokens: 120
    });

    const prompt = completion.choices[0].message.content?.trim();
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
app.post('/api/generate', imageLimiter, async (req, res) => {
  try {
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API key not configured. Please set OPENAI_API_KEY in your .env file.' });
    }

    const { prompt, aspectRatio } = req.body;
    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: 'Prompt is required.' });
    }
    if (prompt.length > 2000) {
      return res.status(400).json({ error: 'Prompt exceeds maximum length of 2000 characters.' });
    }

    const userPrompt = prompt.trim();
    let size;
    if (aspectRatio === '9:16')      size = '1024x1792';
    else if (aspectRatio === '16:9') size = '1792x1024';
    else                             size = '1024x1024';

    const finalPrompt = `${userPrompt},
bold integrated title text, professional YouTube thumbnail,
ultra realistic, high contrast, no watermarks`;

    const result = await openaiClient.images.generate({
      model:   'gpt-image-2',
      prompt:  finalPrompt,
      n:       1,
      size,
      quality: 'high'
    });

    const imageData = result.data?.[0]?.b64_json;
    if (!imageData) {
      return res.status(500).json({ error: 'No image returned by OpenAI. Try a different prompt.' });
    }

    activityLog(req.session.user, 'generate', { ratio: aspectRatio });
    return res.json({
      success:    true,
      imageData,
      mimeType:   'image/png',
      aspectRatio
    });
  } catch (err) {
    console.error('Generate error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ─── Face swap (OpenAI gpt-image-2) ───────────────────────────────────────────
app.post('/api/faceswap', imageLimiter, async (req, res) => {
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
