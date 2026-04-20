/* ═══════════════════════════════════════════════════════
   AI Thumbnail Generator – Frontend Logic
═══════════════════════════════════════════════════════ */

'use strict';

// ── State ────────────────────────────────────────────
const state = {
  generateImageData: null,
  generateMimeType:  'image/png',
  generateRatio:     '16:9',
  swapImageData:     null,
  swapMimeType:      'image/png',
  sourceFile:        null,
  targetFile:        null,
  // Text overlay values (set via FAB "Use This")
  overlayTitle:    '',
  overlayHook:     '',
  overlaySubtitle: '',
};

// ── DOM refs ─────────────────────────────────────────
const $ = id => document.getElementById(id);

const promptInput    = $('promptInput');
const charCount      = $('charCount');
const generateBtn    = $('generateBtn');
const regenerateBtn  = $('regenerateBtn');
const downloadBtn    = $('downloadBtn');
const generateResult = $('generateResult');
const generateLoading= $('generateLoading');
const generateError  = $('generateError');
const generateImage  = $('generateImage');
const generateImageWrap = $('generateImageWrap');

const sourceInput    = $('sourceInput');
const targetInput    = $('targetInput');
const sourcePreview  = $('sourcePreview');
const targetPreview  = $('targetPreview');
const sourceImg      = $('sourceImg');
const targetImg      = $('targetImg');
const sourceSlot     = $('sourceSlot');
const targetSlot     = $('targetSlot');
const swapPrompt     = $('swapPrompt');
const swapBtn        = $('swapBtn');
const swapResult     = $('swapResult');
const swapLoading    = $('swapLoading');
const swapError      = $('swapError');
const swapImage      = $('swapImage');
const swapDownloadBtn  = $('swapDownloadBtn');
const compareOriginal  = $('compareOriginal');
const apiStatus        = $('apiStatus');
const userNavName      = $('userNavName');

// ── User nav: show logged-in username ─────────────────
async function initUserNav() {
  try {
    const res  = await fetch('/api/me', { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();
    if (userNavName && data.user) userNavName.textContent = data.user;
  } catch { /* silently ignore */ }
}
initUserNav();

// ── Logout (POST to prevent CSRF) ────────────────────
const logoutBtn = $('logoutBtn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    try { await fetch('/api/logout', { method: 'POST', credentials: 'include' }); } catch {}
    window.location.replace('/login');
  });
}

// ── Person selector: preset educator faces ────────────
async function initPersonSelector() {
  const psGrid = $('psGrid');
  if (!psGrid) return;
  try {
    const res  = await fetch('/api/presets', { credentials: 'include' });
    const data = await res.json();
    if (!data.presets?.length) {
      psGrid.innerHTML = '<span class="ps-empty">No presets yet — add images to <code>public/presets/</code></span>';
      return;
    }
    psGrid.innerHTML = data.presets.map(p => `
      <button type="button" class="ps-card" data-url="${escapeHtml(p.url)}" data-name="${escapeHtml(p.name)}">
        <img src="${escapeHtml(p.url)}" alt="${escapeHtml(p.name)}" />
        <span class="ps-card-name">${escapeHtml(p.name)}</span>
      </button>
    `).join('');
    psGrid.querySelectorAll('.ps-card').forEach(card => {
      card.addEventListener('click', () => selectPreset(card));
    });
  } catch {
    psGrid.innerHTML = '<span class="ps-empty">Could not load presets.</span>';
  }
}

async function selectPreset(card) {
  const url  = card.dataset.url;
  const name = card.dataset.name;
  document.querySelectorAll('.ps-card').forEach(c => c.classList.remove('selected'));
  card.classList.add('selected');
  try {
    const res  = await fetch(url);
    const blob = await res.blob();
    const ext  = url.split('.').pop().toLowerCase();
    const mime = blob.type || (ext === 'svg' ? 'image/svg+xml' : `image/${ext}`);
    const file = new File([blob], `preset-${name}.${ext}`, { type: mime });
    state.sourceFile = file;
    loadPreview(file, sourceImg, sourcePreview, sourceSlot.querySelector('.upload-label'));
    showToast(`✓ "${name}" selected as source face`);
  } catch {
    showToast('Could not load preset. Try uploading manually.', 'warn');
  }
}
initPersonSelector();

// ── API health check ─────────────────────────────────
async function checkApiHealth() {
  try {
    const res  = await fetch('/api/health', { credentials: 'include' });
    const data = await res.json();
    const statusLabel = apiStatus.querySelector('.status-label');
    if (data.keyConfigured) {
      apiStatus.className = 'api-status ok';
      statusLabel.textContent = 'API Ready';
    } else {
      apiStatus.className = 'api-status error';
      statusLabel.textContent = 'API Key Missing';
    }
  } catch {
    apiStatus.className = 'api-status error';
    apiStatus.querySelector('.status-label').textContent = 'Server Offline';
  }
}
checkApiHealth();

// ── Char counter + auto-resize ────────────────────────
promptInput.addEventListener('input', () => {
  const len = promptInput.value.length;
  charCount.textContent = `${len} / 2000`;
  if (len > 1800) charCount.style.color = '#f97316';
  else if (len > 1600) charCount.style.color = '#eab308';
  else charCount.style.color = '';
  if (len > 2000) promptInput.value = promptInput.value.slice(0, 2000);
  autoResize(promptInput);
});

// ── Aspect ratio toggle ───────────────────────────────
document.querySelectorAll('.ratio-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.ratio-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    card.querySelector('input[type=radio]').checked = true;
    state.generateRatio = card.dataset.ratio;
    if (generateImageWrap) generateImageWrap.dataset.ratio = state.generateRatio;
  });
});

// ── Helpers ───────────────────────────────────────────
function showEl(el) { el.removeAttribute('hidden'); }
function hideEl(el) { el.setAttribute('hidden', ''); }

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

function showError(el, msg) { el.textContent = msg; showEl(el); }
function clearError(el)     { el.textContent = '';   hideEl(el); }

function downloadImage(base64Data, mimeType, filename) {
  const link    = document.createElement('a');
  link.href     = `data:${mimeType};base64,${base64Data}`;
  link.download = filename;
  link.click();
}

function getSelectedRatio() {
  const checked = document.querySelector('input[name="aspectRatio"]:checked');
  return checked ? checked.value : '16:9';
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatTime(ts) {
  if (!ts) return '';
  const diffMin = Math.floor((Date.now() - ts) / 60000);
  if (diffMin < 1)  return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr  < 24) return `${diffHr}h ago`;
  return new Date(ts).toLocaleDateString();
}

function updateCharCount(input, countEl, max) {
  const len = input.length;
  countEl.textContent = `${len} / ${max}`;
  countEl.style.color = len > max * 0.9 ? '#f97316' : len > max * 0.8 ? '#eab308' : '';
}

// (Template Library removed)

// (Prompt Generator panel removed — prompts generated via FAB ✨)

// ── Text overlay helpers ──────────────────────────────
function extractScenePart(prompt) {
  // New format: strip "; OVERLAY: ..." onwards
  let m = prompt.match(/^(.*?)\s*;\s*OVERLAY:/is);
  if (m) return m[1].trim();
  // Legacy: strip "; top of the frame..." onwards
  m = prompt.match(/^(.*?)\s*;\s*top of (?:the )?frame/is);
  return m ? m[1].trim() : prompt.trim();
}

function extractOverlays(prompt) {
  // New format: OVERLAY: "TEXT"
  const overlayMatch = prompt.match(/OVERLAY:\s*"([^"]+)"/i);
  if (overlayMatch) {
    return { title: '', hook: overlayMatch[1].trim(), subtitle: '' };
  }

  // Legacy: semicolon-separated title/hook/subtitle format
  const parts = prompt.split(/\s*;\s*/);
  let title = '', hook = '', subtitle = '';

  for (const part of parts) {
    const lower  = part.toLowerCase();
    const quoted = part.match(/"([^"]+)"/);
    if (!quoted) continue;
    const text = quoted[1].trim();

    if (!title && (lower.includes('top') ||
        (lower.includes('white') && (lower.includes('caps') || lower.includes('bold'))))) {
      title = text;
    } else if (!hook && (lower.includes('centre') || lower.includes('center') ||
        lower.includes('golden') || lower.includes('yellow') || lower.includes('hook'))) {
      hook = text;
    } else if (!subtitle && (lower.includes('banner') || lower.includes('bottom'))) {
      subtitle = text;
    }
  }

  return { title, hook, subtitle };
}

function fillOverlaysFromPrompt(prompt) {
  const { title, hook, subtitle } = extractOverlays(prompt);
  // Always set (including empty string) so stale values don't persist
  state.overlayTitle    = title    ? title.toUpperCase()    : '';
  state.overlayHook     = hook     ? hook.toUpperCase()     : '';
  state.overlaySubtitle = subtitle ? subtitle.toUpperCase() : '';
}

// Finds the largest font size where text fits within maxWidth
function fitFontSize(ctx, text, maxWidth, font, maxSz = 400) {
  for (let sz = maxSz; sz >= 12; sz -= 2) {
    ctx.font = `900 ${sz}px ${font}`;
    if (ctx.measureText(text).width <= maxWidth) return sz;
  }
  return 12;
}

// Word-wrap text into lines that fit within maxWidth
function wrapText(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let currentLine = words[0];
  for (let i = 1; i < words.length; i++) {
    const testLine = currentLine + ' ' + words[i];
    if (ctx.measureText(testLine).width <= maxWidth) {
      currentLine = testLine;
    } else {
      lines.push(currentLine);
      currentLine = words[i];
    }
  }
  lines.push(currentLine);
  return lines;
}

// Find font size where wrapped text fits in target line count
function fitWrappedFontSize(ctx, text, maxWidth, font, maxLines = 4, maxSz = 300) {
  for (let sz = maxSz; sz >= 20; sz -= 2) {
    ctx.font = `900 ${sz}px ${font}`;
    const lines = wrapText(ctx, text, maxWidth);
    if (lines.length <= maxLines) return sz;
  }
  return 20;
}

function applyTextOverlays(base64, mimeType, title, hook, subtitle) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx    = canvas.getContext('2d');
    const img    = new Image();
    img.onload = () => {
      canvas.width  = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      const W = canvas.width, H = canvas.height;
      const F = '"Arial Black", "Arial Bold", Arial, sans-serif';

      // ── LPT STYLE: single white text block (when only hook is set) ──
      if (hook && !title && !subtitle) {
        const maxW = W * 0.88;
        const sz   = fitWrappedFontSize(ctx, hook, maxW, F, 5, Math.round(W * 0.14));
        ctx.font   = `900 ${sz}px ${F}`;
        const lines = wrapText(ctx, hook, maxW);
        const lineH = sz * 1.12;
        const totalH = lines.length * lineH;
        // Position: bottom area, above 5% margin
        const startY = H - totalH - H * 0.04;

        ctx.save();
        ctx.font         = `900 ${sz}px ${F}`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'top';
        ctx.lineJoin     = 'round';
        lines.forEach((line, i) => {
          const y = startY + i * lineH;
          ctx.strokeStyle  = 'rgba(0,0,0,0.95)';
          ctx.lineWidth    = Math.round(sz * 0.14);
          ctx.shadowColor  = 'rgba(0,0,0,0.9)';
          ctx.shadowBlur   = Math.round(sz * 0.3);
          ctx.shadowOffsetY = Math.round(sz * 0.05);
          ctx.strokeText(line, W / 2, y);
          ctx.shadowColor  = 'transparent';
          ctx.fillStyle    = '#FFFFFF';
          ctx.fillText(line, W / 2, y);
        });
        ctx.restore();
        resolve(canvas.toDataURL('image/png'));
        return;
      }

      // ── LEGACY 3-ZONE STYLE ──────────────────────
      // TITLE: top, white
      if (title) {
        const sz = Math.min(fitFontSize(ctx, title, W * 0.84, F), Math.round(W * 0.115));
        ctx.save();
        ctx.font         = `900 ${sz}px ${F}`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'top';
        ctx.lineJoin     = 'round';
        ctx.strokeStyle  = 'rgba(0,0,0,0.95)';
        ctx.lineWidth    = Math.round(sz * 0.14);
        ctx.shadowColor  = 'rgba(0,0,0,0.85)';
        ctx.shadowBlur   = Math.round(sz * 0.3);
        ctx.shadowOffsetY= Math.round(sz * 0.06);
        ctx.strokeText(title, W / 2, Math.round(H * 0.032));
        ctx.shadowColor  = 'transparent';
        ctx.fillStyle    = '#FFFFFF';
        ctx.fillText(title, W / 2, Math.round(H * 0.032));
        ctx.restore();
      }

      // HOOK: one word per line, gold, anchored above banner
      if (hook) {
        const words = hook.split(/\s+/).filter(Boolean);
        const maxW  = W * 0.9;
        const sz    = Math.min(...words.map(w => fitFontSize(ctx, w, maxW, F)));
        const lineH = sz * 1.0;
        const bannerTop = subtitle ? H * 0.895 : H * 0.95;
        const startY = bannerTop - words.length * lineH - H * 0.01;
        ctx.save();
        ctx.font         = `900 ${sz}px ${F}`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'top';
        ctx.lineJoin     = 'round';
        words.forEach((word, i) => {
          const y = startY + i * lineH;
          ctx.strokeStyle  = 'rgba(0,0,0,0.95)';
          ctx.lineWidth    = Math.round(sz * 0.1);
          ctx.shadowColor  = 'rgba(0,0,0,0.8)';
          ctx.shadowBlur   = Math.round(sz * 0.2);
          ctx.shadowOffsetY= Math.round(sz * 0.05);
          ctx.strokeText(word, W / 2, y);
          ctx.shadowColor  = 'transparent';
          ctx.fillStyle    = '#FFD700';
          ctx.fillText(word, W / 2, y);
        });
        ctx.restore();
      }

      // SUBTITLE: bottom red banner
      if (subtitle) {
        const bannerH = Math.round(H * 0.105);
        const bannerY = H - bannerH;
        ctx.fillStyle = '#CC0000';
        ctx.fillRect(0, bannerY, W, bannerH);
        const sz = Math.min(fitFontSize(ctx, subtitle, W * 0.88, F), Math.round(bannerH * 0.56));
        ctx.save();
        ctx.font         = `900 ${sz}px ${F}`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle    = '#FFFFFF';
        ctx.shadowColor  = 'rgba(0,0,0,0.45)';
        ctx.shadowBlur   = Math.round(sz * 0.12);
        ctx.fillText(subtitle, W / 2, bannerY + bannerH / 2);
        ctx.restore();
      }

      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = `data:${mimeType};base64,${base64}`;
  });
}

// ── Generate thumbnail ────────────────────────────────
async function generateThumbnail() {
  const rawPrompt = promptInput.value.trim();
  if (!rawPrompt) {
    showError(generateError, 'Please enter a prompt describing your thumbnail.');
    promptInput.focus();
    return;
  }
  clearError(generateError);
  hideEl(generateResult);
  showEl(generateLoading);
  generateBtn.disabled = true;
  try {
    const ratio = getSelectedRatio();
    // Send full prompt to Gemini — text is rendered directly in the image (3D/embossed)
    const res   = await fetch('/api/generate', {
      method:      'POST',
      credentials: 'include',
      headers:     { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: rawPrompt, aspectRatio: ratio })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Generation failed. Please try again.');

    let finalData     = data.imageData;
    let finalMimeType = data.mimeType || 'image/png';

    state.generateImageData = finalData;
    state.generateMimeType  = finalMimeType;
    state.generateRatio     = data.aspectRatio || ratio;

    generateImage.src = `data:${finalMimeType};base64,${finalData}`;
    generateImageWrap.dataset.ratio = state.generateRatio;
    hideEl(generateLoading);
    showEl(generateResult);

    galleryAdd({
      id:        Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      type:      'thumbnail',
      imageData: finalData,
      mimeType:  finalMimeType,
      prompt:    rawPrompt,
      ratio:     state.generateRatio,
      timestamp: Date.now()
    });

  } catch (err) {
    hideEl(generateLoading);
    showError(generateError, err.message);
  } finally {
    generateBtn.disabled = false;
  }
}

generateBtn.addEventListener('click', generateThumbnail);
regenerateBtn.addEventListener('click', generateThumbnail);

downloadBtn.addEventListener('click', () => {
  if (!state.generateImageData) return;
  const ext  = state.generateMimeType.split('/')[1] || 'png';
  downloadImage(state.generateImageData, state.generateMimeType,
    `thumbnail-${state.generateRatio.replace(':','-')}-${Date.now()}.${ext}`);
});

promptInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); generateThumbnail(); }
});

// ── Face swap helpers ─────────────────────────────────
function updateSwapButton() {
  swapBtn.disabled = !(state.sourceFile && state.targetFile);
}

function loadPreview(file, imgEl, previewEl, labelEl) {
  const reader  = new FileReader();
  reader.onload = e => {
    imgEl.src = e.target.result;
    hideEl(labelEl);
    showEl(previewEl);
    updateSwapButton();
  };
  reader.readAsDataURL(file);
}

function clearPreview(type) {
  if (type === 'source') {
    state.sourceFile  = null;
    sourceImg.src     = '';
    hideEl(sourcePreview);
    showEl(sourceSlot.querySelector('.upload-label'));
    sourceInput.value = '';
    // Deselect any active preset card
    document.querySelectorAll('.ps-card').forEach(c => c.classList.remove('selected'));
  } else {
    state.targetFile  = null;
    targetImg.src     = '';
    hideEl(targetPreview);
    showEl(targetSlot.querySelector('.upload-label'));
    targetInput.value = '';
  }
  updateSwapButton();
}

sourceInput.addEventListener('change', e => {
  const file = e.target.files?.[0];
  if (!file) return;
  state.sourceFile = file;
  loadPreview(file, sourceImg, sourcePreview, sourceSlot.querySelector('.upload-label'));
});

targetInput.addEventListener('change', e => {
  const file = e.target.files?.[0];
  if (!file) return;
  state.targetFile = file;
  loadPreview(file, targetImg, targetPreview, targetSlot.querySelector('.upload-label'));
});

document.querySelectorAll('.remove-btn').forEach(btn => {
  btn.addEventListener('click', () => clearPreview(btn.dataset.target));
});

// ── Drag & drop ───────────────────────────────────────
function setupDrop(slot, fileKey, imgEl, previewEl) {
  const label = slot.querySelector('.upload-label');
  slot.addEventListener('dragover',  e => { e.preventDefault(); label.classList.add('drag-over'); });
  slot.addEventListener('dragleave', () => label.classList.remove('drag-over'));
  slot.addEventListener('drop', e => {
    e.preventDefault();
    label.classList.remove('drag-over');
    const file = e.dataTransfer?.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    state[fileKey] = file;
    loadPreview(file, imgEl, previewEl, label);
  });
}
setupDrop(sourceSlot, 'sourceFile', sourceImg, sourcePreview);
setupDrop(targetSlot, 'targetFile', targetImg, targetPreview);

// ── Face swap generate ────────────────────────────────
async function doFaceSwap() {
  if (!state.sourceFile || !state.targetFile) {
    showError(swapError, 'Please upload both a source face image and a target image.');
    return;
  }
  clearError(swapError);
  hideEl(swapResult);
  showEl(swapLoading);
  swapBtn.disabled = true;
  try {
    const formData     = new FormData();
    const customPrompt = swapPrompt.value.trim();
    formData.append('sourceImage', state.sourceFile);
    formData.append('targetImage', state.targetFile);
    if (customPrompt) formData.append('prompt', customPrompt);

    const res  = await fetch('/api/faceswap', { method: 'POST', credentials: 'include', body: formData });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Face swap failed. Try different images.');

    state.swapImageData = data.imageData;
    state.swapMimeType  = data.mimeType || 'image/png';

    // Before/after comparison
    if (compareOriginal) compareOriginal.src = targetImg.src;
    swapImage.src = `data:${state.swapMimeType};base64,${state.swapImageData}`;
    hideEl(swapLoading);
    showEl(swapResult);

    // ── Save to gallery ──
    galleryAdd({
      id:        Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      type:      'faceswap',
      imageData: state.swapImageData,
      mimeType:  state.swapMimeType,
      prompt:    customPrompt || 'Face swap',
      ratio:     '1:1',
      timestamp: Date.now()
    });

  } catch (err) {
    hideEl(swapLoading);
    showError(swapError, err.message);
  } finally {
    swapBtn.disabled = !(state.sourceFile && state.targetFile);
  }
}

swapPrompt.addEventListener('input', () => {
  if (swapPrompt.value.length > 300) swapPrompt.value = swapPrompt.value.slice(0, 300);
});

swapBtn.addEventListener('click', doFaceSwap);

swapDownloadBtn.addEventListener('click', () => {
  if (!state.swapImageData) return;
  const ext = state.swapMimeType.split('/')[1] || 'png';
  downloadImage(state.swapImageData, state.swapMimeType, `faceswap-${Date.now()}.${ext}`);
});

// ── Animate sections on scroll ────────────────────────
const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity   = '1';
      entry.target.style.transform = 'translateY(0)';
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.05 });

document.querySelectorAll('.section').forEach(section => {
  const rect       = section.getBoundingClientRect();
  const inViewport = rect.top < window.innerHeight && rect.bottom > 0;
  if (inViewport) {
    section.style.opacity   = '1';
    section.style.transform = 'translateY(0)';
  } else {
    section.style.opacity    = '0';
    section.style.transform  = 'translateY(24px)';
    section.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    observer.observe(section);
  }
});

/* ═══════════════════════════════════════════════════════
   Gallery — localStorage image history
═══════════════════════════════════════════════════════ */

const GALLERY_KEY = 'thumbai_gallery';
const GALLERY_MAX = 50;

function galleryLoad() {
  try   { return JSON.parse(localStorage.getItem(GALLERY_KEY)) || []; }
  catch { return []; }
}
function gallerySave(items) {
  try { localStorage.setItem(GALLERY_KEY, JSON.stringify(items)); }
  catch (e) {
    console.warn('Gallery save failed (storage quota?)', e);
    showToast('⚠️ Gallery storage is full. Delete some images to save new ones.', 'warn');
  }
}

// ── Toast notification ────────────────────────────────
let toastTimer = null;
function showToast(message, type = 'info') {
  let toast = document.getElementById('appToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'appToast';
    toast.style.cssText = `
      position:fixed; bottom:96px; left:50%; transform:translateX(-50%);
      background:rgba(15,12,30,0.94); color:#ede9fe;
      padding:10px 18px; border-radius:10px; font-size:13px; font-weight:500;
      border:1px solid rgba(255,255,255,0.1); backdrop-filter:blur(16px);
      box-shadow:0 8px 32px rgba(0,0,0,0.5);
      z-index:2000; transition:opacity 0.3s ease; pointer-events:none;
      max-width:340px; text-align:center; line-height:1.5;
    `;
    if (type === 'warn') toast.style.borderColor = 'rgba(251,191,36,0.35)';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.style.opacity = '0'; }, 4000);
}
function galleryAdd(item) {
  const items = galleryLoad();
  items.unshift(item);
  if (items.length > GALLERY_MAX) items.length = GALLERY_MAX;
  gallerySave(items);
  galleryRender();
}
function galleryDelete(id) {
  gallerySave(galleryLoad().filter(i => i.id !== id));
  galleryRender();
}
function galleryClearAll() {
  localStorage.removeItem(GALLERY_KEY);
  galleryRender();
}

function galleryRender() {
  const grid    = $('galleryGrid');
  const empty   = $('galleryEmpty');
  const countEl = $('galleryCount');
  if (!grid) return;

  const items = galleryLoad();
  countEl.textContent = `${items.length} image${items.length !== 1 ? 's' : ''}`;

  if (!items.length) {
    showEl(empty);
    grid.innerHTML = '';
    return;
  }
  hideEl(empty);

  grid.innerHTML = items.map(item => `
    <div class="gallery-item" data-id="${item.id}">
      <img
        class="gallery-thumb"
        src="data:${item.mimeType};base64,${item.imageData}"
        alt="${item.type === 'thumbnail' ? 'Generated thumbnail' : 'Face swap'}"
        loading="lazy"
      />
      <div class="gallery-meta">
        <span class="gallery-meta-type">${item.type === 'faceswap' ? '🔄 Face Swap' : '⚡ Generated'}</span>
        <span class="gallery-meta-prompt" title="${escapeHtml(item.prompt)}">${escapeHtml(item.prompt.slice(0, 72))}</span>
        <span class="gallery-meta-time">${formatTime(item.timestamp)}</span>
      </div>
      <div class="gallery-item-actions">
        <button type="button" class="gallery-action-btn" data-action="download" data-id="${item.id}">⬇ Save</button>
        ${item.type === 'thumbnail' ? `<button type="button" class="gallery-action-btn reuse" data-action="use-prompt" data-id="${item.id}">↳ Reuse</button>` : ''}
        <button type="button" class="gallery-action-btn del" data-action="delete" data-id="${item.id}">✕</button>
      </div>
    </div>
  `).join('');

  grid.querySelectorAll('.gallery-action-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const { action, id } = btn.dataset;
      const item = galleryLoad().find(i => i.id === id);
      if (!item) return;

      if (action === 'download') {
        const ext   = item.mimeType.split('/')[1] || 'png';
        const label = item.type === 'faceswap'
          ? 'faceswap'
          : `thumbnail-${(item.ratio || '16:9').replace(':', '-')}`;
        downloadImage(item.imageData, item.mimeType, `${label}-${id}.${ext}`);

      } else if (action === 'use-prompt') {
        const trimmed = (item.prompt || '').slice(0, 2000);
        promptInput.value = trimmed;
        updateCharCount(trimmed, charCount, 2000);
        promptInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        promptInput.focus();
        promptInput.style.borderColor = 'var(--violet-600)';
        promptInput.style.boxShadow   = '0 0 0 3px rgba(124,58,237,.3)';
        setTimeout(() => { promptInput.style.borderColor = ''; promptInput.style.boxShadow = ''; }, 1200);

      } else if (action === 'delete') {
        galleryDelete(id);
      }
    });
  });
}

// Init gallery
galleryRender();

$('clearGalleryBtn').addEventListener('click', () => {
  if (!$('galleryGrid').children.length) return;
  if (confirm('Delete all saved images? This cannot be undone.')) galleryClearAll();
});

/* ═══════════════════════════════════════════════════════
   Floating Prompt Assistant (FAB)
═══════════════════════════════════════════════════════ */

const fabBtn      = $('fabBtn');
const fabPanel    = $('fabPanel');
const fabClose    = $('fabClose');
const fabInput    = $('fabInput');
const fabSendBtn  = $('fabSendBtn');
const fabMessages = $('fabMessages');
const fabIcon     = $('fabIcon');

let fabOpen = false;

function toggleFab(force) {
  fabOpen = force !== undefined ? force : !fabOpen;
  fabOpen ? showEl(fabPanel) : hideEl(fabPanel);
  fabIcon.textContent = fabOpen ? '✕' : '✨';
  if (fabOpen) {
    fabMessages.scrollTop = fabMessages.scrollHeight;
    setTimeout(() => fabInput.focus(), 60);
  }
}

fabBtn.addEventListener('click',  () => toggleFab());
fabClose.addEventListener('click', () => toggleFab(false));
document.addEventListener('keydown', e => { if (e.key === 'Escape' && fabOpen) toggleFab(false); });

function appendFabMsg(type, content, promptText, label) {
  const msg = document.createElement('div');
  msg.className = `fab-msg fab-msg-${type}`;

  if (type === 'loading') {
    msg.innerHTML = `<div class="fab-loading-bubble">
      <span class="fab-dot"></span><span class="fab-dot"></span><span class="fab-dot"></span>
      <span style="margin-left:5px;font-size:12px">Thinking…</span>
    </div>`;
  } else if (type === 'result') {
    const headerHtml = label
      ? `<div class="fab-prompt-label">${escapeHtml(label)}</div>`
      : '';
    msg.innerHTML = `<div class="fab-msg-bubble fab-prompt-card">
      ${headerHtml}
      <span class="fab-prompt-text">${escapeHtml(content)}</span>
      <div class="fab-msg-result-actions">
        <button type="button" class="fab-copy-btn">📋 Copy</button>
        <button type="button" class="fab-use-btn">Use This</button>
      </div>
    </div>`;

    msg.querySelector('.fab-copy-btn').addEventListener('click', () => {
      const cb = msg.querySelector('.fab-copy-btn');
      navigator.clipboard.writeText(promptText).then(() => {
        cb.textContent = '✓ Copied!';
        setTimeout(() => { cb.textContent = '📋 Copy'; }, 1600);
      }).catch(() => {
        const ta = Object.assign(document.createElement('textarea'),
          { value: promptText, style: 'position:fixed;opacity:0' });
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        cb.textContent = '✓ Copied!';
        setTimeout(() => { cb.textContent = '📋 Copy'; }, 1600);
      });
    });

    msg.querySelector('.fab-use-btn').addEventListener('click', () => {
      const trimmed = promptText.slice(0, 2000);
      promptInput.value = trimmed;
      updateCharCount(trimmed, charCount, 2000);
      fillOverlaysFromPrompt(trimmed);
      promptInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      promptInput.focus();
      promptInput.style.borderColor = 'var(--violet-600)';
      promptInput.style.boxShadow   = '0 0 0 3px rgba(124,58,237,.3)';
      setTimeout(() => { promptInput.style.borderColor = ''; promptInput.style.boxShadow = ''; }, 1200);
    });

  } else {
    msg.innerHTML = `<div class="fab-msg-bubble">${escapeHtml(content)}</div>`;
  }

  fabMessages.appendChild(msg);
  fabMessages.scrollTop = fabMessages.scrollHeight;
  return msg;
}

async function sendFabMessage() {
  const topic = fabInput.value.trim();
  if (!topic) return;
  fabInput.value = '';
  fabSendBtn.disabled = true;
  appendFabMsg('user', topic);
  const loadingEl = appendFabMsg('loading');
  try {
    // Auto-detect aspect ratio from user's text
    let ratio = getSelectedRatio();
    const lower = topic.toLowerCase();
    if (lower.includes('reel') || lower.includes('shorts') || lower.includes('9:16') ||
        lower.includes('instagram') || lower.includes('tiktok') || lower.includes('story')) {
      ratio = '9:16';
    } else if (lower.includes('youtube') || lower.includes('16:9') || lower.includes('thumbnail')) {
      ratio = '16:9';
    }

    const res  = await fetch('/api/suggest-prompt', {
      method:      'POST',
      credentials: 'include',
      headers:     { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, aspectRatio: ratio })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Something went wrong.');
    loadingEl.remove();
    const prompts = data.prompts || (data.prompt ? [data.prompt] : []);
    if (prompts.length === 0) throw new Error('No prompts returned.');
    prompts.forEach((p, i) => {
      appendFabMsg('result', p, p, prompts.length > 1 ? `Prompt ${i + 1}` : null);
    });
  } catch (err) {
    loadingEl.remove();
    appendFabMsg('bot', `❌ ${err.message}`);
  } finally {
    fabSendBtn.disabled = false;
    fabInput.focus();
  }
}

fabSendBtn.addEventListener('click', sendFabMessage);
fabInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); sendFabMessage(); } });
