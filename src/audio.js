function setSpeakStatus(msg, isError) {
  const el = document.getElementById('modal-speak-status');
  if (el) { el.textContent = msg; el.style.color = isError ? '#ef4444' : '#64748b'; }
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
    setSpeakStatus('Error: ' + e.message, true);
  }
}
