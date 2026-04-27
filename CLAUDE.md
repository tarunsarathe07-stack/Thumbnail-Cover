# CLAUDE.md — AI Thumbnail Generator

This file documents the codebase structure, development workflows, and conventions for AI assistants working in this repository.

---

## Project Overview

**AI Thumbnail Generator** is a full-stack web application that generates YouTube/Instagram thumbnails using Google Gemini's image generation API. It supports AI face-swapping, prompt assistance, and a client-side gallery.

- **Runtime:** Node.js + Express.js backend, vanilla JS frontend (no build step)
- **Primary AI API:** Google Gemini (`gemini-3-pro-image-preview`, fallback to `gemini-2.0-flash-exp-image-generation`)
- **Secondary AI API:** OpenRouter (optional, for prompt suggestions)
- **Auth:** Single-user session-based authentication (credentials stored in `.env`)
- **Storage:** No database — gallery stored in browser localStorage; logs written to `logs/`

---

## Repository Structure

```
Thumbnail-Cover/
├── public/                  # All frontend assets (served statically after auth)
│   ├── index.html           # Main SPA (~330 lines)
│   ├── login.html           # Login page with inline styles (~315 lines)
│   ├── app.js               # All frontend logic — vanilla JS (~900 lines)
│   ├── style.css            # Global CSS — glassmorphism design system (~750+ lines)
│   └── presets/             # SVG face presets for face-swap feature
│       ├── alex.svg
│       ├── priya.svg
│       ├── raj.svg
│       └── sam.svg
├── server.js                # Express server — all routes, auth, API calls (~575 lines)
├── activity-logger.js       # Logs user actions to logs/activity.log
├── package.json             # npm deps & scripts
├── THUMBNAIL_DESIGN_REVIEW.md  # Brand/design guidelines for thumbnail prompts
└── .gitignore
```

**Not in repo (gitignored):**
- `.env` — Required secrets (see Environment Variables below)
- `node_modules/`
- `logs/` — Activity log output directory
- `uploads/` — Multer temp dir (memory storage used; this dir is a safety fallback)

---

## Getting Started

### Prerequisites
- Node.js 18+
- npm

### Installation
```bash
npm install
```

### Environment Setup
Create a `.env` file in the project root:

```env
# Required
SESSION_SECRET=your-long-random-secret
GEMINI_API_KEY=your-google-gemini-api-key
LOGIN_USER=your-username
LOGIN_PASS=your-password

# Optional
PORT=3000
NODE_ENV=production          # Enables secure cookies
APP_URL=http://localhost:3000  # Used as OpenRouter HTTP-Referer

# Optional: OpenRouter for prompt suggestions
_0xOK=your-openrouter-api-key
_0xOM=openai/gpt-oss-20b    # OpenRouter model ID
```

> `SESSION_SECRET` is **required** — the server will throw a fatal error on startup if missing.

### Running

```bash
npm start       # Production (node server.js)
npm run dev     # Development with auto-reload (nodemon)
```

The app runs on `http://localhost:3000` (or `PORT` env var).

---

## Architecture

### Backend (`server.js`)

Single Express file. Middleware order matters:

```
express.json() → express-session → auth wall → express.static('public') → API routes
```

**Route groups:**

| Route | Auth Required | Purpose |
|-------|--------------|---------|
| `GET /login` | No | Serve login page |
| `POST /api/login` | No | Authenticate (rate-limited: 10 req/15min) |
| `POST /api/logout` | No | Destroy session |
| `GET /api/health` | No | Check API key status |
| `GET /` | Yes | Serve SPA (`public/index.html`) |
| `GET /api/me` | Yes | Return current username |
| `GET /api/presets` | Yes | List SVG files from `public/presets/` |
| `POST /api/generate` | Yes | Generate thumbnail (rate-limited: 5 req/min) |
| `POST /api/suggest-prompt` | Yes | Suggest prompts (rate-limited: 15 req/min) |
| `POST /api/faceswap` | Yes | AI face swap |

**AI model strategy:**
- Image generation: tries `gemini-3-pro-image-preview` first, falls back to `gemini-2.0-flash-exp-image-generation`
- Text/prompts: uses `gemini-2.5-flash` (or OpenRouter if `_0xOK` is set)
- Face swap: uses primary Gemini image model

**Image handling:**
- Uploaded files: multer memory storage (never written to disk)
- API responses: base64-encoded image data returned in JSON
- File size limit: 10 MB
- Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `image/svg+xml`

### Frontend (`public/app.js`)

Pure vanilla JavaScript. No framework, no build step.

**State object:**
```js
const state = {
  generatedImage: null,     // base64 data URL of current generated image
  generatedMimeType: null,  // MIME type of generated image
  faceSwapSource: null,     // File object for face swap source
  faceSwapTarget: null,     // File object for face swap target
  gallery: []               // Array of gallery items (also in localStorage)
};
```

**DOM helper:**
```js
const $ = id => document.getElementById(id);
```

**Key sections:**
1. **Generator** — textarea prompt → aspect ratio select → `/api/generate` → display + download
2. **Face Swap** — preset or upload (source + target) → `/api/faceswap` → before/after view
3. **Gallery** — localStorage-backed, max 50 items, base64 stored client-side only
4. **FAB (Floating Action Button)** — Chat-style prompt assistant calling `/api/suggest-prompt`

**Canvas text overlay:**
`applyTextOverlays()` uses the Canvas API to render text on images. Supports legacy format (array of `{text, x, y, fontSize, color}`) and the standard format. Uses `fitFontSize()` + `wrapText()` helpers.

---

## Key Conventions

### Naming
- **JS variables/functions:** camelCase (`generateImageData`, `swapBtn`)
- **JS constants:** UPPER_SNAKE_CASE for globals (`GALLERY_KEY`, `BRAND_KB`, `MAX_GALLERY`), camelCase for locals
- **CSS classes:** kebab-case (`generator-card`, `fab-panel`, `ps-grid`)
- **API routes:** lowercase `/api/<verb-or-noun>`

### Code Patterns

**Backend — async route handler:**
```js
app.post('/api/generate', requireAuth, generateLimiter, async (req, res) => {
  try {
    // ... validate input
    // ... call external API
    res.json({ success: true, imageData: base64, mimeType: '...' });
  } catch (err) {
    console.error('Generate error:', err.message);
    res.status(500).json({ error: 'Generation failed' });
  }
});
```

**Frontend — fetch pattern:**
```js
const res = await fetch('/api/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ prompt, aspectRatio })
});
const data = await res.json();
if (!res.ok) throw new Error(data.error || 'Request failed');
```

**XSS prevention:** Always use `escapeHtml()` when inserting user-controlled strings into HTML.

**Error display:** Use `showError(elementId, message)` to display errors in the `.error-box` divs. Use `showToast(message, type)` for transient notifications.

### HTML Conventions
- Sections start with `.section-header` containing `.section-badge`, `h2`, and `.section-subtitle`
- Form inputs use `.form-group` > `label` + `input/textarea` structure
- Buttons follow `.btn-primary` / `.btn-outline` / `.btn-success` classes
- Elements are shown/hidden with the `[hidden]` attribute (not `display:none` in JS)
- Loading states use `.loading-spinner` within result areas

### CSS Conventions
- Colors defined as CSS custom properties in `:root`
- Glassmorphism surfaces: `background: rgba(255,245,250,0.035)` + `backdrop-filter: blur(...)`
- All animations defined with `@keyframes` (fadeSlideUp, spin, pulse, blink)
- Responsive layout: CSS Grid with `auto-fit` / `minmax` columns

---

## Security Model

| Concern | Implementation |
|---------|---------------|
| Auth | `express-session` with httpOnly, SameSite=lax cookies; `requireAuth` middleware on all protected routes |
| Rate limiting | `express-rate-limit` — separate limiters for login (10/15min), generation (5/min), prompts (15/min) |
| File uploads | Multer validates MIME type; memory storage only (no disk writes) |
| XSS | `escapeHtml()` used before any DOM innerHTML insertion |
| Input validation | Manual length checks on all user inputs before passing to external APIs |
| Secrets | All credentials in `.env`, never committed |

---

## Activity Logging

`activity-logger.js` exports `logActivity(username, action, details)`:
- Writes to `logs/activity.log` (directory auto-created)
- Format: `[ISO_TIMESTAMP] user:USERNAME action:ACTION {"key":"value"}`
- Logged actions: `login`, `login-failed`, `logout`, `generate`, `faceswap`, `suggest-prompt`

---

## Brand Knowledge Base

The `BRAND_KB` constant in `server.js` is embedded brand/style knowledge injected into every Gemini prompt. It enforces:
- High-contrast bold typography
- Cinematic quality
- Platform-appropriate aspect ratios (16:9 for YouTube, 9:16 for Reels/Shorts)

See `THUMBNAIL_DESIGN_REVIEW.md` for comprehensive design guidelines including font recommendations, text placement zones, color systems, and example prompts.

---

## Development Notes

- **No build step:** Edit files directly; refresh browser. No compilation required.
- **No tests:** There is no automated test suite. Test manually via the browser UI.
- **Single-user only:** One set of credentials in `.env`. Not designed for multi-user at scale.
- **Client-side gallery:** Images never leave the browser. Clearing localStorage or switching browsers loses all gallery items.
- **Gemini model names:** These change frequently. Check Google AI docs if generation fails with model-not-found errors.
- **OpenRouter fallback:** If `_0xOK` is not set, prompt suggestions fall back to Gemini text. The `_0xOM` variable sets the model; it defaults to the value in `server.js` if unset.

---

## Common Tasks

### Add a new preset face
1. Create an SVG file in `public/presets/`
2. No code changes needed — `/api/presets` reads the directory dynamically

### Add a new API route
1. Define the route in `server.js` after the auth middleware block
2. Protected routes must include `requireAuth` as middleware
3. Add rate limiting if the route calls an external API
4. Log the action with `logActivity()` if it's a significant user action

### Change AI models
- Edit the model name strings near the top of `server.js` (search for `gemini-` to find them)
- Primary image model: `gemini-3-pro-image-preview`
- Fallback image model: `gemini-2.0-flash-exp-image-generation`
- Text model: `gemini-2.5-flash`

### Modify the brand prompt
- Edit the `BRAND_KB` constant in `server.js`
- This is injected into every image generation and face-swap prompt

### Update the design system
- CSS custom properties (colors, spacing) are in the `:root` block at the top of `public/style.css`
- Component styles follow the same file without any component isolation
