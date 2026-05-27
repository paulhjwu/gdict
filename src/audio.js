function setSpeakStatus(msg, isError) {
  const el = document.getElementById('modal-speak-status');
  if (el) { el.textContent = msg; el.style.color = isError ? '#ef4444' : '#64748b'; }
}

function cleanErrorMessage(err) {
  const raw = (err && err.message) ? String(err.message) : String(err || 'Unknown error');
  const prefix = "Error invoking remote method 'get-word-audio':";
  const msg = raw.startsWith(prefix) ? raw.slice(prefix.length).trim() : raw;
  if (/fetch failed/i.test(msg)) {
    return 'Cloud audio is unavailable right now (network or credentials).';
  }
  return msg;
}

function speakWithBrowserTTS(text) {
  if (!('speechSynthesis' in window)) return false;
  const toSpeak = (text || '').trim();
  if (!toSpeak) return false;

  const utter = new SpeechSynthesisUtterance(toSpeak);
  utter.lang = 'el-GR';
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
  return true;
}

let _audioCtx = null;
function getAudioCtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (_audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}

async function speakWord(translit, greekText) {
  if (!translit || !greekText) { setSpeakStatus('Nothing to speak.', true); return; }
  const ctx = getAudioCtx(); // create/resume within user gesture
  setSpeakStatus('Loading…');
  try {
    const bytes = await window.electronAPI.getWordAudio(translit, greekText);
    // bytes is a Uint8Array transferred from the main process
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    if (ctx.state === 'suspended') await ctx.resume();
    const decoded = await new Promise((resolve, reject) =>
      ctx.decodeAudioData(ab, resolve, reject)
    );
    const src = ctx.createBufferSource();
    src.buffer = decoded;
    src.connect(ctx.destination);
    src.start(0);
    setSpeakStatus('');
  } catch (e) {
    const cloudError = cleanErrorMessage(e);
    if (speakWithBrowserTTS(greekText)) {
      setSpeakStatus('Using local voice. ' + cloudError, false);
      return;
    }
    setSpeakStatus('Error: ' + cloudError, true);
  }
}
