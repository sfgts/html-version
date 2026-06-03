const SOURCES_URL      = '../assets/sources.json';
const ROSTER_CACHE_KEY = 'esb_roster_v1';
const CACHE_KEY        = 'esb_matches_v7';

/* ── CSV parsing ── */
function parseCSV(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { cells.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    cells.push(cur.trim());
    rows.push(cells);
  }
  return rows;
}

function findNth(arr, val, n) {
  let count = 0;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i].toLowerCase().replace(/\s+/g, ' ').trim() === val) {
      if (++count === n) return i;
    }
  }
  return -1;
}

function mapCols(h) {
  const norm = s => s.toLowerCase().replace(/[\s_]+/g, ' ').trim();
  const idxAny = (...aliases) => {
    for (const a of aliases) {
      const i = h.findIndex(c => norm(c) === a);
      if (i >= 0) return i;
    }
    return -1;
  };

  let s1 = findNth(h.map(norm), 'score 1', 1); if (s1 < 0) s1 = 7;
  let s2 = findNth(h.map(norm), 'score 2', 1); if (s2 < 0) s2 = 8;
  let h1 = findNth(h.map(norm), 'score 1', 2); if (h1 < 0) h1 = 9;
  let h2 = findNth(h.map(norm), 'score 2', 2); if (h2 < 0) h2 = 10;

  const dateCol       = idxAny('date', 'дата', 'fecha');
  const tournamentCol = idxAny('tournament', 'league', 'турнир', 'ліга', 'liga');
  const timeCol       = idxAny('time', 'время', 'час', 'hora');
  const team1Col      = idxAny('team 1', 'team1', 'home team', 'команда 1', 'команда1');
  const team2Col      = idxAny('team 2', 'team2', 'away team', 'команда 2', 'команда2');
  const player1Col    = idxAny('player 1', 'player1', 'home player', 'игрок 1', 'игрок1', 'гравець 1');
  const player2Col    = idxAny('player 2', 'player2', 'away player', 'игрок 2', 'игрок2', 'гравець 2');

  return {
    date:       dateCol       >= 0 ? dateCol       : 0,
    tournament: tournamentCol >= 0 ? tournamentCol : 1,
    time:       timeCol       >= 0 ? timeCol       : 2,
    team1:      team1Col      >= 0 ? team1Col      : 3,
    team2:      team2Col      >= 0 ? team2Col      : 4,
    player1:    player1Col    >= 0 ? player1Col    : 5,
    player2:    player2Col    >= 0 ? player2Col    : 6,
    score1: s1, score2: s2, half1: h1, half2: h2,
  };
}

const DATE_RE = /^\d{2}\.\d{2}\.\d{4}$/;
function v(row, i) { return i >= 0 && row[i] !== undefined ? row[i].trim() : ''; }

function isCancelled(m) {
  if (m.score1 === '' || m.score2 === '') return false;
  return isNaN(+m.score1) || isNaN(+m.score2);
}

/* ── Colors ── */
function tournamentColor(name) {
  if (!name) return 'green';
  const n = name.toLowerCase();
  if (n.includes('bundesliga'))                              return 'red';
  if (n.includes('ligue'))                                   return 'blue';
  if (n.includes('world cup') || n.includes('wc'))           return 'gold';
  if (n.includes('fa cup'))                                  return 'purple';
  if (n.includes('premier') || n.includes('laliga') || n.includes('serie a')) return 'blue';
  if (n.includes('europa') || n.includes('conference'))      return 'purple';
  return 'green';
}

function playerAvatarColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  const hue = Math.abs(h) % 360;
  return `oklch(0.58 0.2 ${hue})`;
}

/* ── Stats ── */
let allMatches = [];

// Parse a single CSV text → array of match objects (no side effects)
function parseOneCSV(text) {
  const rows = parseCSV(text);
  const headerIdx = rows.findIndex(r =>
    r.some(c => c.toLowerCase().trim() === 'date') &&
    r.some(c => c.toLowerCase().trim() === 'tournament')
  );
  if (headerIdx < 0) return [];
  const cols = mapCols(rows[headerIdx]);
  return rows.slice(headerIdx + 1)
    .filter(r => DATE_RE.test(v(r, cols.date)) && v(r, cols.tournament))
    .map(r => ({
      date: v(r, cols.date), tournament: v(r, cols.tournament),
      time: v(r, cols.time),
      team1: v(r, cols.team1), team2: v(r, cols.team2),
      player1: v(r, cols.player1), player2: v(r, cols.player2),
      score1: v(r, cols.score1), score2: v(r, cols.score2),
      half1: v(r, cols.half1),  half2: v(r, cols.half2),
    }));
}

function dedupeKey(m) {
  const [p1, p2] = [m.player1, m.player2].sort();
  return `${m.date}|${m.time}|${p1}|${p2}`;
}

// Merge arrays from multiple sources, deduplicate, preserve document order
function applyMerged(arrays) {
  const seen = new Set();
  const merged = [];
  for (const arr of arrays) {
    for (const m of arr) {
      const key = dedupeKey(m);
      if (!seen.has(key)) { seen.add(key); merged.push(m); }
    }
  }
  allMatches = merged;
}

// Restore allMatches from cached JSON array
function applyFromCache(data) {
  allMatches = data;
}

function calcPlayerStats(name) {
  const byT = {};
  let matches = 0, wins = 0, draws = 0, losses = 0, gf = 0, ga = 0;

  for (const m of allMatches) {
    const isP1 = m.player1 === name, isP2 = m.player2 === name;
    if (!isP1 && !isP2) continue;
    if (m.score1 === '' || m.score2 === '') continue;
    if (isCancelled(m)) continue;

    const myG = isP1 ? +m.score1 : +m.score2;
    const thG = isP1 ? +m.score2 : +m.score1;

    matches++; gf += myG; ga += thG;
    if (myG > thG) wins++; else if (myG === thG) draws++; else losses++;

    if (!byT[m.tournament]) byT[m.tournament] = { w: 0, d: 0, l: 0 };
    const t = byT[m.tournament];
    if (myG > thG) t.w++; else if (myG === thG) t.d++; else t.l++;
  }
  return { matches, wins, draws, losses, gf, ga, byT };
}

/* ── Modal (full stats) ── */
function fmtHcap(val) {
  if (val === null) return '—';
  const n = val.toFixed(2);
  return val > 0 ? '+' + n : n;
}

function openPlayerModal(name) {
  const byT = {};
  let matches = 0, wins = 0, draws = 0, losses = 0, gf = 0, ga = 0, handicap = 0, total = 0;

  for (const m of allMatches) {
    const isP1 = m.player1 === name, isP2 = m.player2 === name;
    if (!isP1 && !isP2) continue;
    if (m.score1 === '' || m.score2 === '') continue;
    if (isCancelled(m)) continue;
    const myG = isP1 ? +m.score1 : +m.score2;
    const thG = isP1 ? +m.score2 : +m.score1;
    matches++; gf += myG; ga += thG;
    handicap += myG - thG; total += myG + thG;
    if (myG > thG) wins++; else if (myG === thG) draws++; else losses++;
    if (!byT[m.tournament]) byT[m.tournament] = { w: 0, d: 0, l: 0 };
    const t = byT[m.tournament];
    if (myG > thG) t.w++; else if (myG === thG) t.d++; else t.l++;
  }
  const s = { matches, wins, draws, losses, gf, ga, byT,
    avgHandicap: matches ? handicap / matches : null,
    avgTotal: matches ? total / matches : null };

  const wPct = matches ? (wins / matches * 100).toFixed(0) : 0;
  const dPct = matches ? (draws / matches * 100).toFixed(0) : 0;
  const lPct = matches ? (losses / matches * 100).toFixed(0) : 0;

  const photoSrc = `../assets/players/${name}.png`;
  const avatarColor = playerAvatarColor(name);
  const initials = name.replace(/[^A-Za-z0-9Ѐ-ӿ]/g, ' ').trim()
    .split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || name.slice(0, 2).toUpperCase();

  // Inject photo column directly into modal-card (outside modalBody)
  const modalCard = document.querySelector('.modal-card');
  modalCard.style.setProperty('--modal-pc-color', avatarColor);

  // Ensure photo col exists
  let photoCol = modalCard.querySelector('.modal-photo-col');
  if (!photoCol) {
    photoCol = document.createElement('div');
    photoCol.className = 'modal-photo-col';
    modalCard.appendChild(photoCol);
  }
  photoCol.innerHTML = `
    <img class="modal-photo-img" src="${photoSrc}" alt="${name}"
         onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
    <div class="modal-photo-avatar" style="background:${avatarColor}; display:none">${initials}</div>
  `;

  // Wrap stats in scrollable col
  const modalBody = document.getElementById('modalBody');
  modalBody.className = 'modal-stats-col';

  modalBody.innerHTML = `
    <div class="modal-player-name">${name}</div>
    <div class="modal-subtitle">${matches} matches played</div>
    <div class="modal-stats-row">
      <div class="modal-stat win"><div class="modal-stat-val">${wins}</div><div class="modal-stat-label">Wins</div></div>
      <div class="modal-stat draw"><div class="modal-stat-val">${draws}</div><div class="modal-stat-label">Draws</div></div>
      <div class="modal-stat loss"><div class="modal-stat-val">${losses}</div><div class="modal-stat-label">Losses</div></div>
    </div>
    <div class="modal-bar-wrap">
      <div class="modal-bar">
        <div class="modal-bar-w" style="width:${wPct}%"></div>
        <div class="modal-bar-d" style="width:${dPct}%"></div>
        <div class="modal-bar-l" style="width:${lPct}%"></div>
      </div>
      <div class="modal-bar-legend">
        <span class="win">${wPct}% W</span>
        <span class="draw">${dPct}% D</span>
        <span class="loss">${lPct}% L</span>
      </div>
    </div>
    <div class="modal-goals-row">
      <div class="modal-goals-item"><span class="modal-goals-val">${gf}</span><span class="modal-goals-lbl">Goals scored</span></div>
      <div class="modal-goals-sep"></div>
      <div class="modal-goals-item"><span class="modal-goals-val">${ga}</span><span class="modal-goals-lbl">Goals conceded</span></div>
      <div class="modal-goals-sep"></div>
      <div class="modal-goals-item"><span class="modal-goals-val">${matches ? (gf / matches).toFixed(1) : '—'}</span><span class="modal-goals-lbl">Avg scored</span></div>
    </div>
    <div class="modal-goals-row" style="margin-top:0.5rem">
      <div class="modal-goals-item">
        <span class="modal-goals-val hcap ${s.avgHandicap > 0 ? 'pos' : s.avgHandicap < 0 ? 'neg' : ''}">${fmtHcap(s.avgHandicap)}</span>
        <span class="modal-goals-lbl">Avg handicap</span>
      </div>
      <div class="modal-goals-sep"></div>
      <div class="modal-goals-item">
        <span class="modal-goals-val">${s.avgTotal !== null ? s.avgTotal.toFixed(2) : '—'}</span>
        <span class="modal-goals-lbl">Avg total</span>
      </div>
      <div class="modal-goals-sep"></div>
      <div class="modal-goals-item">
        <span class="modal-goals-val">${matches ? ((gf - ga) / matches).toFixed(2) : '—'}</span>
        <span class="modal-goals-lbl">Goal diff/game</span>
      </div>
    </div>
    ${Object.keys(byT).length ? `
    <div class="modal-tour-section">
      <div class="modal-tour-title">Tournaments</div>
      <div class="modal-tour-badges">
        ${Object.entries(byT)
          .sort((a, b) => (b[1].w + b[1].d + b[1].l) - (a[1].w + a[1].d + a[1].l))
          .map(([t]) => `<span class="tournament-badge" data-color="${tournamentColor(t)}">${t}</span>`)
          .join('')}
      </div>
    </div>` : ''}
  `;

  document.getElementById('playerModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('playerModal').classList.remove('open');
  document.body.style.overflow = '';
  // Remove photo col so it doesn't duplicate on next open
  document.querySelector('.modal-photo-col')?.remove();
  const modalBody = document.getElementById('modalBody');
  if (modalBody) modalBody.className = '';
}

/* ── Card rendering ── */
function renderCard(name, s, rank) {
  const initials = name.replace(/[^A-Za-z0-9Ѐ-ӿ]/g, ' ').trim()
    .split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase()
    || name.slice(0, 2).toUpperCase();

  const color = playerAvatarColor(name);
  const winRate = s.matches ? Math.round(s.wins / s.matches * 100) : 0;
  const tours = Object.keys(s.byT);
  const photoSrc = `../assets/players/${name}.png`;

  const tourBadges = '';

  const rankBadge = '';

  return `
    <div class="player-card" data-player="${name}" style="--pc-color:${color}">
      <div class="pc-photo-wrap">
        ${rankBadge}
        <div class="pc-name-overlay">${name}</div>
        <img class="pc-photo" src="${photoSrc}" alt="${name}"
             onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
        <div class="pc-avatar" style="background:${color}; display:none">${initials}</div>
      </div>

      <div class="pc-stats">
        <div class="pc-winrate-wrap">
          <div class="pc-winrate-label">
            <span>${s.matches} matches</span>
            <strong>${winRate}%</strong>
          </div>
          <div class="pc-winrate-bar">
            <div class="pc-winrate-fill" style="width:${winRate}%"></div>
          </div>
        </div>

        <div class="pc-wdl">
          <div class="pc-wdl-item w">
            <span class="pc-wdl-val">${s.wins}</span>
            <span class="pc-wdl-lbl">W</span>
          </div>
          <div class="pc-wdl-item d">
            <span class="pc-wdl-val">${s.draws}</span>
            <span class="pc-wdl-lbl">D</span>
          </div>
          <div class="pc-wdl-item l">
            <span class="pc-wdl-val">${s.losses}</span>
            <span class="pc-wdl-lbl">L</span>
          </div>
        </div>

        <div class="pc-goals">
          <div class="pc-goals-item">
            <span class="pc-goals-val">${s.gf}</span>
            <span class="pc-goals-lbl">GF</span>
          </div>
          <div class="pc-goals-item">
            <span class="pc-goals-val">${s.ga}</span>
            <span class="pc-goals-lbl">GA</span>
          </div>
          <div class="pc-goals-item">
            <span class="pc-goals-val">${s.matches ? (s.gf / s.matches).toFixed(1) : '—'}</span>
            <span class="pc-goals-lbl">Avg</span>
          </div>
        </div>

        ${tourBadges ? `<div class="pc-tours">${tourBadges}</div>` : ''}
      </div>
    </div>`;
}

/* ── Compare / H2H ── */
let compareMode = false;
let compareSelected = []; // max 2 names

function toggleCompareMode() {
  compareMode = !compareMode;
  const btn = document.getElementById('compareBtn');
  const hint = document.getElementById('compareHint');
  const grid = document.getElementById('playersGrid');
  btn.classList.toggle('active', compareMode);
  hint.style.display = compareMode ? 'flex' : 'none';
  grid.classList.toggle('compare-mode', compareMode);
  if (!compareMode) {
    compareSelected = [];
    document.querySelectorAll('.player-card.compare-selected').forEach(c => c.classList.remove('compare-selected'));
    hint.textContent = 'Select 2 players to compare';
  }
}

function selectForCompare(name) {
  const hint = document.getElementById('compareHint');
  const card = document.querySelector(`.player-card[data-player="${CSS.escape(name)}"]`);
  const idx = compareSelected.indexOf(name);
  if (idx >= 0) {
    compareSelected.splice(idx, 1);
    if (card) card.classList.remove('compare-selected');
  } else {
    if (compareSelected.length >= 2) return;
    compareSelected.push(name);
    if (card) card.classList.add('compare-selected');
    if (compareSelected.length === 2) {
      setTimeout(() => openH2HModal(compareSelected[0], compareSelected[1]), 200);
      return;
    }
  }
  if (compareSelected.length === 0) hint.textContent = 'Select 2 players to compare';
  else hint.textContent = `${compareSelected[0]} selected — pick one more`;
}

function calcH2H(nameA, nameB) {
  const matches = allMatches.filter(m => {
    if (m.score1 === '' || m.score2 === '' || isCancelled(m)) return false;
    return (m.player1 === nameA && m.player2 === nameB) ||
           (m.player1 === nameB && m.player2 === nameA);
  });
  // Sort newest first
  matches.sort((a, b) => {
    const da = a.date.split('.').reverse().join('') + (a.time || '');
    const db = b.date.split('.').reverse().join('') + (b.time || '');
    return db.localeCompare(da);
  });
  let aWins = 0, draws = 0, bWins = 0, aGf = 0, aGa = 0;
  for (const m of matches) {
    const aIsP1 = m.player1 === nameA;
    const aG = aIsP1 ? +m.score1 : +m.score2;
    const bG = aIsP1 ? +m.score2 : +m.score1;
    aGf += aG; aGa += bG;
    if (aG > bG) aWins++; else if (aG === bG) draws++; else bWins++;
  }
  return { matches, aWins, draws, bWins, aGf, aGa, total: matches.length };
}

function openH2HModal(nameA, nameB) {
  const sA = calcPlayerStats(nameA);
  const sB = calcPlayerStats(nameB);
  const h2h = calcH2H(nameA, nameB);
  const colorA = playerAvatarColor(nameA);
  const colorB = playerAvatarColor(nameB);

  function ini(name) {
    return name.replace(/[^A-Za-z0-9Ѐ-ӿ]/g, ' ').trim()
      .split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase()
      || name.slice(0, 2).toUpperCase();
  }

  function playerPhoto(name, color) {
    const src = `../assets/players/${name}.png`;
    return `
      <div class="h2h-player">
        <div class="h2h-photo-wrap" style="--pc-color:${color}">
          <img class="h2h-photo-img" src="${src}" alt="${name}"
               onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
          <div class="h2h-photo-avatar" style="background:${color};display:none">${ini(name)}</div>
        </div>
        <div class="h2h-player-name">${name}</div>
      </div>`;
  }

  // Stat comparison row: value A | bar | value B
  function statRow(label, valA, valB, higherIsBetter = true) {
    const numA = parseFloat(valA) || 0;
    const numB = parseFloat(valB) || 0;
    const total = numA + numB;
    const pctA = total > 0 ? (numA / total * 100) : 50;
    const pctB = total > 0 ? (numB / total * 100) : 50;
    const aWins = higherIsBetter ? numA > numB : numA < numB;
    const bWins = higherIsBetter ? numB > numA : numB < numA;
    return `
      <div class="cmp-row">
        <span class="cmp-val ${aWins ? 'cmp-winner' : ''}">${valA}</span>
        <div class="cmp-center">
          <div class="cmp-bar">
            <div class="cmp-bar-a" style="width:${pctA}%"></div>
            <div class="cmp-bar-b" style="width:${pctB}%"></div>
          </div>
          <span class="cmp-label">${label}</span>
        </div>
        <span class="cmp-val right ${bWins ? 'cmp-winner' : ''}">${valB}</span>
      </div>`;
  }

  const wrA = sA.matches ? (sA.wins / sA.matches * 100).toFixed(1) + '%' : '—';
  const wrB = sB.matches ? (sB.wins / sB.matches * 100).toFixed(1) + '%' : '—';
  const avgA = sA.matches ? (sA.gf / sA.matches).toFixed(2) : '—';
  const avgB = sB.matches ? (sB.gf / sB.matches).toFixed(2) : '—';
  const avgGaA = sA.matches ? (sA.ga / sA.matches).toFixed(2) : '—';
  const avgGaB = sB.matches ? (sB.ga / sB.matches).toFixed(2) : '—';
  const hdA = sA.matches ? ((sA.gf - sA.ga) / sA.matches).toFixed(2) : '—';
  const hdB = sB.matches ? ((sB.gf - sB.ga) / sB.matches).toFixed(2) : '—';

  // H2H section (if they've played each other)
  const tot = h2h.total;
  const h2hSection = tot ? (() => {
    const aPct = Math.round(h2h.aWins / tot * 100);
    const dPct = Math.round(h2h.draws / tot * 100);
    const bPct = 100 - aPct - dPct;
    const matchRows = h2h.matches.slice(0, 15).map(m => {
      const aIsP1 = m.player1 === nameA;
      const aG = aIsP1 ? +m.score1 : +m.score2;
      const bG = aIsP1 ? +m.score2 : +m.score1;
      const aTeam = aIsP1 ? m.team1 : m.team2;
      const bTeam = aIsP1 ? m.team2 : m.team1;
      const cls = aG > bG ? 'a-win' : bG > aG ? 'b-win' : 'draw';
      return `
        <div class="h2h-match-row">
          <span class="h2h-match-date">${m.date}${m.time ? ' · ' + m.time : ''}</span>
          <span class="h2h-match-teams">${aTeam} <span class="h2h-match-vs">vs</span> ${bTeam}</span>
          <span class="h2h-match-score ${cls}">${aG} : ${bG}</span>
          <span class="tournament-badge" data-color="${tournamentColor(m.tournament)}">${m.tournament}</span>
        </div>`;
    }).join('');
    return `
      <div class="cmp-section-title">Head to Head · ${tot} match${tot !== 1 ? 'es' : ''}</div>
      <div class="h2h-bar-section" style="padding:0 0 0.75rem">
        <div class="h2h-bar">
          <div class="h2h-bar-a" style="width:${aPct}%"></div>
          <div class="h2h-bar-d" style="width:${dPct}%"></div>
          <div class="h2h-bar-b" style="width:${bPct}%"></div>
        </div>
        <div class="h2h-bar-legend">
          <span style="color:var(--primary)">${h2h.aWins}W · ${aPct}%</span>
          <span style="color:oklch(0.78 0.12 60)">${h2h.draws}D</span>
          <span style="color:oklch(0.65 0.18 20)">${h2h.bWins}W · ${bPct}%</span>
        </div>
      </div>
      <div class="h2h-matches-title" style="margin-top:0.25rem">Match history</div>
      ${matchRows}`;
  })() : '';

  document.getElementById('h2hBody').innerHTML = `
    <div class="h2h-players">
      ${playerPhoto(nameA, colorA)}
      <div class="h2h-vs-badge">VS</div>
      ${playerPhoto(nameB, colorB)}
    </div>
    <div class="h2h-matches-wrap">
      <div class="cmp-section-title">Overall stats</div>
      ${statRow('Matches', sA.matches, sB.matches)}
      ${statRow('Win rate', parseFloat(wrA)||0, parseFloat(wrB)||0)}
      ${statRow('Wins', sA.wins, sB.wins)}
      ${statRow('Draws', sA.draws, sB.draws)}
      ${statRow('Losses', sA.losses, sB.losses, false)}
      ${statRow('Goals scored', sA.gf, sB.gf)}
      ${statRow('Goals conceded', sA.ga, sB.ga, false)}
      ${statRow('Avg scored / game', parseFloat(avgA)||0, parseFloat(avgB)||0)}
      ${statRow('Avg conceded / game', parseFloat(avgGaA)||0, parseFloat(avgGaB)||0, false)}
      ${statRow('Goal diff / game', parseFloat(hdA)||-999, parseFloat(hdB)||-999)}
      ${h2hSection}
    </div>
  `;

  document.getElementById('h2hModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeH2HModal() {
  document.getElementById('h2hModal').classList.remove('open');
  document.body.style.overflow = '';
  // Reset compare selection so user can pick again without re-toggling compare mode
  compareSelected = [];
  document.querySelectorAll('.player-card.compare-selected').forEach(c => c.classList.remove('compare-selected'));
  const hint = document.getElementById('compareHint');
  if (hint) hint.textContent = 'Select 2 players to compare';
}

/* ── State ── */
let allPlayers  = []; // [{ name, stats }]
let searchQuery = '';
let sortBy      = 'alpha';
let currentPage = 1;
const PAGE_SIZE = 24;

function getFiltered() {
  let list = allPlayers;
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(p => p.name.toLowerCase().includes(q));
  }
  list = [...list].sort((a, b) => {
    if (sortBy === 'alpha')    return a.name.localeCompare(b.name);
    if (sortBy === 'matches')  return b.stats.matches  - a.stats.matches;
    if (sortBy === 'wins')     return b.stats.wins     - a.stats.wins;
    if (sortBy === 'winrate') {
      const wa = a.stats.matches ? a.stats.wins / a.stats.matches : 0;
      const wb = b.stats.matches ? b.stats.wins / b.stats.matches : 0;
      return wb - wa;
    }
    if (sortBy === 'gf')       return b.stats.gf       - a.stats.gf;
    return 0;
  });
  return list;
}

function renderPagination(totalPages) {
  const el = document.getElementById('playersPagination');
  if (!el) return;
  if (totalPages <= 1) { el.innerHTML = ''; return; }

  const WING = 2;
  const pages = [];
  pages.push(1);
  if (currentPage - WING > 2) pages.push('…');
  for (let p = Math.max(2, currentPage - WING); p <= Math.min(totalPages - 1, currentPage + WING); p++) pages.push(p);
  if (currentPage + WING < totalPages - 1) pages.push('…');
  if (totalPages > 1) pages.push(totalPages);

  el.innerHTML =
    `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="playersGoPage(${currentPage - 1})">‹</button>` +
    pages.map(p =>
      p === '…'
        ? `<span class="page-ellipsis">…</span>`
        : `<button class="page-btn${p === currentPage ? ' active' : ''}" onclick="playersGoPage(${p})">${p}</button>`
    ).join('') +
    `<button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="playersGoPage(${currentPage + 1})">›</button>`;
}

window.playersGoPage = function(p) {
  currentPage = p;
  renderGrid();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

function renderGrid() {
  const grid    = document.getElementById('playersGrid');
  const countEl = document.getElementById('playersCount');
  const list    = getFiltered();

  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * PAGE_SIZE;
  const page  = list.slice(start, start + PAGE_SIZE);

  countEl.textContent = `${list.length} player${list.length !== 1 ? 's' : ''} · page ${currentPage} of ${totalPages}`;

  if (!page.length) {
    grid.innerHTML = '<div class="players-empty">No players found.</div>';
    renderPagination(0);
    return;
  }
  grid.innerHTML = page.map((p, i) => renderCard(p.name, p.stats, start + i + 1)).join('');
  renderPagination(totalPages);
}

/* ── Roster parsing ── */
// Returns an ordered array of player names from the roster CSV.
// Looks for columns named nick / nickname / player / name; falls back to column 0.
function parseRoster(text) {
  const rows = parseCSV(text);
  if (!rows.length) return [];

  const header = rows[0].map(c => c.toLowerCase().trim());
  const col = ['nick', 'nickname', 'player', 'name'].reduce((found, key) => {
    if (found >= 0) return found;
    const idx = header.indexOf(key);
    return idx >= 0 ? idx : found;
  }, -1);
  const nameCol = col >= 0 ? col : 0;           // fallback: first column
  const dataStart = header.some(h => ['nick','nickname','player','name'].includes(h)) ? 1 : 0;

  return rows.slice(dataStart)
    .map(r => (r[nameCol] || '').trim())
    .filter(Boolean);
}

/* ── Build allPlayers from roster ── */
// Each entry = { name, stats } — stats are 0 if player hasn't played yet.
function buildPlayersFromRoster(rosterNames) {
  allPlayers = rosterNames.map(name => ({ name, stats: calcPlayerStats(name) }));
}

/* ── Init ── */
async function init() {
  const grid = document.getElementById('playersGrid');

  // ── 1. Show cached data instantly if available ──────────────────────────
  let hasCached = false;
  try {
    const cachedMatches = localStorage.getItem(CACHE_KEY);
    const cachedRoster  = localStorage.getItem(ROSTER_CACHE_KEY);
    if (cachedMatches && cachedRoster) {
      applyFromCache(JSON.parse(cachedMatches));
      const rosterNames = parseRoster(cachedRoster);
      buildPlayersFromRoster(rosterNames);
      renderGrid();
      hasCached = true;
    }
  } catch (e) { /* corrupt cache */ }

  if (!hasCached) {
    grid.innerHTML = '<div class="loading-state"><span class="loading-dot"></span><span class="loading-dot"></span><span class="loading-dot"></span></div>';
  }

  // ── 2. Fetch sources config, then all sheets + roster in parallel ─────────
  try {
    const sources = await fetch(SOURCES_URL + '?_=' + Date.now()).then(r => r.json());
    // Support new { months:[{label, groups:[{url,label}]}] } and legacy { matches:[...] }
    const entries = sources.months
      ? sources.months.flatMap(month =>
          (month.groups || []).map(g => ({ url: g.url, label: g.label, monthLabel: month.label }))
        )
      : (sources.matches || []).map(s =>
          typeof s === 'string' ? { url: s, label: null, monthLabel: null } : { ...s, monthLabel: null }
        );
    const cb = '&_=' + Date.now();

    const [matchResults, rosterText] = await Promise.all([
      Promise.allSettled(
        entries.map(e =>
          fetch(e.url + cb).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
        )
      ),
      fetch(sources.roster + cb)
        .then(r => { if (!r.ok) throw new Error('roster HTTP ' + r.status); return r.text(); }),
    ]);

    const matchArrays = matchResults.map((res, i) => {
      if (res.status === 'rejected') {
        console.warn(`[sources] Failed to load "${entries[i].label || entries[i].url}":`, res.reason.message);
        return [];
      }
      return parseOneCSV(res.value).map(m => ({
        ...m,
        _source:     entries[i].label      || null,
        _monthLabel: entries[i].monthLabel || null,
      }));
    });
    applyMerged(matchArrays);

    // Cache merged result + roster
    try { localStorage.setItem(CACHE_KEY,        JSON.stringify(allMatches)); } catch(e) {}
    try { localStorage.setItem(ROSTER_CACHE_KEY, rosterText);                 } catch(e) {}

    const rosterNames = parseRoster(rosterText);
    buildPlayersFromRoster(rosterNames);
    renderGrid();

  } catch (err) {
    if (!hasCached) {
      grid.innerHTML = `<div class="players-empty">Could not load players: ${err.message}</div>`;
      return;
    }
    console.warn('Background refresh failed:', err);
  }

  // ── 3. Wire up events (only once) ────────────────────────────────────────
  document.getElementById('playerSearch').addEventListener('input', e => {
    searchQuery = e.target.value.trim();
    currentPage = 1;
    renderGrid();
  });
  document.getElementById('sortSelect').addEventListener('change', e => {
    sortBy = e.target.value;
    currentPage = 1;
    renderGrid();
  });
  document.getElementById('playersGrid').addEventListener('click', e => {
    const card = e.target.closest('.player-card');
    if (!card) return;
    if (compareMode) selectForCompare(card.dataset.player);
    else openPlayerModal(card.dataset.player);
  });
  document.getElementById('modalBackdrop').addEventListener('click', closeModal);
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('compareBtn').addEventListener('click', toggleCompareMode);
  document.getElementById('h2hBackdrop').addEventListener('click', closeH2HModal);
  document.getElementById('h2hClose').addEventListener('click', closeH2HModal);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeModal(); closeH2HModal(); }
  });
}

document.addEventListener('DOMContentLoaded', init);
