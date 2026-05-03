/* ─────────────────────────────────────────────────────────────
   Activity Logger — appends user actions to logs/activity.log
───────────────────────────────────────────────────────────── */
'use strict';

const fs   = require('fs');
const path = require('path');

const LOG_DIR  = path.join(__dirname, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'activity.log');

/**
 * Log a user action to disk.
 * @param {string} user    - Session username (or 'anonymous')
 * @param {string} action  - e.g. 'login', 'generate', 'faceswap'
 * @param {object} details - Optional extra context (ip, prompt snippet, etc.)
 */
function log(user, action, details = {}) {
  const now  = new Date();
  const ts   = now.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const line = `[${ts}] user:${user || 'anonymous'} action:${action} ${JSON.stringify(details)}\n`;

  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, line, 'utf8');
  } catch (err) {
    // Logging must never crash the app
    console.error('[ActivityLogger] Write failed:', err.message);
  }
}

module.exports = { log };
