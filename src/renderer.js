const TSV_FILES = [
  'source_macula_greek_SBLGNT+required.tsv',
  'source_macula_hebrew+required.tsv',
  'target_NA27-YLT.tsv',
  'target_ot_WLC-YLT.tsv',
  'target_BSB_20240904.tsv',
  'target_arb-vd.tsv',
  'target_VanDyck_new.tsv',
  'target_BSB_old.tsv',
];
const DICT_FILES = ['Koine_Greek_Alphabet_Guide.tsv'];

const TSV_DISPLAY_FIELDS = [
  { key: 'class',      label: 'Class'       },
  { key: 'type',       label: 'Type'        },
  { key: 'english',    label: 'English'     },
  { key: 'lemma',      label: 'Lemma',      greek: true },
  { key: 'normalized', label: 'Normalized', greek: true },
  { key: 'strong',     label: 'Strong'      },
  { key: 'morph',      label: 'Morph'       },
  { key: 'person',     label: 'Person'      },
  { key: 'number',     label: 'Number'      },
  { key: 'gender',     label: 'Gender'      },
  { key: 'case',       label: 'Case'        },
  { key: 'tense',      label: 'Tense'       },
  { key: 'voice',      label: 'Voice'       },
  { key: 'mood',       label: 'Mood'        },
  { key: 'degree',     label: 'Degree'      },
  { key: 'domain',     label: 'Domain'      },
];

const tsv  = { COL: {}, rows: [], headers: [] };
const dict = { COL: {}, rows: [], headers: [] };

let currentWord     = '';
let currentRef      = '';
let currentNorm     = '';
let currentTranslit = '';
let lastRenderMatches = [];

// ── TSV panel ─────────────────────────────────────────────────────────────────
function tsvFileChange() {
  tsv.COL = {}; tsv.rows = []; tsv.headers = [];
  document.getElementById('tsv-results').innerHTML = '';
  document.getElementById('tsv-searchBtn').disabled = true;
  document.getElementById('tsv-status').textContent = 'Loading TSV…';
  loadTSV();
}

async function loadTSV() {
  const file = document.getElementById('tsv-fileSelect').value;
  try {
    const resp = await fetch(`./tsv/${file}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    const lines = text.split('\n');
    tsv.headers = lines[0].split('\t').map(h => h.trim());
    tsv.headers.forEach((h, i) => { tsv.COL[h] = i; });
    tsv.rows = lines.slice(1).filter(l => l.trim()).map(l => l.split('\t'));
    document.getElementById('tsv-status').textContent =
      `${file}: ${tsv.rows.length.toLocaleString()} rows loaded.`;
    document.getElementById('tsv-searchBtn').disabled = false;
  } catch (e) {
    document.getElementById('tsv-status').textContent = `Error: ${e.message}`;
  }
}

function tsvSearch() {
  const query = document.getElementById('tsv-query').value.trim().toLowerCase();
  if (!query) return;
  const searchIdxs = ['english', 'lemma', 'text']
    .map(k => tsv.COL[k]).filter(i => i !== undefined);
  const matches = tsv.rows.filter(row =>
    searchIdxs.some(i => (row[i] || '').toLowerCase().includes(query))
  );
  document.getElementById('tsv-status').textContent =
    `${matches.length.toLocaleString()} result${matches.length !== 1 ? 's' : ''} for "${query}"`;
  renderTSV(matches);
}

function renderTSV(matches) {
  const container = document.getElementById('tsv-results');
  if (!matches.length) {
    container.innerHTML = '<div class="no-results">No results found.</div>';
    return;
  }
  const MAX = 200;
  const toShow = matches.slice(0, MAX);
  lastRenderMatches = toShow;

  const html = toShow.map(row => {
    const ref   = tsvVal(row, 'ref');
    const text  = tsvVal(row, 'text');
    const gloss = tsvVal(row, 'gloss');
    const textSpan = text
      ? `<span class="card-text greek-word" data-word="${escAttr(text)}" data-ref="${escAttr(ref)}">${escHtml(text)}</span>`
      : '';
    const fieldsHtml = TSV_DISPLAY_FIELDS.map(f => {
      const v = tsvVal(row, f.key);
      if (!v) return '';
      const valSpan = f.greek
        ? `<span class="field-value greek greek-word" data-word="${escAttr(v)}" data-ref="${escAttr(ref)}">${escHtml(v)}</span>`
        : `<span class="field-value">${escHtml(v)}</span>`;
      return `<div class="field"><span class="field-label">${f.label}</span>${valSpan}</div>`;
    }).join('');
    return `<div class="card">
      <div class="card-header">
        <span class="card-ref">${escHtml(ref)}</span>
        ${textSpan}
        ${gloss ? `<span class="card-gloss">"${escHtml(gloss)}"</span>` : ''}
      </div>
      <div class="fields">${fieldsHtml}</div>
    </div>`;
  }).join('');

  const overflow = matches.length > MAX
    ? `<div class="no-results" style="padding:10px">Showing first ${MAX} of ${matches.length.toLocaleString()} results. Refine your search.</div>`
    : '';
  container.innerHTML = html + overflow;
}

function tsvVal(row, col) {
  const idx = tsv.COL[col];
  return (idx !== undefined && row[idx] !== undefined) ? row[idx].trim() : '';
}

// ── Dict panel ────────────────────────────────────────────────────────────────
function dictFileChange() {
  dict.COL = {}; dict.rows = []; dict.headers = [];
  document.getElementById('dict-results').innerHTML = '';
  document.getElementById('dict-status').textContent = 'Loading…';
  loadDict();
}

async function loadDict() {
  const file = document.getElementById('dict-fileSelect').value;
  try {
    const resp = await fetch(`./dict/${file}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    const lines = text.split('\n');
    dict.headers = lines[0].split('\t').map(h => h.trim());
    dict.headers.forEach((h, i) => { dict.COL[h] = i; });
    dict.rows = lines.slice(1).filter(l => l.trim()).map(l => l.split('\t'));
    document.getElementById('dict-status').textContent =
      `${file}: ${dict.rows.length.toLocaleString()} rows loaded.`;
    renderDict();
  } catch (e) {
    document.getElementById('dict-status').textContent = `Error: ${e.message}`;
  }
}

function renderDict() {
  const container = document.getElementById('dict-results');
  const headerHtml = dict.headers.map(h => `<th>${escHtml(h)}</th>`).join('');
  const rowsHtml = dict.rows.map(row => {
    const filled = row.filter(c => c.trim());
    if (filled.length === 1 && (row[0] || '').trim().length > 40) {
      return `<tr><td class="note" colspan="${dict.headers.length}">${escHtml(row[0].trim())}</td></tr>`;
    }
    return `<tr>${dict.headers.map((h, i) =>
      `<td>${escHtml((row[i] || '').trim())}</td>`
    ).join('')}</tr>`;
  }).join('');
  container.innerHTML = `<div class="dict-wrap"><table class="dict-table">
    <thead><tr>${headerHtml}</tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table></div>`;
}

// ── Word modal ────────────────────────────────────────────────────────────────
function openWordModal(word, ref) {
  currentWord = word;
  currentRef  = ref || '';
  document.getElementById('modal-greek').textContent = word;
  document.getElementById('modal-translit').textContent = '…';
  const box = document.querySelector('.modal-box');
  box.style.left = '50%'; box.style.top = '50%';
  box.style.transform = 'translate(-50%, -50%)';
  document.getElementById('word-modal').classList.add('open');

  const refIdx   = tsv.COL['ref'];
  const lemmaIdx = tsv.COL['lemma'];
  const normIdx  = tsv.COL['normalized'];
  let lemma = word;
  let translit = lookupTranslit(word);
  if (currentRef && refIdx !== undefined) {
    const row = lastRenderMatches.find(r => (r[refIdx] || '').trim() === currentRef);
    if (row) {
      if (lemmaIdx !== undefined) lemma = (row[lemmaIdx] || '').trim() || word;
      const norm = normIdx !== undefined ? (row[normIdx] || '').trim() : '';
      currentNorm = norm || word;
      translit = lookupTranslit(currentNorm);
    }
  }
  currentTranslit = translit;
  renderOccurrences(lemma);
  document.getElementById('modal-translit').textContent = translit || '—';
}

function closeModal() {
  document.getElementById('word-modal').classList.remove('open');
}

function renderOccurrences(lemma) {
  const container = document.getElementById('modal-occurrences');
  if (!lastRenderMatches.length || !lemma) { container.innerHTML = ''; return; }
  const lemmaIdx = tsv.COL['lemma'];
  const normIdx  = tsv.COL['normalized'];
  const morphIdx = tsv.COL['morph'];
  const refIdx   = tsv.COL['ref'];
  if (lemmaIdx === undefined) { container.innerHTML = ''; return; }

  const seen = new Set(), unique = [];
  for (const row of lastRenderMatches) {
    if ((row[lemmaIdx] || '').trim() !== lemma) continue;
    const norm = normIdx !== undefined ? (row[normIdx] || '').trim() : '';
    if (!seen.has(norm)) { seen.add(norm); unique.push(row); }
  }
  if (!unique.length) { container.innerHTML = ''; return; }

  container.innerHTML = unique.map(row => {
    const r = refIdx   !== undefined ? (row[refIdx]   || '').trim() : '';
    const n = normIdx  !== undefined ? (row[normIdx]  || '').trim() : '';
    const m = morphIdx !== undefined ? (row[morphIdx] || '').trim() : '';
    const t = lookupTranslit(n);
    return `<div class="modal-occ-item" data-ref="${escAttr(r)}" data-word="${escAttr(n)}" data-translit="${escAttr(t)}">
      <span class="occ-ref">${escHtml(r)}</span>
      <span class="occ-word-col">
        <span class="occ-word">${escHtml(n)}</span>
        ${t ? `<span class="occ-translit">${escHtml(t)}</span>` : ''}
      </span>
      <span class="occ-morph">${escHtml(m)}</span>
      <button class="occ-speak-btn" data-translit="${escAttr(t)}" data-word="${escAttr(n)}">🔊</button>
    </div>`;
  }).join('');
}

function speakCurrentWord() {
  speakWord(currentTranslit, currentNorm || currentWord);
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escAttr(s) {
  return s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadWordTranslit();

  document.getElementById('tsv-fileSelect').innerHTML =
    TSV_FILES.map(f => `<option value="${f}">${f}</option>`).join('');
  tsvFileChange();

  document.getElementById('dict-fileSelect').innerHTML =
    DICT_FILES.map(f => `<option value="${f}">${f}</option>`).join('');
  dictFileChange();

  document.getElementById('tsv-query').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !document.getElementById('tsv-searchBtn').disabled) tsvSearch();
  });

  document.getElementById('tsv-results').addEventListener('click', e => {
    const el = e.target.closest('.greek-word');
    if (el && el.dataset.word) openWordModal(el.dataset.word, el.dataset.ref || '');
  });

  document.getElementById('word-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('word-modal')) closeModal();
  });

  const modalBox = document.querySelector('.modal-box');
  document.querySelector('.modal-header').addEventListener('mousedown', e => {
    if (e.target.closest('button')) return;
    e.preventDefault();
    const rect = modalBox.getBoundingClientRect();
    modalBox.style.left = rect.left + 'px';
    modalBox.style.top  = rect.top  + 'px';
    modalBox.style.transform = 'none';
    let prevX = e.clientX, prevY = e.clientY;
    const onMove = ev => {
      modalBox.style.left = (parseFloat(modalBox.style.left) + ev.clientX - prevX) + 'px';
      modalBox.style.top  = (parseFloat(modalBox.style.top)  + ev.clientY - prevY) + 'px';
      prevX = ev.clientX; prevY = ev.clientY;
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  document.getElementById('modal-occurrences').addEventListener('click', e => {
    const btn = e.target.closest('.occ-speak-btn');
    if (btn) {
      speakWord(btn.dataset.translit || '', btn.dataset.word || '');
      return;
    }
    const item = e.target.closest('.modal-occ-item');
    if (item) {
      currentNorm     = item.dataset.word || '';
      currentTranslit = item.dataset.translit || '';
      document.getElementById('modal-greek').textContent   = currentNorm;
      document.getElementById('modal-translit').textContent = currentTranslit || '—';
    }
  });
});
