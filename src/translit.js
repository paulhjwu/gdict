function sblTranslit(greek) {
  if (!greek) return '';
  const GRK = {
    'α':'a','β':'b','γ':'g','δ':'d','ε':'e','ζ':'z','η':'ē',
    'θ':'th','ι':'i','κ':'k','λ':'l','μ':'m','ν':'n','ξ':'x',
    'ο':'o','π':'p','ρ':'r','σ':'s','ς':'s','τ':'t','υ':'y',
    'φ':'ph','χ':'ch','ψ':'ps','ω':'ō',
  };
  const ROUGH = '̔', ISUB = 'ͅ', DIER = '̈';
  const isComb = c => c >= '̀' && c <= 'ͯ';
  const nfd = greek.normalize('NFD');
  const tokens = [];
  for (let i = 0; i < nfd.length;) {
    const ch = nfd[i], lc = ch.toLowerCase();
    if (lc in GRK) {
      let rough = false, iotaSub = false, dier = false;
      i++;
      while (i < nfd.length && isComb(nfd[i])) {
        if (nfd[i] === ROUGH) rough = true;
        if (nfd[i] === ISUB)  iotaSub = true;
        if (nfd[i] === DIER)  dier = true;
        i++;
      }
      tokens.push({ ch, lc, up: ch !== lc, rough, iotaSub, dier });
    } else {
      tokens.push({ ch, raw: true });
      i++;
    }
  }
  let out = '';
  for (let j = 0; j < tokens.length; j++) {
    const t = tokens[j];
    if (t.raw) { out += t.ch; continue; }
    const { lc, up, rough, iotaSub, dier } = t;
    let lat = GRK[lc];
    if (lc === 'υ' && !dier) {
      const prev = j > 0 && !tokens[j-1].raw ? tokens[j-1].lc : '';
      if ('αεηο'.includes(prev)) lat = 'u';
    }
    if (lc === 'γ') {
      const next = j+1 < tokens.length && !tokens[j+1].raw ? tokens[j+1].lc : '';
      if ('γκξχ'.includes(next)) lat = 'n';
    }
    if (rough) lat = lc === 'ρ' ? 'rh' : 'h' + lat;
    if (iotaSub) lat += 'i';
    if (up && lat) lat = lat[0].toUpperCase() + lat.slice(1);
    out += lat;
  }
  return out;
}

let wordTranslit = {};

async function loadWordTranslit() {
  const resp = await fetch('./word_translit.json');
  wordTranslit = await resp.json();
}

function lookupTranslit(word) {
  if (!word) return '';
  return wordTranslit[word.toLowerCase()] || sblTranslit(word);
}
