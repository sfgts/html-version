const SOURCES_URL = '../assets/sources.json';

const DATE_RE  = /^\d{2}\.\d{2}\.\d{4}$/;
const PAGE_SIZE = 80;

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
  // Match any of the given aliases
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

function v(row, i) { return i >= 0 && row[i] !== undefined ? row[i].trim() : ''; }

function sheetDateToTs(d) {
  const [dd, mm, yyyy] = d.split('.');
  return new Date(+yyyy, +mm - 1, +dd).getTime();
}

function inputDateToTs(d) {
  if (!d) return null;
  const [yyyy, mm, dd] = d.split('-');
  return new Date(+yyyy, +mm - 1, +dd).getTime();
}

function normTime(t) {
  if (!t) return '';
  const p = t.split(':');
  return p[0].padStart(2, '0') + ':' + (p[1] || '00').padStart(2, '0');
}

// Tournament day starts at 07:00. Matches before 07:00 belong to the previous calendar day.
const DAY_START_HOUR = 7;

function matchDayKey(m) {
  const t = normTime(m.time);
  const before7 = t && t < `${String(DAY_START_HOUR).padStart(2,'0')}:00`;
  if (!before7) return m.date;
  // shift back one calendar day
  const [dd, mm, yyyy] = m.date.split('.');
  const prev = new Date(+yyyy, +mm - 1, +dd - 1);
  return String(prev.getDate()).padStart(2,'0') + '.' +
         String(prev.getMonth()+1).padStart(2,'0') + '.' +
         prev.getFullYear();
}

const MATCH_DURATION_MS = 12 * 60 * 1000; // 12 minutes

function matchStartTs(m) {
  if (!m.date || !m.time) return null;
  const [dd, mm, yyyy] = m.date.split('.');
  const [hh, mn, ss]   = m.time.split(':');
  return new Date(+yyyy, +mm - 1, +dd, +hh, +mn, +(ss || 0)).getTime();
}

function matchStatus(m) {
  const start = matchStartTs(m);
  if (start === null) return 'scheduled';
  const now = Date.now();
  const hasScore = m.score1 !== '' && m.score2 !== '' && !isCancelled(m);
  if (now >= start + MATCH_DURATION_MS) {
    // time passed — only "finished" if score is actually recorded
    return hasScore ? 'finished' : null;
  }
  if (now >= start) return 'live';
  return 'scheduled';
}

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

function isCancelled(m) {
  if (m.score1 === '' || m.score2 === '') return false;
  return isNaN(+m.score1) || isNaN(+m.score2);
}

function fmtHcap(v) {
  if (v === null) return '—';
  const n = v.toFixed(2);
  return v > 0 ? '+' + n : n;
}

function modalStatsBlock(s) {
  return `
    <div class="modal-goals-row">
      <div class="modal-goals-item"><span class="modal-goals-val">${s.gf}</span><span class="modal-goals-lbl">Goals scored</span></div>
      <div class="modal-goals-sep"></div>
      <div class="modal-goals-item"><span class="modal-goals-val">${s.ga}</span><span class="modal-goals-lbl">Goals conceded</span></div>
      <div class="modal-goals-sep"></div>
      <div class="modal-goals-item"><span class="modal-goals-val">${s.matches ? (s.gf / s.matches).toFixed(1) : '—'}</span><span class="modal-goals-lbl">Avg scored</span></div>
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
        <span class="modal-goals-val">${s.matches ? ((s.gf - s.ga) / s.matches).toFixed(2) : '—'}</span>
        <span class="modal-goals-lbl">Goal diff/game</span>
      </div>
    </div>`;
}

function calcPlayerStats(name) {
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
    handicap += myG - thG;
    total += myG + thG;
    if (myG > thG) wins++; else if (myG === thG) draws++; else losses++;

    if (!byT[m.tournament]) byT[m.tournament] = { w: 0, d: 0, l: 0 };
    const t = byT[m.tournament];
    if (myG > thG) t.w++; else if (myG === thG) t.d++; else t.l++;
  }
  return { matches, wins, draws, losses, gf, ga, byT,
    avgHandicap: matches ? handicap / matches : null,
    avgTotal:    matches ? total    / matches : null };
}

function playerAvatarColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return `oklch(0.58 0.2 ${Math.abs(h) % 360})`;
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

  const avatarColor = playerAvatarColor(name);
  const initials = name.replace(/[^A-Za-z0-9Ѐ-ӿ]/g, ' ').trim()
    .split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || name.slice(0, 2).toUpperCase();

  // Add photo column
  const modalCard = document.querySelector('.modal-card');
  modalCard.style.setProperty('--modal-pc-color', avatarColor);
  let photoCol = modalCard.querySelector('.modal-photo-col');
  if (!photoCol) {
    photoCol = document.createElement('div');
    photoCol.className = 'modal-photo-col';
    modalCard.appendChild(photoCol);
  }
  photoCol.innerHTML = `
    <img class="modal-photo-img" src="../assets/players/${name}.png" alt="${name}"
         onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
    <div class="modal-photo-avatar" style="background:${avatarColor};display:none">${initials}</div>
  `;

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
      <div class="modal-goals-item"><span class="modal-goals-val">${matches ? (gf/matches).toFixed(1) : '—'}</span><span class="modal-goals-lbl">Avg scored</span></div>
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
        <span class="modal-goals-val">${matches ? ((gf-ga)/matches).toFixed(2) : '—'}</span>
        <span class="modal-goals-lbl">Goal diff/game</span>
      </div>
    </div>
    ${Object.keys(byT).length ? `
    <div class="modal-tour-section">
      <div class="modal-tour-title">Tournaments</div>
      <div class="modal-tour-badges">
        ${Object.entries(byT)
          .sort((a, b) => (b[1].w+b[1].d+b[1].l) - (a[1].w+a[1].d+a[1].l))
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
  document.querySelector('.modal-photo-col')?.remove();
  const modalBody = document.getElementById('modalBody');
  if (modalBody) modalBody.className = '';
}

function calcTeamStats(name) {
  const byT = {};
  let matches = 0, wins = 0, draws = 0, losses = 0, gf = 0, ga = 0, handicap = 0, total = 0;

  for (const m of allMatches) {
    const isT1 = m.team1 === name, isT2 = m.team2 === name;
    if (!isT1 && !isT2) continue;
    if (m.score1 === '' || m.score2 === '') continue;
    if (isCancelled(m)) continue;

    const myG = isT1 ? +m.score1 : +m.score2;
    const thG = isT1 ? +m.score2 : +m.score1;

    matches++; gf += myG; ga += thG;
    handicap += myG - thG;
    total += myG + thG;
    if (myG > thG) wins++; else if (myG === thG) draws++; else losses++;

    if (!byT[m.tournament]) byT[m.tournament] = { w: 0, d: 0, l: 0 };
    const t = byT[m.tournament];
    if (myG > thG) t.w++; else if (myG === thG) t.d++; else t.l++;
  }
  return { matches, wins, draws, losses, gf, ga, byT,
    avgHandicap: matches ? handicap / matches : null,
    avgTotal:    matches ? total    / matches : null };
}

function teamAvatarColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return `oklch(0.58 0.2 ${Math.abs(h) % 360})`;
}

function openTeamModal(name) {
  const s = calcTeamStats(name);
  const wPct = s.matches ? (s.wins   / s.matches * 100).toFixed(0) : 0;
  const dPct = s.matches ? (s.draws  / s.matches * 100).toFixed(0) : 0;
  const lPct = s.matches ? (s.losses / s.matches * 100).toFixed(0) : 0;

  const avatarColor = teamAvatarColor(name);
  const initials = name.replace(/[^A-Za-z0-9]/g, ' ').trim()
    .split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || name.slice(0, 2).toUpperCase();

  // Add logo column — same pattern as player photo
  const modalCard = document.querySelector('.modal-card');
  modalCard.style.setProperty('--modal-pc-color', avatarColor);
  let photoCol = modalCard.querySelector('.modal-photo-col');
  if (!photoCol) {
    photoCol = document.createElement('div');
    photoCol.className = 'modal-photo-col';
    modalCard.appendChild(photoCol);
  }
  photoCol.innerHTML = `
    <img class="modal-photo-img modal-team-logo" src="../assets/teams/${name}.png" alt="${name}"
         onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
    <div class="modal-photo-avatar" style="background:${avatarColor};display:none">${initials}</div>
  `;

  const modalBody = document.getElementById('modalBody');
  modalBody.className = 'modal-stats-col';

  const tourRows = Object.entries(s.byT)
    .sort((a, b) => (b[1].w + b[1].d + b[1].l) - (a[1].w + a[1].d + a[1].l))
    .map(([t, r]) => {
      const total = r.w + r.d + r.l;
      const color = tournamentColor(t);
      return `
        <div class="modal-tour-row">
          <span class="tournament-badge" data-color="${color}">${t}</span>
          <div class="modal-tour-wdl">
            <span class="wdl-w">${r.w}W</span>
            <span class="wdl-d">${r.d}D</span>
            <span class="wdl-l">${r.l}L</span>
          </div>
          <span class="modal-tour-total">${total} games</span>
        </div>`;
    }).join('');

  modalBody.innerHTML = `
    <div class="modal-player-name">${name}</div>
    <div class="modal-subtitle">${s.matches} matches played</div>
    <div class="modal-stats-row">
      <div class="modal-stat win"><div class="modal-stat-val">${s.wins}</div><div class="modal-stat-label">Wins</div></div>
      <div class="modal-stat draw"><div class="modal-stat-val">${s.draws}</div><div class="modal-stat-label">Draws</div></div>
      <div class="modal-stat loss"><div class="modal-stat-val">${s.losses}</div><div class="modal-stat-label">Losses</div></div>
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
    ${modalStatsBlock(s)}
    ${tourRows ? `<div class="modal-tour-title">By tournament</div><div class="modal-tour-list">${tourRows}</div>` : ''}
  `;

  document.getElementById('playerModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function renderCard(m) {
  const cancelled = isCancelled(m);
  const hasFT  = !cancelled && m.score1 !== '' && m.score2 !== '';
  const hasHT  = !cancelled && m.half1  !== '' && m.half2  !== '';
  const winner = hasFT ? (+m.score1 > +m.score2 ? 1 : +m.score2 > +m.score1 ? 2 : 0) : 0;
  const color  = tournamentColor(m.tournament);
  const status = cancelled ? 'cancelled' : matchStatus(m);
  const statusHTML = {
    live:      `<span class="match-status live"><span class="status-dot"></span>LIVE</span>`,
    finished:  `<span class="match-status finished">Finished</span>`,
    scheduled: `<span class="match-status scheduled">Scheduled</span>`,
    cancelled: '',
    null:      '',
  }[status] ?? '';
  return `
    <div class="match-card${cancelled ? ' cancelled' : ''}" data-tournament="${m.tournament}">
      <div class="match-header">
        <span class="tournament-badge" data-color="${color}">${m.tournament}</span>
        ${statusHTML}
        <span class="match-datetime">${m.date} · ${m.time}</span>
      </div>
      ${cancelled ? `<div class="cancelled-label">Cancelled</div>` : ''}
      <div class="match-body">
        <div class="match-side${winner === 1 ? ' winner' : ''}">
          <span class="match-player player-link" data-player="${m.player1}">${m.player1}</span>
          <span class="match-team team-link" data-team="${m.team1}">${m.team1}</span>
        </div>
        <div class="match-score-block">
          <div class="match-score">
            <span class="score-num${winner === 1 ? ' winner' : ''}">${hasFT ? m.score1 : '—'}</span>
            <span class="score-sep">:</span>
            <span class="score-num${winner === 2 ? ' winner' : ''}">${hasFT ? m.score2 : '—'}</span>
          </div>
          ${hasHT ? `<div class="score-ht">${m.half1}:${m.half2}</div>` : ''}
        </div>
        <div class="match-side right${winner === 2 ? ' winner' : ''}">
          <span class="match-player player-link" data-player="${m.player2}">${m.player2}</span>
          <span class="match-team team-link" data-team="${m.team2}">${m.team2}</span>
        </div>
      </div>
    </div>`;
}

function renderPagination(totalPages) {
  const el = document.getElementById('pagination');
  if (!el || totalPages <= 1) { if (el) el.innerHTML = ''; return; }

  const pages = [];
  const WING = 2;

  pages.push(1);
  if (currentPage - WING > 2) pages.push('…');
  for (let p = Math.max(2, currentPage - WING); p <= Math.min(totalPages - 1, currentPage + WING); p++) pages.push(p);
  if (currentPage + WING < totalPages - 1) pages.push('…');
  if (totalPages > 1) pages.push(totalPages);

  el.innerHTML =
    `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="goPage(${currentPage - 1})">‹</button>` +
    pages.map(p =>
      p === '…'
        ? `<span class="page-ellipsis">…</span>`
        : `<button class="page-btn${p === currentPage ? ' active' : ''}" onclick="goPage(${p})">${p}</button>`
    ).join('') +
    `<button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="goPage(${currentPage + 1})">›</button>`;
}

/* ── Leagues ── */

function teamAvatarColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  const hue = Math.abs(h) % 360;
  return `oklch(0.62 0.18 ${hue})`;
}

function computeLeaguesForDate(date, matches = allMatches) {
  const leagues = {};

  // Pass 1: register EVERY tournament that has any match today (even unscored/live ones)
  // and track the latest match timestamp for sorting — "most recent time = shown first"
  for (const m of matches) {
    if (matchDayKey(m) !== date || !m.tournament) continue;
    if (!leagues[m.tournament]) {
      leagues[m.tournament] = { teams: {}, times: [], latestTs: -Infinity, active: false };
    }
    const ts = matchStartTs(m);
    if (ts !== null && ts > leagues[m.tournament].latestTs) leagues[m.tournament].latestTs = ts;
    const st = matchStatus(m);
    if (st === 'live' || st === 'scheduled') leagues[m.tournament].active = true;
  }

  // Pass 2: fill standings from completed matches only
  for (const m of matches) {
    if (matchDayKey(m) !== date || !m.tournament) continue;
    if (m.score1 === '' || m.score2 === '') continue;
    if (isCancelled(m)) continue;
    const t = m.tournament;
    const s1 = +m.score1, s2 = +m.score2;
    if (m.time) leagues[t].times.push(normTime(m.time));
    for (const [team, player, myG, thG] of [
      [m.team1, m.player1, s1, s2],
      [m.team2, m.player2, s2, s1],
    ]) {
      if (!team) continue;
      if (!leagues[t].teams[team]) leagues[t].teams[team] = { w:0,d:0,l:0,gf:0,ga:0,players:{} };
      const r = leagues[t].teams[team];
      r.gf += myG; r.ga += thG;
      r.players[player] = (r.players[player] || 0) + 1;
      if (myG > thG) r.w++; else if (myG === thG) r.d++; else r.l++;
    }
  }
  return leagues;
}

function leagueBlockHTML(tournament, data) {
  const rows = Object.entries(data.teams)
    .map(([team, s]) => {
      const played = s.w + s.d + s.l;
      const pts = s.w * 3 + s.d;
      const gd  = s.gf - s.ga;
      const player = Object.entries(s.players).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
      return { team, s, played, pts, gd, player };
    })
    .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.s.gf - a.s.gf);

  const times = [...new Set(data.times)].sort();
  const timeRange = times.length ? `${times[0]} – ${times[times.length - 1]}` : '';
  const teamCount = rows.length;
  const matchCount = rows.reduce((s, r) => s + r.played, 0) / 2;

  // Status badge shown on each block individually
  const statusBadge = data.active
    ? `<span class="match-status live" style="font-size:0.65rem;padding:0.2rem 0.55rem"><span class="status-dot"></span>IN PROGRESS</span>`
    : '';

  const tableRows = rows.map((r, i) => {
    const isTop = i < 3;
    const initials = r.team.replace(/[^A-Za-z0-9]/g, ' ').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
    const avatarColor = teamAvatarColor(r.team);
    return `
      <tr class="${isTop ? 'top-3' : ''}">
        <td class="rank">${i + 1}</td>
        <td>
          <div class="team-cell-inner">
            <span class="team-avatar" style="background:${avatarColor}">${initials}</span>
            <span class="team-name-cell">${r.team}</span>
          </div>
        </td>
        <td class="player-name-cell">${r.player}</td>
        <td class="center">${r.s.w}</td>
        <td class="center">${r.s.d}</td>
        <td class="center">${r.s.l}</td>
        <td class="goals-cell center">${r.s.gf}-${r.s.ga}</td>
        <td class="pts-cell">${r.pts}</td>
      </tr>`;
  }).join('');

  const tableOrPlaceholder = rows.length > 0
    ? `<table class="league-table">
        <thead>
          <tr>
            <th class="center">#</th>
            <th>Team</th>
            <th>Player</th>
            <th class="center">W</th>
            <th class="center">D</th>
            <th class="center">L</th>
            <th class="center">Goals</th>
            <th class="center">Pts</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>`
    : `<div style="padding:1rem 0.5rem;font-size:0.8rem;color:var(--muted-foreground)">Waiting for results…</div>`;

  return `
    <div class="league-block">
      <div class="league-block-header">
        <div class="league-block-name">${tournament}</div>
        <div class="league-block-meta">
          ${statusBadge}
          ${timeRange ? `<span>🕐 ${timeRange}</span>` : ''}
          ${rows.length > 0 ? `<span>${teamCount} teams · ${Math.round(matchCount)} matches</span>` : ''}
        </div>
      </div>
      ${tableOrPlaceholder}
    </div>`;
}

// renderLeagues and leagueGoDay are defined in tournament.js (loaded after this file)

// Read initial view from URL hash
let activeView = (location.hash === '#bracket') ? 'results' : 'leagues';

function switchView(view) {
  activeView = view;
  // Save to URL hash so refresh restores the same tab
  location.hash = (view === 'results') ? 'bracket' : 'group';
  document.querySelectorAll('.view-tab').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  const showResults = view === 'results';
  document.getElementById('resultsSection').style.display = showResults ? '' : 'none';
  document.getElementById('leaguesSection').style.display = showResults ? 'none' : '';
  // Show/hide Results-only rows inside the lf-panel
  document.querySelectorAll('.lf-results-only').forEach(el => {
    el.style.display = showResults ? '' : 'none';
  });
  if (view === 'leagues') renderLeagues();
  else if (view === 'results') render();
}

function applyFilters() {
  const dfTs = inputDateToTs(document.getElementById('dateFrom')?.value);
  const dtTs = inputDateToTs(document.getElementById('dateTo')?.value);

  return allMatches.filter(m => {
    if (activeSource !== 'all' && m._source !== activeSource) return false;
    if (activeMonth  !== 'all' && matchMonthKey(m) !== activeMonth) return false;
    if (activeFilter !== 'all' && m.tournament !== activeFilter) return false;
    const mTs = sheetDateToTs(m.date);
    if (dfTs !== null && mTs < dfTs) return false;
    if (dtTs !== null && mTs > dtTs) return false;
    return true;
  });
}

let allMatches    = [];
let activeFilter  = 'all';
let activeMonth   = 'all';
let activeSource  = 'all';
let currentPage   = 1;
let dataReady     = false; // true once first paint (cache or fetch) is done

const CACHE_KEY = 'esb_matches_v7';

window.goPage = function(p) {
  currentPage = p;
  render();
  window.scrollTo({ top: document.getElementById('resultsGrid').offsetTop - 80, behavior: 'smooth' });
};

function render() {
  const grid    = document.getElementById('resultsGrid');
  const countEl = document.getElementById('resultsCount');

  if (!dataReady) {
    const dots = '<span class="loading-dot"></span><span class="loading-dot"></span><span class="loading-dot"></span>';
    grid.innerHTML = `<div class="loading-state">${dots}</div>`;
    if (countEl) countEl.textContent = '';
    return;
  }

  const filtered = applyFilters();
  // strict document order: last row in sheet → first card on site
  filtered.sort((a, b) => b._idx - a._idx);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * PAGE_SIZE;
  const page  = filtered.slice(start, start + PAGE_SIZE);

  if (countEl) countEl.textContent = `${filtered.length} matches · page ${currentPage} of ${totalPages}`;

  const lfPanelEl = document.getElementById('lfPanel');
  if (!filtered.length) {
    grid.innerHTML = '';
    if (countEl) countEl.textContent = '';
    if (lfPanelEl) lfPanelEl.style.display = 'none';
    return;
  }
  if (lfPanelEl) lfPanelEl.style.display = '';
  grid.innerHTML = page.map(renderCard).join('');

  renderPagination(totalPages);
}

function resetPage() { currentPage = 1; render(); }

// ── Parse a single CSV text → array of match objects (no side effects) ───────
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
      date: v(r, cols.date), tournament: v(r, cols.tournament), time: v(r, cols.time),
      team1: v(r, cols.team1), team2: v(r, cols.team2),
      player1: v(r, cols.player1), player2: v(r, cols.player2),
      score1: v(r, cols.score1), score2: v(r, cols.score2),
      half1: v(r, cols.half1), half2: v(r, cols.half2),
    }));
}

// Dedup key: sort players so A-vs-B and B-vs-A are treated identically
function dedupeKey(m) {
  const [p1, p2] = [m.player1, m.player2].sort();
  return `${m.date}|${m.time}|${p1}|${p2}`;
}

// ── Merge arrays from multiple sources, deduplicate, assign _idx ─────────────
function applyMerged(arrays) {
  const seen = new Set();
  const merged = [];
  for (const arr of arrays) {
    for (const m of arr) {
      const key = dedupeKey(m);
      if (!seen.has(key)) { seen.add(key); merged.push(m); }
    }
  }
  // Preserve strict document order — _idx = row position across all sources
  // render() sorts by b._idx - a._idx so last row in sheet = first card on page
  allMatches = merged.map((m, i) => ({ ...m, _idx: i }));
  leagueDays = [...new Set(allMatches.map(m => matchDayKey(m)))]
    .filter(Boolean)
    .sort((a, b) => sheetDateToTs(b) - sheetDateToTs(a));
}

// ── Restore from cached JSON (already merged + deduped) ──────────────────────
function applyFromCache(data) {
  allMatches = data;
  leagueDays = [...new Set(allMatches.map(m => matchDayKey(m)))]
    .filter(Boolean)
    .sort((a, b) => sheetDateToTs(b) - sheetDateToTs(a));
}

// ── Flatten sources config → flat entries array ───────────────────────────────
// Supports new format: { months: [{ label, groups: [{url, label}] }] }
// Also supports legacy: { matches: [{url, label}] }
function flattenSources(sources) {
  if (sources.months) {
    const entries = [];
    for (const month of sources.months) {
      for (const group of (month.groups || [])) {
        entries.push({ url: group.url, label: group.label, monthLabel: month.label });
      }
    }
    return entries;
  }
  // legacy fallback
  return (sources.matches || []).map(s =>
    typeof s === 'string' ? { url: s, label: null, monthLabel: null } : { ...s, monthLabel: null }
  );
}

// ── Month order from sources config (newest first = first in months array) ────
let monthOrder = []; // array of month label strings in display order

// ── Fetch all match sheets in parallel, merge, cache ─────────────────────────
async function fetchAndUpdate(sources) {
  const cb = '&_=' + Date.now();
  const entries = flattenSources(sources);
  // Store month order for refreshMonthBar
  if (sources.months) {
    monthOrder = sources.months.map(m => m.label);
  }
  // allSettled — one bad URL doesn't kill the rest
  const results = await Promise.allSettled(
    entries.map(e =>
      fetch(e.url + cb)
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
    )
  );
  const arrays = results.map((res, i) => {
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
  applyMerged(arrays);
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(allMatches)); } catch(e) {}
}

// ── Month helpers ─────────────────────────────────────────────────────────────
// Uses _monthLabel if present (new format), otherwise computes from date
function matchMonthKey(m) {
  if (m._monthLabel) return m._monthLabel;
  // legacy fallback: compute from date "DD.MM.YYYY"
  const parts = m.date.split('.');
  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return MONTH_NAMES[+parts[1] - 1] + ' ' + parts[2];
}

function refreshMonthBar() {
  const bar = document.getElementById('monthBar');
  if (!bar) return;

  let months;
  if (monthOrder.length) {
    // Use JSON-defined order — only include months that actually have matches
    const present = new Set(allMatches.map(m => matchMonthKey(m)).filter(Boolean));
    months = monthOrder.filter(l => present.has(l));
  } else {
    // Legacy: sort newest-first by computing from date
    const keys = [...new Set(allMatches.map(m => matchMonthKey(m)).filter(Boolean))];
    const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    months = keys.sort((a, b) => {
      const toNum = s => { const [mn, yr] = s.split(' '); return +yr * 100 + MONTH_NAMES.indexOf(mn); };
      return toNum(b) - toNum(a);
    });
  }

  bar.innerHTML =
    `<button class="lf-btn${activeMonth === 'all' ? ' active-month' : ''}" data-month="all">All time</button>` +
    months.map(label =>
      `<button class="lf-btn${activeMonth === label ? ' active-month' : ''}" data-month="${label}">${label}</button>`
    ).join('');
}

function refreshSourceBar() {
  const bar = document.getElementById('sourceBar');
  const row = document.getElementById('lfSourceRow');
  const divider = document.getElementById('lfDivider');
  if (!bar) return;
  const sources = [...new Set(allMatches.map(m => m._source).filter(Boolean))];
  // Hide group row if only 1 or 0 sources
  if (row) row.dataset.count = sources.length;
  if (divider) divider.style.display = sources.length <= 1 ? 'none' : '';
  bar.innerHTML =
    `<button class="lf-btn${activeSource === 'all' ? ' active-group' : ''}" data-source="all">All groups</button>` +
    sources.map(s =>
      `<button class="lf-btn${activeSource === s ? ' active-group' : ''}" data-source="${s}">${s}</button>`
    ).join('');
}

// ── Update tournament bar in the lf-panel (Results view only) ────────────────
function refreshFilterBar() {
  const bar = document.getElementById('tournamentBar');
  if (!bar) return;
  const tournaments = [...new Set(allMatches.map(m => m.tournament).filter(Boolean))];
  bar.innerHTML =
    `<button class="lf-btn${activeFilter === 'all' ? ' active-filter' : ''}" data-filter="all">All</button>` +
    tournaments.map(t =>
      `<button class="lf-btn${activeFilter === t ? ' active-filter' : ''}" data-filter="${t}">${t}</button>`
    ).join('');
}

async function init() {
  const grid             = document.getElementById('resultsGrid');
  const leaguesContainer = document.getElementById('leaguesContainer');

  // ── Step 1: Try localStorage cache → instant first paint ─────────────────
  let hasCached = false;
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      applyFromCache(JSON.parse(cached));
      dataReady = true;
      refreshSourceBar();
      refreshMonthBar();
      refreshFilterBar();
      renderLeagues();
      hasCached = true;
    }
  } catch (e) { /* corrupt cache — ignore */ }

  // ── Step 2: Show loading skeleton only when there is no cache ────────────
  if (!hasCached) {
    const dots = '<span class="loading-dot"></span><span class="loading-dot"></span><span class="loading-dot"></span>';
    if (leaguesContainer) leaguesContainer.innerHTML = `<div class="loading-state">${dots}</div>`;
    grid.innerHTML = `<div class="loading-state">${dots}</div>`;
  }

  // ── Step 3: Fetch sources config, then all match sheets in parallel ───────
  try {
    const sources = await fetch(SOURCES_URL + '?_=' + Date.now()).then(r => r.json());
    // Init tournament group stage (tournament.js)
    if (typeof initTournament === 'function') initTournament(sources);
    await fetchAndUpdate(sources);
    dataReady = true;
    refreshSourceBar();
    refreshMonthBar();
    refreshFilterBar();
    if (activeView === 'results') render();
    else renderLeagues();
  } catch (err) {
    if (!hasCached) {
      const msg = `<div class="error-state">Could not load results: ${err.message}</div>`;
      grid.innerHTML = msg;
      if (leaguesContainer) leaguesContainer.innerHTML = msg;
      return;
    }
    console.warn('Background refresh failed:', err);
  }

  // Source (group) bar
  document.getElementById('sourceBar')?.addEventListener('click', e => {
    const btn = e.target.closest('.lf-btn');
    if (!btn) return;
    document.querySelectorAll('#sourceBar .lf-btn').forEach(b => b.classList.remove('active-group'));
    btn.classList.add('active-group');
    activeSource = btn.dataset.source;
    currentPage = 1;
    leagueDayIdx = 0;
    if (activeView === 'results') render();
    else renderLeagues();
  });

  // Month bar
  document.getElementById('monthBar')?.addEventListener('click', e => {
    const btn = e.target.closest('.lf-btn');
    if (!btn) return;
    document.querySelectorAll('#monthBar .lf-btn').forEach(b => b.classList.remove('active-month'));
    btn.classList.add('active-month');
    activeMonth = btn.dataset.month;
    currentPage = 1;
    leagueDayIdx = 0;
    if (activeView === 'results') render();
    else renderLeagues();
  });

  // Tournament bar (Results view)
  document.getElementById('tournamentBar')?.addEventListener('click', e => {
    const btn = e.target.closest('.lf-btn');
    if (!btn || !btn.dataset.filter) return;
    document.querySelectorAll('#tournamentBar .lf-btn').forEach(b => b.classList.remove('active-filter'));
    btn.classList.add('active-filter');
    activeFilter = btn.dataset.filter;
    resetPage();
  });

  ['dateFrom', 'dateTo'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', resetPage);
  });

  document.getElementById('clearFilters')?.addEventListener('click', () => {
    ['dateFrom', 'dateTo'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    document.querySelectorAll('#tournamentBar .lf-btn').forEach(b => b.classList.remove('active-filter'));
    document.querySelector('#tournamentBar [data-filter="all"]')?.classList.add('active-filter');
    activeFilter = 'all';
    resetPage();
  });

  document.getElementById('resultsGrid').addEventListener('click', e => {
    const playerLink = e.target.closest('.player-link');
    if (playerLink) { openPlayerModal(playerLink.dataset.player); return; }
    const teamLink = e.target.closest('.team-link');
    if (teamLink) openTeamModal(teamLink.dataset.team);
  });

  document.getElementById('modalBackdrop').addEventListener('click', closeModal);
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  document.querySelectorAll('.view-tab').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  // Populate both grids so switching tabs is instant
  render();
  renderLeagues();
}

document.addEventListener('DOMContentLoaded', () => {
  init();

  // Manual refresh — triggered by the refresh button in the header
  window.manualRefresh = async function() {
    const btn = document.getElementById('refreshBtn');
    if (btn) { btn.classList.add('spinning'); btn.disabled = true; }
    try {
      const sources = await fetch(SOURCES_URL + '?_=' + Date.now()).then(r => r.json());
      if (typeof initTournament === 'function') await initTournament(sources);
      await fetchAndUpdate(sources);
      dataReady = true;
      refreshSourceBar(); refreshMonthBar(); refreshFilterBar();
      if (activeView === 'results') render();
      else renderLeagues();
    } catch (e) {
      console.warn('Refresh failed:', e);
    } finally {
      if (btn) { btn.classList.remove('spinning'); btn.disabled = false; }
    }
  };

  // Auto-refresh — controlled by user via UI
  let autoRefreshTimer = null;
  window.setAutoRefresh = function(seconds) {
    if (autoRefreshTimer) { clearInterval(autoRefreshTimer); autoRefreshTimer = null; }
    // Update button states
    document.querySelectorAll('.ar-btn').forEach(b => b.classList.remove('active'));
    const activeBtn = document.querySelector(`.ar-btn[data-s="${seconds}"]`);
    if (activeBtn) activeBtn.classList.add('active');
    if (seconds > 0) {
      autoRefreshTimer = setInterval(() => {
        if (!document.hidden) window.manualRefresh();
      }, seconds * 1000);
    }
  };
});
