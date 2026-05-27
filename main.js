const { app, BrowserWindow, ipcMain, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const SA = require('./avian-casing-491003-p0-8361d893391b.json');
const WORD_AUDIO_DIR = path.join(__dirname, 'word_audio');

// Register app:// scheme before app is ready
protocol.registerSchemesAsPrivileged([{
  scheme: 'app',
  privileges: { standard: true, secure: true, supportFetchAPI: true },
}]);

// ── Google TTS (JWT → OAuth → synthesize) ────────────────────────────────────
let _token = null, _tokenExpiry = 0;

async function getGoogleToken() {
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
  const data = await resp.json();
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
  const data = await resp.json();
  if (!data.audioContent) throw new Error(data.error?.message || 'No audio returned');
  const bytes = Buffer.from(data.audioContent, 'base64');
  fs.writeFileSync(cachePath, bytes);
  return bytes;
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
