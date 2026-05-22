const SHEET_CSV = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTRthpqRg3mDNxyISDU9xMlnipaZulhUCb8enHnLNnPK3rQRq-xe3fX1gpPtMznkaQdjcdoDR2Vhdvf/pub?output=csv&gid=1202646627';

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
  const idx = k => h.findIndex(c => c.toLowerCase().replace(/\s+/g, ' ').trim() === k);
  let s1 = findNth(h, 'score 1', 1); if (s1 < 0) s1 = 7;
  let s2 = findNth(h, 'score 2', 1); if (s2 < 0) s2 = 8;
  let h1 = findNth(h, 'score 1', 2); if (h1 < 0) h1 = 9;
  let h2 = findNth(h, 'score 2', 2); if (h2 < 0) h2 = 10;
  return {
    date: Math.max(idx('date'), 0), tournament: Math.max(idx('tournament'), 1),
    time: Math.max(idx('time'), 2),  team1: Math.max(idx('team_1'), 3),
    team2: Math.max(idx('team_2'), 4), player1: Math.max(idx('player_1'), 5),
    player2: Math.max(idx('player_2'), 6), score1: s1, score2: s2, half1: h1, half2: h2,
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

function openPlayerModal(name) {
  const s = calcPlayerStats(name);
  const wr = s.matches ? Math.round(s.wins / s.matches * 100) : 0;
  const wPct = s.matches ? (s.wins / s.matches * 100).toFixed(0) : 0;
  const dPct = s.matches ? (s.draws / s.matches * 100).toFixed(0) : 0;
  const lPct = s.matches ? (s.losses / s.matches * 100).toFixed(0) : 0;

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

  document.getElementById('modalBody').innerHTML = `
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

function closeModal() {
  document.getElementById('playerModal').classList.remove('open');
  document.body.style.overflow = '';
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

function openTeamModal(name) {
  const s = calcTeamStats(name);
  const wPct = s.matches ? (s.wins   / s.matches * 100).toFixed(0) : 0;
  const dPct = s.matches ? (s.draws  / s.matches * 100).toFixed(0) : 0;
  const lPct = s.matches ? (s.losses / s.matches * 100).toFixed(0) : 0;

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

  document.getElementById('modalBody').innerHTML = `
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

function computeLeaguesForDate(date) {
  const leagues = {};

  // Pass 1: register EVERY tournament that has any match today (even unscored/live ones)
  // and track the latest match timestamp for sorting — "most recent time = shown first"
  for (const m of allMatches) {
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
  for (const m of allMatches) {
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

  return `
    <div class="league-block">
      <div class="league-block-header">
        <div class="league-block-name">${tournament}</div>
        <div class="league-block-meta">
          ${timeRange ? `<span>🕐 ${timeRange}</span>` : ''}
          <span>${teamCount} teams</span>
          <span>${Math.round(matchCount)} matches</span>
        </div>
      </div>
      <table class="league-table">
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
      </table>
    </div>`;
}

let leagueDays   = [];   // sorted unique dates (newest first)
let leagueDayIdx = 0;    // index into leagueDays

function renderLeagues() {
  const container = document.getElementById('leaguesContainer');
  if (!container) return;

  if (!leagueDays.length) {
    container.innerHTML = '<div class="error-state">No data.</div>';
    return;
  }

  const date    = leagueDays[leagueDayIdx];
  const total   = leagueDays.length;
  const leagues = computeLeaguesForDate(date);

  // Sort: active leagues (live/scheduled) first, then finished — within each group by latestTs desc
  // "most recent match time = shown first", exactly like results page
  const allEntries = Object.entries(leagues)
    .sort(([, a], [, b]) => {
      const aPri = a.active ? 0 : 1;
      const bPri = b.active ? 0 : 1;
      if (aPri !== bPri) return aPri - bPri;
      return b.latestTs - a.latestTs; // newest match time first in both groups
    });

  const activeLeagues   = allEntries.filter(([, d]) => d.active);
  const finishedLeagues = allEntries.filter(([, d]) => !d.active);

  // pagination: page 1 = newest (leagueDayIdx 0), page N = oldest
  // — mirrors results page where page 1 = last row in document
  const curPage = leagueDayIdx + 1;
  const WING = 2;
  const pages = [];
  for (let p = 1; p <= total; p++) {
    if (p === 1 || p === total || (p >= curPage - WING && p <= curPage + WING)) pages.push(p);
  }
  const pageBtns = [];
  let prev = 0;
  for (const p of pages) {
    if (p - prev > 1) pageBtns.push('<span class="page-ellipsis">…</span>');
    pageBtns.push(`<button class="page-btn${p === curPage ? ' active' : ''}" onclick="leagueGoDay(${p - 1})">${p}</button>`);
    prev = p;
  }
  const paginationHTML = `<div class="pagination" style="margin-top:2.5rem">${pageBtns.join('')}</div>`;

  const dateHeader = `<div class="league-day-header">${date}</div>`;

  let blocksHTML = '';
  if (!allEntries.length) {
    blocksHTML = '<div class="error-state">No completed matches for this day.</div>';
  } else {
    if (activeLeagues.length) {
      blocksHTML += `<div class="leagues-section-label active-label">In progress</div>`;
      blocksHTML += activeLeagues.map(([t, data]) => leagueBlockHTML(t, data)).join('');
    }
    if (finishedLeagues.length) {
      blocksHTML += `<div class="leagues-section-label finished-label">Finished</div>`;
      blocksHTML += finishedLeagues.map(([t, data]) => leagueBlockHTML(t, data)).join('');
    }
  }

  container.innerHTML = dateHeader + blocksHTML + paginationHTML;
}

window.leagueGoDay = function(idx) {
  leagueDayIdx = idx;
  renderLeagues();
  window.scrollTo({ top: document.getElementById('leaguesSection').offsetTop - 80, behavior: 'smooth' });
};

let activeView = 'leagues';

function switchView(view) {
  activeView = view;
  document.querySelectorAll('.view-tab').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  const showResults = view === 'results';
  document.getElementById('filterSection').style.display  = showResults ? '' : 'none';
  document.getElementById('resultsSection').style.display = showResults ? '' : 'none';
  document.getElementById('leaguesSection').style.display = showResults ? 'none' : '';
  if (view === 'leagues') renderLeagues();
  else if (view === 'results') render();
}

function applyFilters() {
  const dfTs = inputDateToTs(document.getElementById('dateFrom')?.value);
  const dtTs = inputDateToTs(document.getElementById('dateTo')?.value);
  const tf   = normTime(document.getElementById('timeFrom')?.value);
  const tt   = normTime(document.getElementById('timeTo')?.value);

  return allMatches.filter(m => {
    if (activeFilter !== 'all' && m.tournament !== activeFilter) return false;
    const mTs = sheetDateToTs(m.date);
    if (dfTs !== null && mTs < dfTs) return false;
    if (dtTs !== null && mTs > dtTs) return false;
    const mt = normTime(m.time);
    if (tf && mt < tf) return false;
    if (tt && mt > tt) return false;
    return true;
  });
}

let allMatches   = [];
let activeFilter = 'all';
let currentPage  = 1;

const CACHE_KEY = 'esb_csv_v2';

window.goPage = function(p) {
  currentPage = p;
  render();
  window.scrollTo({ top: document.getElementById('resultsGrid').offsetTop - 80, behavior: 'smooth' });
};

function render() {
  const grid    = document.getElementById('resultsGrid');
  const countEl = document.getElementById('resultsCount');

  const filtered = applyFilters();
  // strict document order: last row in sheet → first card on site
  filtered.sort((a, b) => b._idx - a._idx);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * PAGE_SIZE;
  const page  = filtered.slice(start, start + PAGE_SIZE);

  if (countEl) countEl.textContent = `${filtered.length} matches · page ${currentPage} of ${totalPages}`;

  grid.innerHTML = page.length
    ? page.map(renderCard).join('')
    : '<div class="error-state">No matches found.</div>';

  renderPagination(totalPages);
}

function resetPage() { currentPage = 1; render(); }

// ── Parse CSV text into allMatches / leagueDays ───────────────────────────────
function parseCSVToMatches(text) {
  const rows = parseCSV(text);

  const headerIdx = rows.findIndex(r =>
    r.some(c => c.toLowerCase().trim() === 'date') &&
    r.some(c => c.toLowerCase().trim() === 'tournament')
  );
  if (headerIdx < 0) throw new Error('Header row not found');

  const cols = mapCols(rows[headerIdx]);

  allMatches = rows
    .slice(headerIdx + 1)
    .filter(r => DATE_RE.test(v(r, cols.date)) && v(r, cols.tournament))
    .map((r, i) => ({
      _idx: i,
      date: v(r, cols.date), tournament: v(r, cols.tournament), time: v(r, cols.time),
      team1: v(r, cols.team1), team2: v(r, cols.team2),
      player1: v(r, cols.player1), player2: v(r, cols.player2),
      score1: v(r, cols.score1), score2: v(r, cols.score2),
      half1: v(r, cols.half1), half2: v(r, cols.half2),
    }));

  leagueDays = [...new Set(allMatches.map(m => matchDayKey(m)))]
    .filter(Boolean)
    .sort((a, b) => sheetDateToTs(b) - sheetDateToTs(a));
}

// ── Fetch fresh CSV from Google Sheets, cache it, parse it ───────────────────
async function fetchAndUpdate() {
  const url = SHEET_CSV + '&_=' + Date.now();
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  const text = await resp.text();

  // Save raw CSV to localStorage so next page open is instant
  try { localStorage.setItem(CACHE_KEY, text); } catch (e) { /* quota exceeded — skip */ }

  parseCSVToMatches(text);
}

// ── Update filter-bar buttons whenever allMatches changes ─────────────────────
function refreshFilterBar() {
  const filterBar = document.getElementById('filterBar');
  if (!filterBar) return;
  const tournaments = [...new Set(allMatches.map(m => m.tournament).filter(Boolean))];
  filterBar.innerHTML =
    `<button class="filter-btn${activeFilter === 'all' ? ' active' : ''}" data-filter="all">All</button>` +
    tournaments.map(t =>
      `<button class="filter-btn${activeFilter === t ? ' active' : ''}" data-filter="${t}">${t}</button>`
    ).join('');
}

async function init() {
  const grid             = document.getElementById('resultsGrid');
  const filterBar        = document.getElementById('filterBar');
  const leaguesContainer = document.getElementById('leaguesContainer');

  // ── Step 1: Try localStorage cache → instant first paint ─────────────────
  let hasCached = false;
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      parseCSVToMatches(cached);
      refreshFilterBar();
      renderLeagues();       // renders immediately from cache
      hasCached = true;
    }
  } catch (e) { /* corrupt cache — ignore */ }

  // ── Step 2: Show loading skeleton only when there is no cache ────────────
  if (!hasCached) {
    const dots = '<span class="loading-dot"></span><span class="loading-dot"></span><span class="loading-dot"></span>';
    if (leaguesContainer) leaguesContainer.innerHTML = `<div class="loading-state">${dots}</div>`;
    grid.innerHTML = `<div class="loading-state">${dots}</div>`;
  }

  // ── Step 3: Fetch fresh data (blocks if no cache; silent background if cached) ──
  try {
    await fetchAndUpdate();
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
    // Cached data is already displayed — silently swallow the network error
    console.warn('Background refresh failed:', err);
  }

  filterBar.addEventListener('click', e => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    filterBar.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.filter;
    resetPage();
  });

  ['dateFrom', 'dateTo', 'timeFrom', 'timeTo'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', resetPage);
  });

  document.getElementById('clearFilters')?.addEventListener('click', () => {
    ['dateFrom', 'dateTo', 'timeFrom', 'timeTo'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    filterBar.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    filterBar.querySelector('[data-filter="all"]')?.classList.add('active');
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

  // Re-render every 30 s — keeps live/finished badges correct as time passes
  setInterval(() => {
    if (activeView === 'results') render();
    else if (activeView === 'leagues') renderLeagues();
  }, 30_000);

  // Re-fetch sheet every 2 minutes — picks up new matches added to the sheet
  // (scheduled & live matches that didn't exist when the page first loaded)
  setInterval(async () => {
    try {
      await fetchAndUpdate();
      refreshFilterBar();
      if (activeView === 'results') render();
      else if (activeView === 'leagues') renderLeagues();
    } catch (e) {
      console.warn('Auto-refresh failed:', e);
    }
  }, 2 * 60 * 1000);
});
