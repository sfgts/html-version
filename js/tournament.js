// tournament.js — Group Stage display
// Flow: sources.json.tournamentIndex (published CSV) → rows of {date, spreadsheetURL}
//       → for each day, fetch GroupA..GroupL via gviz/tq API
//       → parse standings (pre-calculated in sheet) + match list
//       → render group cards in Leagues view

// ── Team name → ISO flag code ──────────────────────────────────────────────────
const FLAG_CODES = {
  'mexico': 'mx', 'south korea': 'kr', 'south africa': 'za', 'czechia': 'cz', 'czech republic': 'cz',
  'canada': 'ca', 'switzerland': 'ch', 'qatar': 'qa',
  'bosnia & herzegovina': 'ba', 'bosnia and herzegovina': 'ba', 'bosnia & herz.': 'ba',
  'brazil': 'br', 'morocco': 'ma', 'scotland': 'gb-sct', 'haiti': 'ht',
  'united states': 'us', 'usa': 'us', 'australia': 'au', 'paraguay': 'py', 'turkey': 'tr',
  'germany': 'de', 'ecuador': 'ec', 'ivory coast': 'ci', "côte d'ivoire": 'ci', 'curaçao': 'cw', 'curacao': 'cw',
  'netherlands': 'nl', 'japan': 'jp', 'tunisia': 'tn', 'sweden': 'se',
  'belgium': 'be', 'egypt': 'eg', 'iran': 'ir', 'new zealand': 'nz',
  'spain': 'es', 'cape verde': 'cv', 'saudi arabia': 'sa', 'uruguay': 'uy',
  'france': 'fr', 'senegal': 'sn', 'iraq': 'iq', 'norway': 'no',
  'argentina': 'ar', 'algeria': 'dz', 'austria': 'at', 'jordan': 'jo',
  'portugal': 'pt', 'colombia': 'co', 'uzbekistan': 'uz', 'dr congo': 'cd',
  'england': 'gb-eng', 'croatia': 'hr', 'panama': 'pa', 'ghana': 'gh',
  'korea republic': 'kr', 'republic of korea': 'kr',
};

function flagImg(teamName, side) {
  const code = FLAG_CODES[teamName.toLowerCase()];
  if (!code) return '';
  const align = side === 'right' ? 'style="order:1"' : '';
  return `<img class="tgm-flag" src="https://flagcdn.com/w20/${code}.png" alt="${teamName}" ${align}>`;
}

const TOURNAMENT_GROUPS = [
  'GroupA','GroupB','GroupC','GroupD','GroupE','GroupF',
  'GroupG','GroupH','GroupI','GroupJ','GroupK','GroupL',
];

// ── gviz/tq fetch ──────────────────────────────────────────────────────────────
// Works for any Google Sheet shared as "anyone with link can view"
// Returns 2D array of string values (formatted values preferred over raw)
async function fetchGviz(spreadsheetId, sheetName) {
  // headers=0 → gviz включає рядок 1 у table.rows і повертає ВСІ колонки
  // (без цього gviz обрізає колонки по останньому заголовку в рядку 1)
  const url =
    `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq` +
    `?tqx=out:json&headers=0&sheet=${encodeURIComponent(sheetName)}&range=A1:Z30&_=${Date.now()}`;

  const text = await fetch(url).then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status} — sheet "${sheetName}"`);
    return r.text();
  });

  // Strip JSONP wrapper: /*O_o*/\ngoogle.visualization.Query.setResponse({...});
  const start = text.indexOf('{');
  const end   = text.lastIndexOf('}');
  if (start < 0 || end < 0) throw new Error('Bad gviz response');

  const data = JSON.parse(text.slice(start, end + 1));
  if (!data.table) return [];

  return data.table.rows.map(row =>
    (row.c || []).map(cell => {
      if (!cell || cell.v === null || cell.v === undefined) return '';
      // Prefer formatted (f) so dates show as "04.06.2026" not "Date(2026,5,4)"
      const val = (cell.f !== null && cell.f !== undefined) ? cell.f : cell.v;
      return String(val).trim();
    })
  );
}

// ── Extract spreadsheet ID from a Google Sheets URL ───────────────────────────
function extractSheetId(url) {
  const m = String(url).match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

// ── Parse group sheet → { standings, matches, groupName } ─────────────────────
// Standings header row: must contain "GP" and "PTS"
//   Col before GP     = team name
//   Col before that   = player name (may be absent)
// Match header row: must contain "Player1" and "Team1"
function parseGroupSheet(rows, groupName) {
  const norm = s => String(s).toLowerCase().replace(/[\s_-]+/g, '').trim();

  // ── 1. Find standings table ────────────────────────────────────────────────
  let stHdrIdx  = -1;
  let playerCol = -1, teamCol = -1;
  let gpCol = -1, wCol = -1, dCol = -1, lCol = -1;
  let gfCol = -1, gaCol = -1, gdCol = -1, ptsCol = -1;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const gp  = row.findIndex(c => norm(c) === 'gp');
    const pts = row.findIndex(c => norm(c) === 'pts');
    if (gp >= 0 && pts >= 0) {
      stHdrIdx  = i;
      gpCol     = gp;
      wCol      = row.findIndex(c => norm(c) === 'w');
      dCol      = row.findIndex(c => norm(c) === 'd');
      lCol      = row.findIndex(c => norm(c) === 'l');
      gfCol     = row.findIndex(c => norm(c) === 'gf');
      gaCol     = row.findIndex(c => norm(c) === 'ga');
      gdCol     = row.findIndex(c => norm(c) === 'gd');
      ptsCol    = pts;
      teamCol   = gp - 1; // team name is one column before GP (R=17)
      playerCol = gp - 2; // player name two columns before GP (Q=16, may be empty — fallback uses match data)
      break;
    }
  }

  const standings = [];
  if (stHdrIdx >= 0) {
    for (let i = stHdrIdx + 1; i < rows.length && standings.length < 4; i++) {
      const row  = rows[i];
      const team = teamCol >= 0 ? (row[teamCol] || '') : '';
      if (!team) continue;
      standings.push({
        player: playerCol >= 0 ? (row[playerCol] || '') : '',
        team,
        gp:  +(row[gpCol])  || 0,
        w:   +(row[wCol])   || 0,
        d:   +(row[dCol])   || 0,
        l:   +(row[lCol])   || 0,
        gf:  +(row[gfCol])  || 0,
        ga:  +(row[gaCol])  || 0,
        gd:  +(row[gdCol])  || 0,
        pts: +(row[ptsCol]) || 0,
      });
    }
    // Already sorted in sheet, but re-sort just in case
    standings.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
  }

  // ── 2. Find match list ─────────────────────────────────────────────────────
  let mHdrIdx = -1;
  let timeCol = -1, p1Col = -1, p2Col = -1, t1Col = -1, t2Col = -1;
  let s1Col   = -1, s2Col = -1;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const p1  = row.findIndex(c => norm(c) === 'player1');
    const t1  = row.findIndex(c => norm(c) === 'team1');
    if (p1 >= 0 && t1 >= 0) {
      mHdrIdx = i;
      timeCol = 1; // B column — header is a time value "0:12", not text "Time"
      p1Col   = p1;
      p2Col   = row.findIndex(c => norm(c) === 'player2');
      t1Col   = t1;
      t2Col   = row.findIndex(c => norm(c) === 'team2');
      // "Result" column = score1; next column = score2
      // Hardcoded: G=score1(6), H=empty(7), I=score2(8), J=half1(9), L=half2(11)
      s1Col = 6;
      s2Col = 8;
      break;
    }
  }

  const matches = [];
  if (mHdrIdx >= 0) {
    for (let i = mHdrIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      const p1  = p1Col >= 0 ? (row[p1Col] || '') : '';
      const p2  = p2Col >= 0 ? (row[p2Col] || '') : '';
      if (!p1 && !p2) continue; // skip empty rows
      matches.push({
        time:    timeCol >= 0 ? (row[timeCol] || '') : '',
        player1: p1,
        player2: p2,
        team1:   t1Col   >= 0 ? (row[t1Col]   || '') : '',
        team2:   t2Col   >= 0 ? (row[t2Col]   || '') : '',
        score1:  s1Col >= 0 ? String(row[s1Col] ?? '') : '',
        score2:  s2Col >= 0 ? String(row[s2Col] ?? '') : '',
        half1:   String(row[9]  ?? ''),  // J
        half2:   String(row[11] ?? ''),  // L
      });
    }
  }

  // ── Hardcoded fallback if dynamic search didn't find standings ───────────────
  // Layout (fixed, same on every sheet, headers=0 so rows[0]=sheet row 1):
  //   Sheet row 3  = rows[2] : standings header  (GP at col S=18, PTS at Z=25)
  //   Sheet rows 4-7 = rows[3-6] : standings data (player col Q=16, team col R=17)
  //   Sheet row 11 = rows[10]: match header (Player1 col C=2, Team1 col E=4)
  //   Sheet rows 12+ = rows[11+]: match data (time B=1, s1 G=6, s2 H=7)
  if (stHdrIdx < 0 && rows.length > 6) {
    stHdrIdx  = 2;   // sheet row 3
    playerCol = 16;  // Q
    teamCol   = 17;  // R
    gpCol     = 18;  // S
    wCol      = 19;  // T
    dCol      = 20;  // U
    lCol      = 21;  // V
    gfCol     = 22;  // W
    gaCol     = 23;  // X
    gdCol     = 24;  // Y
    ptsCol    = 25;  // Z
    // Re-read standings with hardcoded positions
    for (let i = stHdrIdx + 1; i <= stHdrIdx + 4 && i < rows.length; i++) {
      const row  = rows[i];
      const team = row[teamCol] || '';
      if (!team) continue;
      standings.push({
        player: row[playerCol] || '',
        team,
        gp:  +(row[gpCol])  || 0,
        w:   +(row[wCol])   || 0,
        d:   +(row[dCol])   || 0,
        l:   +(row[lCol])   || 0,
        gf:  +(row[gfCol])  || 0,
        ga:  +(row[gaCol])  || 0,
        gd:  +(row[gdCol])  || 0,
        pts: +(row[ptsCol]) || 0,
      });
    }
    standings.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
  }

  if (mHdrIdx < 0 && rows.length > 11) {
    mHdrIdx = 10;  // sheet row 11
    timeCol = 1;   // B
    p1Col   = 2;   // C
    p2Col   = 3;   // D
    t1Col   = 4;   // E
    t2Col   = 5;   // F
    s1Col   = 6;   // G (score1)
    s2Col   = 8;   // I (score2, H is empty spacer)
    // Re-read matches with hardcoded positions
    for (let i = mHdrIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      const p1  = row[p1Col] || '';
      const p2  = row[p2Col] || '';
      if (!p1 && !p2) continue;
      matches.push({
        time:    row[timeCol] || '',
        player1: p1,
        player2: p2,
        team1:   row[t1Col]  || '',
        team2:   row[t2Col]  || '',
        score1:  String(row[s1Col] ?? ''),
        score2:  String(row[s2Col] ?? ''),
        half1:   String(row[9]  ?? ''),  // J
        half2:   String(row[11] ?? ''),  // L
      });
    }
  }

  // ── 3. Fallback: compute standings from match list if sheet table not found ──
  // This handles: (a) no results yet — shows teams with 0s
  //               (b) standings table format differs from expected
  if (standings.length === 0 && matches.length > 0) {
    const teams = {};
    // First pass: register all teams in match order (preserves group order)
    for (const m of matches) {
      for (const [t, p] of [[m.team1, m.player1], [m.team2, m.player2]]) {
        if (t && !teams[t]) {
          teams[t] = { player: p, team: t, gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
        }
      }
    }
    // Second pass: compute stats from scored matches
    for (const m of matches) {
      const hasScore = m.score1 !== '' && m.score2 !== ''
        && !isNaN(+m.score1) && !isNaN(+m.score2);
      if (!hasScore) continue;
      const s1 = +m.score1, s2 = +m.score2;
      for (const [t, myG, thG] of [[m.team1, s1, s2], [m.team2, s2, s1]]) {
        const r = teams[t];
        if (!r) continue;
        r.gp++; r.gf += myG; r.ga += thG; r.gd += myG - thG;
        if (myG > thG)      { r.w++; r.pts += 3; }
        else if (myG === thG) { r.d++; r.pts += 1; }
        else                  { r.l++; }
      }
    }
    for (const s of Object.values(teams)) standings.push(s);
    standings.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
  }

  return { standings, matches, groupName };
}

// ── Parse GRID sheet → bracket sections ──────────────────────────────────────
// Sheet structure: section header in col C ("1/16", "1/8", etc.)
//   then column header row (Team1 in C), then match data rows
// Columns: B=time(1), C=team1(2), D=team2(3), E=player1(4), F=player2(5)
//           G=half1(6), H=half2(7), I=score1(8), J=score2(9)
const BRACKET_ROUNDS = ['1/16','1/8','1/4','1/2','final'];
const BRACKET_LABELS = { '1/16':'Round of 16','1/8':'Quarter-finals','1/4':'Semi-finals','1/2':'Semi-finals','final':'Final' };

function parseGridSheet(rows) {
  const sections = [];
  let current    = null;
  let inData     = false;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const c2  = (row[2] || '').trim();
    const key = c2.toLowerCase();

    // Detect round header
    if (BRACKET_ROUNDS.includes(key) || key === '1/2') {
      if (current) sections.push(current);
      current = { key, label: BRACKET_LABELS[key] || c2, raw: c2, matches: [] };
      inData  = false;
      continue;
    }

    if (!current) continue;

    // Detect column header row (Team1 in C)
    if (key === 'team1') { inData = true; continue; }
    if (!inData) continue;

    // Match row: needs at least team1 or time
    const time  = (row[1] || '').trim();
    const team1 = c2;
    if (!team1 && !time) continue;

    const score1 = String(row[8] ?? '');
    const score2 = String(row[9] ?? '');

    current.matches.push({
      time,
      team1,
      team2:   (row[3] || '').trim(),
      player1: (row[4] || '').trim(),
      player2: (row[5] || '').trim(),
      half1:   String(row[6] ?? ''),
      half2:   String(row[7] ?? ''),
      score1,
      score2,
    });
  }

  if (current && current.matches.length) sections.push(current);
  return sections;
}

// Group status based purely on scores:
// no results → '' | any result → 'live' | all have results → 'finished'
function groupStatus(matches) {
  if (!matches.length) return '';
  const scored = matches.filter(m =>
    m.score1 !== '' && m.score2 !== '' && !isNaN(+m.score1) && !isNaN(+m.score2)
  );
  const hasAnyData = matches.some(m =>
    (m.score1 !== '' && m.score2 !== '' && !isNaN(+m.score1) && !isNaN(+m.score2)) ||
    (m.half1  !== '' && m.half2  !== '' && !isNaN(+m.half1)  && !isNaN(+m.half2))
  );
  if (!hasAnyData)                      return '';
  if (scored.length === matches.length) return 'finished';
  return 'live';
}

// ── Render one group card ──────────────────────────────────────────────────────
function renderGroupCard(group) {
  const { standings, matches, groupName } = group;
  const label = groupName.replace('Group', 'Group '); // "GroupA" → "Group A"

  // Standings table
  const standingsHTML = standings.length
    ? `<table class="league-table">
        <thead><tr>
          <th class="center">#</th>
          <th>Team</th>
          <th>Player</th>
          <th class="center">GP</th>
          <th class="center">W</th>
          <th class="center">D</th>
          <th class="center">L</th>
          <th class="center">Goals</th>
          <th class="center">Pts</th>
        </tr></thead>
        <tbody>${standings.map((s, i) => {
          const flagCode = FLAG_CODES[s.team.toLowerCase()];
          const flagEl   = flagCode
            ? `<img class="team-flag-sm" src="https://flagcdn.com/w40/${flagCode}.png" alt="${s.team}">`
            : `<span class="team-avatar" style="background:${teamAvatarColor(s.team)}">${s.team.replace(/[^A-Za-z0-9]/g,' ').trim().split(/\s+/).slice(0,2).map(w=>w[0]||'').join('').toUpperCase()}</span>`;
          return `<tr class="${i < 3 ? 'top-3' : ''}">
            <td class="rank">${i + 1}</td>
            <td><div class="team-cell-inner">
              ${flagEl}
              <span class="team-name-cell">${s.team}</span>
            </div></td>
            <td class="player-name-cell">${s.player}</td>
            <td class="center">${s.gp}</td>
            <td class="center">${s.w}</td>
            <td class="center">${s.d}</td>
            <td class="center">${s.l}</td>
            <td class="goals-cell center">${s.gf}-${s.ga}</td>
            <td class="pts-cell">${s.pts}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>`
    : `<div class="tg-placeholder">No team data found</div>`;

  // Match rows
  const matchRowsHTML = matches.map(m => {
    const hasScore = m.score1 !== '' && m.score2 !== ''
      && !isNaN(+m.score1) && !isNaN(+m.score2);
    const hasHT = m.half1 !== '' && m.half2 !== ''
      && !isNaN(+m.half1) && !isNaN(+m.half2);
    const isLive = hasHT && !hasScore; // half-time entered, final not yet

    const s1 = +m.score1, s2 = +m.score2;
    const w1 = hasScore && s1 > s2;
    const w2 = hasScore && s2 > s1;

    let scoreHTML;
    if (hasScore) {
      scoreHTML = `<span class="tgm-ft">${m.score1}:${m.score2}</span>
        ${hasHT ? `<span class="tgm-ht">${m.half1}:${m.half2}</span>` : ''}`;
    } else if (hasHT) {
      scoreHTML = `<span class="tgm-ft live-ht">HT ${m.half1}:${m.half2}</span>`;
    } else {
      scoreHTML = `<span class="tgm-ft">—:—</span>`;
    }

    return `<div class="tgroup-match${isLive ? ' match-live' : ''}">
      <span class="tgm-time">${m.time}</span>
      <div class="tgm-side">
        <span class="tgm-player${w1 ? ' winner' : ''}">${m.player1}</span>
        <span class="tgm-team">${flagImg(m.team1, 'left')}${m.team1}</span>
      </div>
      <span class="tgm-score">
        ${scoreHTML}
      </span>
      <div class="tgm-side right">
        <span class="tgm-player${w2 ? ' winner' : ''}">${m.player2}</span>
        <span class="tgm-team">${m.team2}${flagImg(m.team2, 'right')}</span>
      </div>
    </div>`;
  }).join('');

  const status = groupStatus(matches);
  const badgeHTML = status === 'live'
    ? `<span class="match-status live tg-badge"><span class="status-dot"></span>IN PROGRESS</span>`
    : status === 'finished'
      ? `<span class="match-status finished tg-badge">Finished</span>`
      : `<span class="tg-badge tg-badge--empty"></span>`;

  const blockClass = status === 'live' ? ' league-block--live'
                   : status === ''    ? ' league-block--upcoming'
                   : '';
  return `<div class="league-block${blockClass}">
    <div class="league-block-header">
      <div class="league-block-name">${label}</div>
      ${badgeHTML}
    </div>
    ${standingsHTML}
    ${matchRowsHTML ? `<div class="tgroup-matches">${matchRowsHTML}</div>` : ''}
  </div>`;
}

// ── Tournament state ───────────────────────────────────────────────────────────
let tournamentDays    = []; // [{date, id}] newest first
let tournamentDayIdx  = 0;
let tournamentReady   = false;

// ── renderLeagues — overrides the stub in players.js ──────────────────────────
function renderLeagues() {
  const container = document.getElementById('leaguesContainer');
  const lfPanel   = document.getElementById('lfPanel');
  if (!container) return;

  // Hide month/group filter panel — day navigation is inside the container
  if (lfPanel) lfPanel.style.display = 'none';

  if (!tournamentReady || !tournamentDays.length) {
    container.innerHTML = '';
    return;
  }

  const safeIdx     = Math.min(tournamentDayIdx, tournamentDays.length - 1);
  const { date, id } = tournamentDays[safeIdx];
  const total        = tournamentDays.length;

  // Show loading dots while fetching
  container.innerHTML = `<div class="loading-state">
    <span class="loading-dot"></span>
    <span class="loading-dot"></span>
    <span class="loading-dot"></span>
  </div>`;

  // Fetch all 12 group tabs in parallel
  Promise.allSettled(
    TOURNAMENT_GROUPS.map(g =>
      fetchGviz(id, g).then(rows => parseGroupSheet(rows, g))
    )
  ).then(results => {
    const groups = results
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value)
      .filter(g => g.standings.length > 0 || g.matches.length > 0);

    if (!groups.length) {
      container.innerHTML = '<div class="error-state">No group data for this day.</div>';
      return;
    }

    // Day pagination buttons
    const curPage = safeIdx + 1;
    const WING    = 2;
    const pageBtns = [];
    let prev = 0;
    for (let p = 1; p <= total; p++) {
      if (p === 1 || p === total || (p >= curPage - WING && p <= curPage + WING)) {
        if (p - prev > 1) pageBtns.push('<span class="page-ellipsis">…</span>');
        pageBtns.push(
          `<button class="page-btn${p === curPage ? ' active' : ''}" onclick="leagueGoDay(${p - 1})">${p}</button>`
        );
        prev = p;
      }
    }

    // Split groups by status
    const liveGroups     = groups.filter(g => groupStatus(g.matches) === 'live');
    const finishedGroups = groups.filter(g => groupStatus(g.matches) === 'finished');
    const upcomingGroups = groups.filter(g => groupStatus(g.matches) === '');

    let html = `<div class="league-day-header">${date}</div>`;

    if (liveGroups.length) {
      html += `<div class="groups-section-label groups-label--live"><span class="status-dot"></span>In Progress</div>`;
      html += liveGroups.map(g => {
        // Find matches that are "live" (have HT but no final score)
        const liveMatches = g.matches.filter(m =>
          m.half1 !== '' && m.half2 !== '' && !isNaN(+m.half1) && !isNaN(+m.half2) &&
          (m.score1 === '' || m.score2 === '' || isNaN(+m.score1) || isNaN(+m.score2))
        );
        // If no live matches, fall back to all unfinished
        const spotlight = liveMatches.length ? liveMatches
          : g.matches.filter(m => m.score1 === '' || isNaN(+m.score1));

        function spPlayerCard(name, team) {
          const code = FLAG_CODES[(team || '').toLowerCase()];
          const flagUrl = code ? `https://flagcdn.com/w80/${code}.png` : null;
          const photoSrc = `../assets/players/${name}.png`;
          const initials = name.replace(/[^A-Za-z0-9]/g,' ').trim()
            .split(/\s+/).slice(0,2).map(w=>w[0]||'').join('').toUpperCase() || name.slice(0,2).toUpperCase();
          let h = 0;
          for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
          const avatarColor = `oklch(0.58 0.2 ${Math.abs(h) % 360})`;
          return `<div class="sp-pcard">
            <div class="sp-photo-wrap" style="--sp-color:${avatarColor}">
              <img class="sp-photo" src="${photoSrc}" alt="${name}"
                   onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
              <div class="sp-avatar" style="background:${avatarColor};display:none">${initials}</div>
              ${flagUrl ? `<img class="sp-flag-overlay" src="${flagUrl}" alt="${team}">` : ''}
            </div>
            <span class="sp-pname">${name}</span>
          </div>`;
        }

        const spotlightBlocks = spotlight.map(m => {
          const hasHT = m.half1 !== '' && !isNaN(+m.half1);
          return `<div class="live-spotlight">
            <div class="sp-title">Now Playing</div>
            <div class="sp-match">
              ${spPlayerCard(m.player1, m.team1)}
              <div class="sp-vs">
                <span class="sp-time">${m.time}</span>
                <span class="sp-vs-text">VS</span>
              </div>
              ${spPlayerCard(m.player2, m.team2)}
            </div>
            ${hasHT ? `<div class="sp-score-row"><span class="sp-ht">HT ${m.half1} : ${m.half2}</span></div>` : ''}
          </div>`;
        }).join('');

        return `<div class="live-group-row">
          <div class="live-group-card">${renderGroupCard(g)}</div>
          <div class="live-spotlights">${spotlightBlocks}</div>
        </div>`;
      }).join('');
    }

    if (finishedGroups.length) {
      html += `<div class="groups-section-label groups-label--finished">Finished</div>`;
      html += `<div class="tournament-groups-grid">${finishedGroups.map(g => renderGroupCard(g)).join('')}</div>`;
    }

    if (upcomingGroups.length) {
      html += `<div class="groups-section-label groups-label--upcoming">Upcoming</div>`;
      html += `<div class="tournament-groups-grid groups-grid--upcoming">${upcomingGroups.map(g => renderGroupCard(g)).join('')}</div>`;
    }

    html += `<div class="pagination" style="margin-top:2.5rem">${pageBtns.join('')}</div>`;
    container.innerHTML = html;
  });
}

window.leagueGoDay = function(idx) {
  tournamentDayIdx = idx;
  renderLeagues();
  const sec = document.getElementById('leaguesSection');
  if (sec) window.scrollTo({ top: sec.offsetTop - 80, behavior: 'smooth' });
};

// ── Init — called from players.js init() with the loaded sources object ────────
async function initTournament(sources) {
  if (!sources.tournamentIndex) return;

  try {
    const sep = sources.tournamentIndex.includes('?') ? '&' : '?';
    const csvText = await fetch(sources.tournamentIndex + sep + '_=' + Date.now())
      .then(r => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      });

    // parseCSV is defined in players.js (loaded before this file)
    const rows    = parseCSV(csvText);
    const entries = [];

    for (const row of rows) {
      const date = (row[1] || '').trim(); // col B
      const url  = (row[2] || '').trim(); // col C
      if (!date || !url) continue;
      if (!/^\d{2}\.\d{2}\.\d{4}$/.test(date)) continue;
      const id = extractSheetId(url);
      if (!id) continue;
      entries.push({ date, id });
    }

    if (!entries.length) return;

    // Sort newest first
    tournamentDays = entries.sort((a, b) => {
      const ts = d => {
        const [dd, mm, yy] = d.split('.');
        return new Date(+yy, +mm - 1, +dd).getTime();
      };
      return ts(b.date) - ts(a.date);
    });

    tournamentReady = true;

    if (typeof activeView !== 'undefined' && activeView === 'leagues') {
      renderLeagues();
    } else if (typeof activeView !== 'undefined' && activeView === 'results') {
      renderBracket();
    }
  } catch (err) {
    console.warn('[tournament] init failed:', err.message);
  }
}

// ── Single bracket match card (vertical: team on top, opponent on bottom) ─────
function bracketCard(m) {
  const hasScore = m.score1 !== '' && m.score2 !== ''
    && !isNaN(+m.score1) && !isNaN(+m.score2);
  const s1 = +m.score1, s2 = +m.score2;
  const w1 = hasScore && s1 > s2, w2 = hasScore && s2 > s1;

  const hasHT = hasScore && m.half1 !== '' && m.half2 !== '' && !isNaN(+m.half1) && !isNaN(+m.half2);

  const teamRow = (team, player, score, win, ht) => {
    const isTBD = !team || team.toUpperCase() === 'TBD';
    const code  = !isTBD ? FLAG_CODES[team.toLowerCase()] : null;
    const flagEl = code
      ? `<img class="bcard-flag" src="https://flagcdn.com/w40/${code}.png" alt="${team}">`
      : `<span class="bcard-flag bcard-flag--empty"></span>`;
    return `<div class="bcard-row${win ? ' win' : ''}">
      ${flagEl}
      <div class="bcard-info">
        <span class="bcard-team${isTBD ? ' tbd' : ''}">${isTBD ? 'TBD' : team}</span>
        ${player && !isTBD ? `<span class="bcard-player">${player}</span>` : ''}
      </div>
      <div class="bcard-score-wrap">
        ${hasHT ? `<span class="bcard-ht-score">${ht}</span>` : ''}
        <span class="bcard-score">${hasScore ? score : ''}</span>
      </div>
    </div>`;
  };

  return `<div class="bcard">
    ${m.time ? `<div class="bcard-time">${m.time}</div>` : ''}
    ${teamRow(m.team1, m.player1, m.score1, w1, m.half1)}
    <div class="bcard-divider"></div>
    ${teamRow(m.team2, m.player2, m.score2, w2, m.half2)}
  </div>`;
}

// ── Build bracket: sections left-to-right, connected by a single line ─────────
const ROUND_LABELS = { '1/16':'Round of 16','1/8':'Quarter-finals','1/4':'Semi-finals','1/2':'Semi-finals','final':'Final' };
const ROUND_ORDER  = ['1/16','1/8','1/4','1/2','final'];

function buildBracketGrid(sections) {
  const ordered = ROUND_ORDER.map(k => sections.find(s => s.key === k)).filter(Boolean);
  if (!ordered.length) return '<div class="error-state">No bracket data.</div>';

  const cols = ordered.map((section, i) => {
    const matchesHTML = section.matches.map(m => bracketCard(m)).join('');
    return `<div class="bcol">
      <div class="bcol-label">${ROUND_LABELS[section.key] || section.raw}</div>
      <div class="bcol-matches">${matchesHTML}</div>
    </div>${i < ordered.length - 1 ? '<div class="bcol-sep"></div>' : ''}`;
  }).join('');

  return `<div class="bracket-track">${cols}</div>`;
}

// ── render() — overrides players.js, shows bracket when Results tab active ────
function render() {
  const grid    = document.getElementById('resultsGrid');
  const countEl = document.getElementById('resultsCount');
  const lfPanel = document.getElementById('lfPanel');

  if (lfPanel) lfPanel.style.display = 'none';
  if (countEl) countEl.textContent = '';
  document.getElementById('pagination')?.replaceChildren?.();

  if (!tournamentReady || !tournamentDays.length) {
    if (grid) grid.innerHTML = '';
    return;
  }

  const dots = '<span class="loading-dot"></span><span class="loading-dot"></span><span class="loading-dot"></span>';
  if (grid) grid.innerHTML = `<div class="loading-state">${dots}</div>`;

  const safeIdx      = Math.min(tournamentDayIdx, tournamentDays.length - 1);
  const { id, date } = tournamentDays[safeIdx];
  const total        = tournamentDays.length;

  fetchGviz(id, 'GRID').then(rows => {
    const sections = parseGridSheet(rows);
    if (!sections.length) {
      grid.innerHTML = '<div class="error-state">No bracket data for this day.</div>';
      return;
    }

    // Build pagination (same style as Group Stage)
    const curPage = safeIdx + 1;
    const WING = 2;
    const pageBtns = [];
    let prev = 0;
    for (let p = 1; p <= total; p++) {
      if (p === 1 || p === total || (p >= curPage - WING && p <= curPage + WING)) {
        if (p - prev > 1) pageBtns.push('<span class="page-ellipsis">…</span>');
        pageBtns.push(
          `<button class="page-btn${p === curPage ? ' active' : ''}" onclick="bracketGoDay(${p - 1})">${p}</button>`
        );
        prev = p;
      }
    }

    grid.innerHTML =
      `<div class="league-day-header">${date}</div>` +
      `<div class="bracket-view">${buildBracketGrid(sections)}</div>` +
      (total > 1 ? `<div class="pagination" style="margin-top:2rem">${pageBtns.join('')}</div>` : '');
  }).catch(err => {
    console.warn('[bracket] fetch failed:', err);
    grid.innerHTML = '<div class="error-state">Could not load bracket.</div>';
  });
}

window.bracketGoDay = function(idx) {
  tournamentDayIdx = idx;
  render();
  const sec = document.getElementById('resultsSection');
  if (sec) window.scrollTo({ top: sec.offsetTop - 80, behavior: 'smooth' });
};
