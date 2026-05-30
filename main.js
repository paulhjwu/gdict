const { app, BrowserWindow, ipcMain, protocol } = require('electron');
app.disableHardwareAcceleration();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Load .env into process.env
(function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = trimmed.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    const key = m[1];
    const value = m[2].trim();
    if (!process.env[key]) process.env[key] = value;
  }
})();

function loadServiceAccount() {
  const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const candidatePath = envPath
    ? path.resolve(envPath)
    : path.join(__dirname, 'avian-casing-491003-p0-8361d893391b.json');

  if (!fs.existsSync(candidatePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
}

const SA = loadServiceAccount();
const WORD_AUDIO_DIR = path.join(__dirname, 'word_audio');

// Register app:// scheme before app is ready
protocol.registerSchemesAsPrivileged([{
  scheme: 'app',
  privileges: { standard: true, secure: true, supportFetchAPI: true },
}]);

// ── Google TTS (JWT → OAuth → synthesize) ────────────────────────────────────
let _token = null, _tokenExpiry = 0;

async function getGoogleToken() {
  if (!SA) {
    throw new Error(
      'Google TTS credentials not found. Set GOOGLE_APPLICATION_CREDENTIALS or add avian-casing-491003-p0-8361d893391b.json in project root.'
    );
  }

  if (_token && Date.now() < _tokenExpiry) return _token;
  const now = Math.floor(Date.now() / 1000);
  const header  = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: SA.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  })).toString('base64url');
  const toSign = `${header}.${payload}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(toSign);
  const sig = sign.sign(SA.private_key, 'base64url');
  const jwt = `${toSign}.${sig}`;

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  let data = null;
  try {
    data = await resp.json();
  } catch {
    data = null;
  }
  if (!resp.ok) {
    throw new Error((data && (data.error_description || data.error)) || `Token request failed (HTTP ${resp.status})`);
  }
  if (!data.access_token) throw new Error(data.error_description || 'Token fetch failed');
  _token = data.access_token;
  _tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return _token;
}

// ── IPC: return MP3 bytes (cached or freshly generated) ──────────────────────
ipcMain.handle('get-word-audio', async (_event, translit, text) => {
  fs.mkdirSync(WORD_AUDIO_DIR, { recursive: true });
  const cachePath = path.join(WORD_AUDIO_DIR, `${translit}.mp3`);
  if (fs.existsSync(cachePath)) {
    return fs.readFileSync(cachePath);
  }
  try {
    const token = await getGoogleToken();
    const resp = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: 'el-GR', ssmlGender: 'NEUTRAL' },
        audioConfig: { audioEncoding: 'MP3' },
      }),
    });
    let data = null;
    try {
      data = await resp.json();
    } catch {
      data = null;
    }
    if (!resp.ok) {
      throw new Error((data && data.error && data.error.message) || `Text-to-Speech request failed (HTTP ${resp.status})`);
    }
    if (!data || !data.audioContent) throw new Error('No audio returned');
    const bytes = Buffer.from(data.audioContent, 'base64');
    fs.writeFileSync(cachePath, bytes);
    return bytes;
  } catch (err) {
    throw new Error((err && err.message) ? err.message : 'Unable to generate audio');
  }
});

const NT_BOOK_NUMBERS = {
  MAT: 40, MRK: 41, LUK: 42, JHN: 43, ACT: 44, ROM: 45,
  '1CO': 46, '2CO': 47, GAL: 48, EPH: 49, PHP: 50, COL: 51,
  '1TH': 52, '2TH': 53, '1TI': 54, '2TI': 55, TIT: 56,
  PHM: 57, HEB: 58, JAS: 59, '1PE': 60, '2PE': 61,
  '1JN': 62, '2JN': 63, '3JN': 64, JUD: 65, REV: 66,
};

function parseTsvFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/);
  const rows = lines.map(line => line.split('\t'));
  return rows;
}

function buildGreekVerse(tsvDir, bookCode, chapter, verse) {
  const filePath = path.join(tsvDir, 'source_macula_greek_SBLGNT+required.tsv');
  if (!fs.existsSync(filePath)) throw new Error('Greek TSV source file not found.');
  const rows = parseTsvFile(filePath);
  const header = rows[0] || [];
  const columns = header.reduce((acc, name, idx) => {
    if (name) acc[name] = idx;
    return acc;
  }, {});
  const refPrefix = `${bookCode} ${chapter}:${verse}!`;
  const verseRows = rows.slice(1).filter(row => (row[columns.ref] || '').startsWith(refPrefix));
  if (!verseRows.length) {
    throw new Error(`Greek verse not found: ${bookCode} ${chapter}:${verse}`);
  }
  let greek = '';
  for (const row of verseRows) {
    const token = (row[columns.text] || '').trim();
    if (!token) continue;
    const after = row[columns.after] || '';
    greek += token;
    greek += after || ' ';
  }
  return greek.replace(/\s+/g, ' ').trim();
}

function buildEnglishVerse(tsvDir, bookCode, chapter, verse) {
  const bookNumber = NT_BOOK_NUMBERS[bookCode];
  if (!bookNumber) {
    throw new Error(`Unsupported book code: ${bookCode}`);
  }
  const filePath = path.join(tsvDir, 'target_BSB_20240904.tsv');
  if (!fs.existsSync(filePath)) throw new Error('BSB TSV target file not found.');
  const rows = parseTsvFile(filePath);
  const header = rows[0] || [];
  const columns = header.reduce((acc, name, idx) => {
    if (name) acc[name] = idx;
    return acc;
  }, {});
  const verseId = `${String(bookNumber).padStart(2, '0')}${String(chapter).padStart(3, '0')}${String(verse).padStart(3, '0')}`;
  const verseRows = rows.slice(1).filter(row =>
    (row[columns.source_verse] || '') === verseId && (row[columns.exclude] || '').trim().toLowerCase() !== 'y'
  );
  if (!verseRows.length) {
    throw new Error(`English verse not found: ${bookCode} ${chapter}:${verse}`);
  }
  let english = '';
  for (const row of verseRows) {
    const token = (row[columns.text] || '').trim();
    if (!token) continue;
    const skipSpace = (row[columns.skip_space_after] || '').trim().toLowerCase() === 'y';
    english += token;
    if (!skipSpace) english += ' ';
  }
  return english.replace(/\s+/g, ' ').trim();
}

// ── IPC: fetch verse + shorten with Gemini ───────────────────────────────────
ipcMain.handle('shorten-verse', async (_event, bookCode, chapter, verse, word) => {
  const tsvDir = path.join(__dirname, 'tsv');
  const fullGreek = buildGreekVerse(tsvDir, bookCode, chapter, verse);
  const fullBsb = buildEnglishVerse(tsvDir, bookCode, chapter, verse);

  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set in .env or environment');

  const prompt =
    `Greek verse: "${fullGreek}"\n` +
    `BSB English: "${fullBsb}"\n` +
    `Key Greek word: "${word}"\n\n` +
    `Shorten BOTH to fewer than 10 words each. ` +
    `The Greek must contain the exact word "${word}". ` +
    `The English must retain its translation. ` +
    `Reply with ONLY JSON: {"greek":"...","english":"..."}`;

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 120 },
      }),
    }
  );
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error?.message || `Gemini HTTP ${resp.status}`);
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!raw) throw new Error('Empty Gemini response');
  const cleaned = raw.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim();
  const parsed = JSON.parse(cleaned);
  if (!parsed.greek) throw new Error('Unexpected Gemini response format');
  return { greek: parsed.greek, english: parsed.english || '' };
});

// ── Window ────────────────────────────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadURL('app://./index.html');
}

app.whenReady().then(() => {
  // Serve local files via app:// scheme
  protocol.registerFileProtocol('app', (request, callback) => {
    const filePath = path.join(__dirname, new URL(request.url).pathname);
    callback({ path: filePath });
  });
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
