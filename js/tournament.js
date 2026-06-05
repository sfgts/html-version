// tournament.js â€” Group Stage display
// Flow: sources.json.tournamentIndex (published CSV) â†’ rows of {date, spreadsheetURL}
//       â†’ for each day, fetch GroupA..GroupL via gviz/tq API
//       â†’ parse standings (pre-calculated in sheet) + match list
//       â†’ render group cards in Leagues view

// â”€â”€ Team name â†’ ISO flag code â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const FLAG_CODES = {
  'mexico': 'mx', 'south korea': 'kr', 'south africa': 'za', 'czechia': 'cz', 'czech republic': 'cz',
  'canada': 'ca', 'switzerland': 'ch', 'qatar': 'qa',
  'bosnia & herzegovina': 'ba', 'bosnia and herzegovina': 'ba', 'bosnia & herz.': 'ba',
  'brazil': 'br', 'morocco': 'ma', 'scotland': 'gb-sct', 'haiti': 'ht',
  'united states': 'us', 'usa': 'us', 'australia': 'au', 'paraguay': 'py', 'turkey': 'tr',
  'germany': 'de', 'ecuador': 'ec', 'ivory coast': 'ci', "cÃ´te d'ivoire": 'ci', 'curaÃ§ao': 'cw', 'curacao': 'cw',
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

function playerPhotoSrc(name) {
  const fileName = String(name || '').trim().toLowerCase();
  return `../assets/players/${fileName}.png`;
}

const TOURNAMENT_GROUPS = [
  'GroupA','GroupB','GroupC','GroupD','GroupE','GroupF',
  'GroupG','GroupH','GroupI','GroupJ','GroupK','GroupL',
];

// â”€â”€ gviz/tq fetch â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Works for any Google Sheet shared as "anyone with link can view"
// Returns 2D array of string values (formatted values preferred over raw)
async function fetchGviz(spreadsheetId, sheetName) {
  // headers=0 â†’ gviz Ð²ÐºÐ»ÑŽÑ‡Ð°Ñ” Ñ€ÑÐ´Ð¾Ðº 1 Ñƒ table.rows Ñ– Ð¿Ð¾Ð²ÐµÑ€Ñ‚Ð°Ñ” Ð’Ð¡Ð† ÐºÐ¾Ð»Ð¾Ð½ÐºÐ¸
  // (Ð±ÐµÐ· Ñ†ÑŒÐ¾Ð³Ð¾ gviz Ð¾Ð±Ñ€Ñ–Ð·Ð°Ñ” ÐºÐ¾Ð»Ð¾Ð½ÐºÐ¸ Ð¿Ð¾ Ð¾ÑÑ‚Ð°Ð½Ð½ÑŒÐ¾Ð¼Ñƒ Ð·Ð°Ð³Ð¾Ð»Ð¾Ð²ÐºÑƒ Ð² Ñ€ÑÐ´ÐºÑƒ 1)
  const url =
    `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq` +
    `?tqx=out:json&headers=0&sheet=${encodeURIComponent(sheetName)}&range=A1:Z120&_=${Date.now()}`;

  const text = await fetch(url, { cache: 'no-store' }).then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status} â€” sheet "${sheetName}"`);
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

// â”€â”€ Extract spreadsheet ID from a Google Sheets URL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function extractSheetId(url) {
  const m = String(url).match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

// â”€â”€ Parse group sheet â†’ { standings, matches, groupName } â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Standings header row: must contain "GP" and "PTS"
//   Col before GP     = team name
//   Col before that   = player name (may be absent)
// Match header row: must contain "Player1" and "Team1"
function parseGroupSheet(rows, groupName) {
  const norm = s => String(s).toLowerCase().replace(/[\s_-]+/g, '').trim();
  const isServiceMatchRow = m => {
    const text = [m.time, m.player1, m.player2, m.team1, m.team2]
      .map(v => String(v || '').toLowerCase().trim())
      .join(' ');
    return text.includes('stream')
      || text.includes('console')
      || text.includes('first team')
      || text.includes('second team')
      || text.includes('Ð¿ÐµÑ€Ð²Ð°Ñ ÐºÐ¾Ð¼Ð°Ð½Ð´Ð°')
      || text.includes('Ð²Ñ‚Ð¾Ñ€Ð°Ñ ÐºÐ¾Ð¼Ð°Ð½Ð´Ð°');
  };

  // â”€â”€ 1. Find standings table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      playerCol = gp - 2; // player name two columns before GP (Q=16, may be empty â€” fallback uses match data)
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

  // â”€â”€ 2. Find match list â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  let mHdrIdx = -1;
  let timeCol = -1, p1Col = -1, p2Col = -1, t1Col = -1, t2Col = -1;
  let s1Col   = -1, s2Col = -1;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const p1 = row.findIndex(c => norm(c) === 'player1');
    const p2 = row.findIndex(c => norm(c) === 'player2');
    const t1 = row.findIndex(c => norm(c) === 'team1');
    const t2 = row.findIndex(c => norm(c) === 'team2');
    if (p1 >= 0 && p2 >= 0 && t1 >= 0 && t2 >= 0) {
      mHdrIdx = i;
      timeCol = 1;
      p1Col = p1;
      p2Col = p2;
      t1Col = t1;
      t2Col = t2;
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
      const team1 = t1Col >= 0 ? (row[t1Col] || '') : '';
      const team2 = t2Col >= 0 ? (row[t2Col] || '') : '';
      if (!p1 || !p2 || !team1 || !team2) continue;
      matches.push({
        time:    timeCol >= 0 ? (row[timeCol] || '') : '',
        player1: p1,
        player2: p2,
        team1,
        team2,
        score1:  s1Col >= 0 ? String(row[s1Col] ?? '') : '',
        score2:  s2Col >= 0 ? String(row[s2Col] ?? '') : '',
        half1:   String(row[9]  ?? ''),
        half2:   String(row[11] ?? ''),
      });
    }
  }

  // â”€â”€ Hardcoded fallback if dynamic search didn't find standings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Layout (fixed, same on every sheet, headers=0 so rows[0]=sheet row 1):
  //   Sheet row 3  = rows[2] : standings header  (GP at col S=18, PTS at Z=25)
  //   Sheet rows 4-7 = rows[3-6] : standings data (player col Q=16, team col R=17)
  //   Sheet row 11 = rows[10]: match header (Player1 col C=2, Team1 col E=4)
  //   Sheet rows 12+ = rows[11+]: match data (time B=1, result G/I=6/8, half time J/L=9/11)
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
      const team1 = row[t1Col] || '';
      const team2 = row[t2Col] || '';
      if (!p1 || !p2 || !team1 || !team2) continue;
      matches.push({
        time:    row[timeCol] || '',
        player1: p1,
        player2: p2,
        team1,
        team2,
        score1:  String(row[s1Col] ?? ''),
        score2:  String(row[s2Col] ?? ''),
        half1:   String(row[9]  ?? ''),  // J
        half2:   String(row[11] ?? ''),  // L
      });
    }
  }

  // â”€â”€ 3. Fallback: compute standings from match list if sheet table not found â”€â”€
  // This handles: (a) no results yet â€” shows teams with 0s
  //               (b) standings table format differs from expected
  for (let i = matches.length - 1; i >= 0; i--) {
    if (isServiceMatchRow(matches[i])) matches.splice(i, 1);
  }

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

// â”€â”€ Parse GRID sheet â†’ bracket sections â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Sheet structure is fixed:
// B = time, C = Team1, D = Team2, E = Player1, F = Player2,
// G/H = half time, I/J = result. Round headers are in C.
const BRACKET_ROUNDS = ['1/16','1/8','1/4','1/2','final'];
const BRACKET_LABELS = { '1/16':'Round of 16','1/8':'Round of 8','1/4':'Quarter-finals','1/2':'Semi-finals','final':'Final' };

function normGridCell(value) {
  return String(value ?? '').toLowerCase().replace(/\s+/g, '').trim();
}

function parseGridSheet(rows) {
  const sections = [];
  let current    = null;
  let inData     = false;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const c = String(row[2] ?? '').trim();
    const key = normGridCell(c);

    // Detect round header in column C.
    if (BRACKET_ROUNDS.includes(key)) {
      if (current) sections.push(current);
      current = { key, label: BRACKET_LABELS[key] || c, raw: c, matches: [] };
      inData = false;
      continue;
    }

    if (!current) continue;

    // Header row has Team1 in C.
    if (key === 'team1') { inData = true; continue; }
    if (!inData) continue;

    // Match row: needs at least team1 or time
    const time  = String(row[1] ?? '').trim();
    const team1 = String(row[2] ?? '').trim();
    const team2 = String(row[3] ?? '').trim();
    if (!team1 && !team2 && !time) continue;

    current.matches.push({
      time,
      team1,
      team2,
      player1: String(row[4] ?? '').trim(),
      player2: String(row[5] ?? '').trim(),
      half1:   String(row[6] ?? '').trim(),
      half2:   String(row[7] ?? '').trim(),
      score1:  String(row[8] ?? '').trim(),
      score2:  String(row[9] ?? '').trim(),
    });
  }

  if (current) sections.push(current);
  return sections;
}

// Group status based purely on scores:
// no results â†’ '' | any result â†’ 'live' | all have results â†’ 'finished'
function matchListStatus(matches) {
  if (!matches.length) return '';
  const hasScore = m => m.score1 !== '' && m.score2 !== ''
    && !isNaN(+m.score1) && !isNaN(+m.score2);
  const hasHT = m => m.half1 !== '' && m.half2 !== ''
    && !isNaN(+m.half1) && !isNaN(+m.half2);
  const scored = matches.filter(hasScore);
  if (matches.some(m => hasHT(m) && !hasScore(m))) return 'live';
  const hasAnyData = matches.some(m =>
    hasScore(m) || hasHT(m)
  );
  if (!hasAnyData)                      return '';
  if (scored.length === matches.length) return 'finished';
  return 'live';
}

function groupStatus(group) {
  const matches = Array.isArray(group) ? group : (group.matches || []);
  const standings = Array.isArray(group) ? [] : (group.standings || []);
  const status = matchListStatus(matches);
  if (status) return status;

  const hasProgress = standings.some(s =>
    (+s.gp || 0) > 0 || (+s.w || 0) > 0 || (+s.d || 0) > 0 || (+s.l || 0) > 0 ||
    (+s.gf || 0) > 0 || (+s.ga || 0) > 0 || (+s.pts || 0) > 0
  );
  if (!hasProgress) return '';

  return standings.length > 0 && standings.every(s => (+s.gp || 0) >= 3)
    ? 'finished'
    : 'live';
}

// â”€â”€ Render one group card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function renderGroupCard(group) {
  const { standings, matches, groupName } = group;
  const label = groupName.replace('Group', 'Group '); // "GroupA" â†’ "Group A"

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
      scoreHTML = `<span class="tgm-ft">â€”:â€”</span>`;
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

  const status = groupStatus(group);
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

// â”€â”€ Tournament state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let tournamentDays    = []; // [{date, id}] newest first
let tournamentDayIdx  = 0;
let tournamentReady   = false;
let tournamentError   = '';

// â”€â”€ renderLeagues â€” overrides the stub in players.js â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function renderLeagues() {
  const container = document.getElementById('leaguesContainer');
  const lfPanel   = document.getElementById('lfPanel');
  if (!container) return;

  // Hide month/group filter panel â€” day navigation is inside the container
  if (lfPanel) lfPanel.classList.add('is-hidden');

  if (!tournamentReady || !tournamentDays.length) {
    container.innerHTML = tournamentError
      ? `<div class="error-state">${tournamentError}</div>`
      : '<div class="loading-state"><span class="loading-dot"></span><span class="loading-dot"></span><span class="loading-dot"></span></div>';
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
        if (p - prev > 1) pageBtns.push('<span class="page-ellipsis">â€¦</span>');
        pageBtns.push(
          `<button class="page-btn${p === curPage ? ' active' : ''}" onclick="leagueGoDay(${p - 1})">${p}</button>`
        );
        prev = p;
      }
    }

    // Split groups by status
    const liveGroups     = groups.filter(g => groupStatus(g) === 'live');
    const finishedGroups = groups.filter(g => groupStatus(g) === 'finished');
    const upcomingGroups = groups.filter(g => groupStatus(g) === '');

    let html = `<div class="league-day-header">${date}</div>`;

    if (liveGroups.length) {
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
          const photoSrc = playerPhotoSrc(name);
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

// â”€â”€ Init â€” called from players.js init() with the loaded sources object â”€â”€â”€â”€â”€â”€â”€â”€
async function initTournament(sources) {
  if (!sources.tournamentIndex) return;

  try {
    const sep = sources.tournamentIndex.includes('?') ? '&' : '?';
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), 12000)
    );
    const csvText = await Promise.race([
      fetch(sources.tournamentIndex + sep + '_=' + Date.now(), { cache: 'no-store' })
        .then(r => {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.text();
        }),
      timeout,
    ]);

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
    tournamentError = '';

    if (typeof activeView !== 'undefined' && activeView === 'leagues') {
      renderLeagues();
    } else if (typeof activeView !== 'undefined' && activeView === 'results') {
      render();
    }
  } catch (err) {
    console.warn('[tournament] init failed:', err.message);
    tournamentReady = false;
    tournamentError = 'Could not load tournament data. Please refresh.';
    const container = document.getElementById('leaguesContainer');
    const grid = document.getElementById('resultsGrid');
    const msg = `<div class="error-state">${tournamentError}</div>`;
    if (container && !container.querySelector('.league-block')) container.innerHTML = msg;
    if (grid && activeView === 'results' && !grid.querySelector('.bracket-view')) grid.innerHTML = msg;
  }
}

// â”€â”€ Single bracket match card (vertical: team on top, opponent on bottom) â”€â”€â”€â”€â”€
function bracketCard(m) {
  const hasScore = m.score1 !== '' && m.score2 !== ''
    && !isNaN(+m.score1) && !isNaN(+m.score2);
  const hasHT = m.half1 !== '' && m.half2 !== ''
    && !isNaN(+m.half1) && !isNaN(+m.half2);
  const isLive = hasHT && !hasScore;
  const s1 = +m.score1, s2 = +m.score2;
  const w1 = hasScore && s1 > s2, w2 = hasScore && s2 > s1;

  const teamRow = (team, player, score, win, ht) => {
    const isTBD = !team || team.toUpperCase() === 'TBD';
    const code  = !isTBD ? FLAG_CODES[team.toLowerCase()] : null;
    const flagEl = code
      ? `<img class="bcard-flag" src="https://flagcdn.com/w40/${code}.png" alt="${team}">`
      : `<span class="bcard-flag bcard-flag--empty"></span>`;
    const championClass = win ? ' champion' : '';
    return `<div class="bcard-row${win ? ' win' : ''}${championClass}">
      ${flagEl}
      <div class="bcard-info">
        <span class="bcard-team${isTBD ? ' tbd' : ''}">${isTBD ? 'TBD' : team}</span>
        ${player && !isTBD ? `<span class="bcard-player">${player}</span>` : ''}
      </div>
      <div class="bcard-score-wrap">
        ${hasHT ? `<span class="bcard-ht-score">${isLive ? 'HT ' : ''}${ht}</span>` : ''}
        <span class="bcard-score">${hasScore ? score : ''}</span>
      </div>
    </div>`;
  };

  return `<div class="bcard${isLive ? ' bcard--live' : ''}">
    ${m.time ? `<div class="bcard-time">${m.time}</div>` : ''}
    ${teamRow(m.team1, m.player1, m.score1, w1, m.half1)}
    <div class="bcard-divider"></div>
    ${teamRow(m.team2, m.player2, m.score2, w2, m.half2)}
  </div>`;
}

// â”€â”€ Build bracket: sections left-to-right, connected by a single line â”€â”€â”€â”€â”€â”€â”€â”€â”€
function finalWinner(m) {
  const hasScore = m.score1 !== '' && m.score2 !== ''
    && !isNaN(+m.score1) && !isNaN(+m.score2);
  if (!hasScore || +m.score1 === +m.score2) return null;
  return +m.score1 > +m.score2
    ? { team: m.team1, player: m.player1, score: m.score1 }
    : { team: m.team2, player: m.player2, score: m.score2 };
}

function championSpotlight(m) {
  const winner = finalWinner(m);
  if (!winner || !winner.team || winner.team.toUpperCase() === 'TBD') return '';
  const code = FLAG_CODES[winner.team.toLowerCase()];
  const flagEl = code
    ? `<img class="champion-flag" src="https://flagcdn.com/w80/${code}.png" alt="${winner.team}">`
    : '<span class="champion-flag champion-flag--empty"></span>';

  return `<div class="champion-spotlight">
    <img class="champion-trophy" src="../assets/trophy.png" alt="" onerror="this.style.display='none'">
    <div class="champion-card">
      <div class="champion-kicker">CHAMPION</div>
      <div class="champion-main">
        ${flagEl}
        <div class="champion-team">${winner.team}</div>
      </div>
    </div>
  </div>`;
}
const ROUND_LABELS = { '1/16':'Round of 16','1/8':'Round of 8','1/4':'Quarter-finals','1/2':'Semi-finals','final':'Final' };
const ROUND_ORDER  = ['1/16','1/8','1/4','1/2','final'];
// Expected match count per round (used to fill TBD placeholders)
const ROUND_COUNTS = { '1/16': 16, '1/8': 8, '1/4': 4, '1/2': 2, 'final': 1 };

function tbdMatch() {
  return { time: '', team1: 'TBD', team2: 'TBD', player1: '', player2: '', score1: '', score2: '', half1: '', half2: '' };
}

function bracketRoundMatches(sections, key) {
  const section = sections.find(s => s.key === key);
  const matches = section ? [...section.matches] : [];
  const expected = ROUND_COUNTS[key] || matches.length;
  while (matches.length < expected) matches.push(tbdMatch());
  return matches;
}

function bracketColumn(label, matches, className = '') {
  return `<div class="bcol ${className}">
    <div class="bcol-label">${label}</div>
    <div class="bcol-matches">${matches.map(m => bracketCard(m)).join('')}</div>
  </div>`;
}

function buildBracketGrid(sections) {
  // Find first round that has actual data to determine if we have anything to show
  const hasAny = ROUND_ORDER.some(k => sections.find(s => s.key === k));
  if (!hasAny) return '<div class="error-state">No play-off data.</div>';

  const r16 = bracketRoundMatches(sections, '1/16');
  const r8 = bracketRoundMatches(sections, '1/8');
  const r4 = bracketRoundMatches(sections, '1/4');
  const r2 = bracketRoundMatches(sections, '1/2');
  const final = bracketRoundMatches(sections, 'final');

  const left = [
    bracketColumn(ROUND_LABELS['1/16'], r16.slice(0, 8), 'bcol-r16'),
    bracketColumn(ROUND_LABELS['1/8'], r8.slice(0, 4), 'bcol-r8'),
    bracketColumn(ROUND_LABELS['1/4'], r4.slice(0, 2), 'bcol-r4'),
    bracketColumn(ROUND_LABELS['1/2'], r2.slice(0, 1), 'bcol-r2'),
  ].join('');

  const right = [
    bracketColumn(ROUND_LABELS['1/2'], r2.slice(1, 2), 'bcol-r2'),
    bracketColumn(ROUND_LABELS['1/4'], r4.slice(2, 4), 'bcol-r4'),
    bracketColumn(ROUND_LABELS['1/8'], r8.slice(4, 8), 'bcol-r8'),
    bracketColumn(ROUND_LABELS['1/16'], r16.slice(8, 16), 'bcol-r16'),
  ].join('');

  const finalMatches = final.slice(0, 2);
  while (finalMatches.length < 2) finalMatches.push(tbdMatch());

  return `<div class="bracket-track bracket-track--split">
    <div class="bracket-side bracket-side--left">${left}</div>
    <div class="bracket-final">
      ${championSpotlight(finalMatches[0])}
      <div class="bcol bcol-final">
        <div class="bcol-label">Final</div>
        <div class="bcol-matches">
          ${bracketCard(finalMatches[0])}
          <div class="bcol-label bcol-label--minor">3rd-4th place</div>
          ${bracketCard(finalMatches[1])}
        </div>
      </div>
    </div>
    <div class="bracket-side bracket-side--right">${right}</div>
  </div>`;
}

// â”€â”€ render() â€” overrides players.js, shows bracket when Results tab active â”€â”€â”€â”€
function render() {
  const grid    = document.getElementById('resultsGrid');
  const countEl = document.getElementById('resultsCount');
  const lfPanel = document.getElementById('lfPanel');

  if (lfPanel) lfPanel.classList.add('is-hidden');
  if (countEl) countEl.textContent = '';
  document.getElementById('pagination')?.replaceChildren?.();

  if (!tournamentReady || !tournamentDays.length) {
    if (grid) {
      grid.innerHTML = tournamentError
        ? `<div class="error-state">${tournamentError}</div>`
        : '<div class="loading-state"><span class="loading-dot"></span><span class="loading-dot"></span><span class="loading-dot"></span></div>';
    }
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
      grid.innerHTML = '<div class="error-state">No play-off data for this day.</div>';
      return;
    }

    // Build pagination (same style as Group Stage)
    const curPage = safeIdx + 1;
    const WING = 2;
    const pageBtns = [];
    let prev = 0;
    for (let p = 1; p <= total; p++) {
      if (p === 1 || p === total || (p >= curPage - WING && p <= curPage + WING)) {
        if (p - prev > 1) pageBtns.push('<span class="page-ellipsis">â€¦</span>');
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
    grid.innerHTML = '<div class="error-state">Could not load play-off.</div>';
  });
}

window.bracketGoDay = function(idx) {
  tournamentDayIdx = idx;
  render();
  const sec = document.getElementById('resultsSection');
  if (sec) window.scrollTo({ top: sec.offsetTop - 80, behavior: 'smooth' });
};
