const { app, BrowserWindow, ipcMain, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

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
