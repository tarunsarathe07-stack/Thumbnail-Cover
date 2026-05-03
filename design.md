# ThumbAI Design System

## CSS Variables (`styles.css :root`)

| Variable     | Value                          | Usage                        |
|--------------|--------------------------------|------------------------------|
| `--bg`       | `#fafafa`                      | Page background              |
| `--white`    | `#ffffff`                      | Card surfaces                |
| `--text`     | `#0a0a0a`                      | Primary text                 |
| `--muted`    | `#6b7280`                      | Secondary / label text       |
| `--light`    | `#9ca3af`                      | Placeholder text             |
| `--border`   | `#e5e7eb`                      | Borders, dividers            |
| `--dark`     | `#121212`                      | Navbar, primary buttons      |
| `--gold`     | `#C8962E`                      | Accent, quality dots, CTA    |
| `--r-pill`   | `999px`                        | Pill border-radius           |
| `--r-lg`     | `24px`                         | Large cards                  |
| `--r`        | `16px`                         | Standard cards               |
| `--r-sm`     | `10px`                         | Small elements               |
| `--shadow`   | `0 4px 24px rgba(0,0,0,.07)`   | Card shadows                 |
| `--shadow-md`| `0 8px 40px rgba(0,0,0,.12)`   | Elevated cards               |
| `--t`        | `.2s ease`                     | Default transition           |

## Additional Colours (not in variables)

| Colour          | Hex / Value                                                      | Where used                          |
|-----------------|------------------------------------------------------------------|-------------------------------------|
| Hero eyebrow    | `#f5c842`                                                        | `.hero-eyebrow` text                |
| Hero bg fallback| `#0d0d14`                                                        | `.hero-bg` background-color         |
| Lime card       | `#e7f7c8`                                                        | `.fc-lime` feature card             |
| Peach card      | `#ffe2d3`                                                        | `.fc-peach` feature card            |
| Lavender card   | `#e8e1f7`                                                        | `.fc-lavender` feature card         |
| Blue card       | `#e1ecf7`                                                        | `.fc-blue` feature card             |
| Error text      | `#ef4444`                                                        | `.msg-error`                        |
| Success text    | `#16a34a`                                                        | `.msg-success`, done badge          |
| Done badge bg   | `#dcfce7`                                                        | `.done-badge`                       |
| Done badge border| `#bbf7d0`                                                       | `.done-badge`                       |
| Liked btn bg    | `#dcfce7` / text `#15803d`                                       | `.rating-btn.liked`                 |
| Disliked btn bg | `#fee2e2` / text `#dc2626`                                       | `.rating-btn.disliked`              |
| Quality selected| border `#C8962E` / bg `#fffbf5`                                  | Quality label inline style          |
| YT badge        | `#FF0000`                                                        | `.ratio-badge-yt`                   |
| Reels badge     | gradient `#f09433 → #e6683c → #dc2743 → #cc2366 → #bc1888`      | `.ratio-badge-reels`                |
| Loading overlay | `rgba(0,0,0,0.88)`                                               | `#loadingOverlay` inline style      |
| Gold dot pulse  | `#C8962E`                                                        | `.dot` (loading animation)          |

## Typography

- **Font family:** `Inter` (Google Fonts), weights 400 500 600 700 800; fallback `system-ui, -apple-system, sans-serif`
- **Hero title:** `clamp(2.8rem, 5vw, 5rem)`, weight 800, letter-spacing `-.04em`, line-height 1.04
- **Page heading** (`.page-heading`): `1.7rem`, weight 800, letter-spacing `-.025em`
- **Result title** (`.result-title`): `2.2rem`, weight 800, letter-spacing `-.03em`
- **Nav logo:** `0.92rem`, weight 700
- **Card label** (`.gen-card-label`): `0.72rem`, weight 700, uppercase, letter-spacing `.08em`
- **Body / prompt:** `0.93rem`, line-height 1.7
- **Muted / sub text:** `0.86–0.92rem`, color `--muted`

## Component Classes

### Navigation
- `.nav` — fixed, centered pill, `#121212` bg, `border-radius: 999px`, top 20px
- `.nav-logo` — white, weight 700
- `.nav-credits` — pill badge, `rgba(255,255,255,.13)` bg with border
- `.nav-btn` — white pill button, dark text

### Buttons
- `.btn-primary` — `#121212` bg, white text, pill, hover lifts `translateY(-1px)`
- `.btn-secondary` — transparent bg, `1.5px solid #121212`, pill
- `.btn-ghost-white` — `rgba(255,255,255,.14)` bg, white text/border (dark backgrounds only)
- `.btn-full` — `width: 100%`
- `.btn-lg` — `padding: 16px 36px; font-size: 1.05rem`
- `.btn-sm` — `padding: 8px 18px; font-size: .82rem`
- `.btn-suggest` — small pill, muted, used for "✦ Enhance My Prompt"

### Forms
- `.form-input-glass` — for login card: `rgba(255,255,255,.12)` bg, white border/text
- `.form-input-light` — for generator: white bg, `--border` border, dark text
- `.prompt-textarea` — `#fafafa` bg, `1.5px solid --border`, min-height 130px

### Cards
- `.gen-card` — white bg, `1px solid --border`, `border-radius: 24px`, `box-shadow: --shadow`
- `.login-card` — glassmorphism: `rgba(255,255,255,.13)` bg, `backdrop-filter: blur(30px)`, `border-radius: 20px`
- `.feature-card` — pastel bg, `border-radius: 20px`

### Selectors
- `.ratio-card` — white bg, `2px solid --border`; `.selected` → `border-color: #0a0a0a`
- `.ratio-badge-yt` — red `#FF0000` pill badge
- `.ratio-badge-reels` — Instagram gradient badge
- `.quality-dots` — `#C8962E`, font-size 10px, letter-spacing 2px (used for ●○○ / ●●○ / ●●●)
- Quality label selected state: `border: 1.5px solid #C8962E; background: #fffbf5` (inline styles)

### Generator Tabs
- `.gen-tabs` — white bg pill container, `border-radius: 12px`
- `.gen-tab` — `border-radius: 9px`; `.active` → `#121212` bg, white text

### Loading
- `#loadingOverlay` — `rgba(0,0,0,0.88)` fixed overlay, 3 × `.dot` pulse animation in `#C8962E`
- Progress bar: `#C8962E` fill on `rgba(255,255,255,0.08)` track

### Result Page
- `.img-frame` — white card, `aspect-ratio: 16/9`; `.portrait` → `aspect-ratio: 9/16`, max-width 340px
- `.variation` — `aspect-ratio: 16/9`, `opacity: .55`; first-child → `border-color: #0a0a0a; opacity: 1`
- `.rating-btn.liked` → green; `.rating-btn.disliked` → red
- `.done-badge` — green pill, uppercase, letter-spaced

### Upload Zone
- `.upload-zone` — `2px dashed --border`; `.has-file` → solid `#22c55e` border, `#f0fdf4` bg

### Animations
- `.animate-in` — `fadeUp .65s ease both` (fires on page load)
- `.fade-up` → `.fade-up.visible` — scroll-triggered, `opacity + translateY` transition
- `.spinner` — `spin .7s linear infinite`

## Pages

### `login.html`
- Theme: **dark** (theatre hero)
- Background: `/assets/theatre.jpeg` with `linear-gradient(to right, rgba(0,0,0,.78) → rgba(0,0,0,.42))` overlay; `background-attachment: fixed`
- Layout: two-column (`hero-left` headline + `hero-right` login card), stacks to single column at ≤960px
- Sections: fixed nav → hero → `.features` (white bg, 4-column pastel cards) → footer
- Login card: glassmorphism `.login-card`, glass inputs `.form-input-glass`
- CTA button: inline override `background:#C8962E; color:#000`
- No OAuth buttons, no nav links

### `generator.html`
- Theme: **light** (`#fafafa`)
- Layout: single-column, max-width 780px, centered
- Tabs: `.gen-tabs` switcher — "⚡ AI Generate" / "◉ Face Swap"
- AI Generate panel: prompt card → aspect ratio card (2-column grid) → quality card → generate button
- Face Swap panel: upload thumbnail → upload face → swap button
- Quality tiers: Draft (`low`, 1 credit, 20–30s) / Standard (`medium`, 1 credit, ~1 min) / Premium (`high`, 2 credits, ~2 min)
- Loading: dark overlay `rgba(0,0,0,0.88)` with gold dots + progress bar
- Keyboard shortcut: `Ctrl+Enter` triggers generate

### `result.html`
- Theme: **light** (`#fafafa`)
- Layout: single-column, max-width 780px
- Sections: done badge → title → image frame → variation row (×4) → action buttons → credit line → rating → prompt card
- Image frame defaults to `16:9`; switches to `.portrait` (`9:16`) based on `result.aspectRatio`
- Download filename: `thumbai-YYYY-MM-DD-HHMM.png/jpg`

## Assets

- **Hero background:** `/assets/theatre.jpeg`
- **Favicon:** inline data-URI SVG, ⚡ emoji at 90px (all three pages)
- **No external icon library** — icons are Unicode/emoji characters inline

## Current Issues

- Generator is light theme while landing page is dark — jarring transition between pages
- Pastel feature cards on white background immediately below the dark hero — abrupt contrast change
- Loading overlay on generator is `rgba(0,0,0,0.88)` dark while the rest of the page is light
- Quality selector and loading overlay use inline styles instead of CSS classes
- `.login-divider` and `.social-btns` / `.btn-social` classes exist in CSS but are unused in current HTML
- No split workspace layout on generator (single narrow column, lots of scrolling)
