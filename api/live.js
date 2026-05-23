// ==============================================================================
// MI6 QUANTUM ORACLE - FULL FIXED BUILD
// Version: 10.3.0 MOBILE REPLACE BUILD
// Fixes: invalid score parsing, live/future mismatch, bowler extraction,
// last over extraction, odds extraction, and brittle row mixing.
// ==============================================================================
const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async function (req, res) {

  // ==============================================================================
  // HEADERS
  // ==============================================================================
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // ==============================================================================
  // INPUTS
  // ==============================================================================
  let targetUrl = req.query.url || "";
  let targetTeams = (req.query.teams || "").toLowerCase().trim();
  let userPosition = (req.query.position || "NONE").toUpperCase().trim();

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 13)',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
  };

  // ==============================================================================
  // PAYLOAD
  // ==============================================================================
  let payload = {
    title: "TARGET UNKNOWN",
    status: "Scanning Fields...",
    match_state: "standby",
    winner: "PENDING",

    live_score: "NO SCORE",
    current_rr: "NO CRR",
    required_rr: "NO REQ",

    batter_1: "NO BATTER 1",
    batter_2: "NO BATTER 2",
    bowler: "NO BOWLER",

    toss: "NO TOSS DATA",
    venue: "VENUE HIDDEN",

    last_over: ["-", "-", "-", "-", "-", "-"],

    prediction: "AI OFFLINE",
    match_prediction: "",

    source_url: "Hunting...",
    fetch_code: "OH"
  };

  // ==============================================================================
  // HELPERS
  // ==============================================================================
  const teamAliases = {
    "chennai": ["csk", "chennai", "super kings"],
    "lucknow": ["lsg", "lucknow", "super giants"],
    "mumbai": ["mi", "mumbai", "indians"],
    "punjab": ["pbks", "punjab", "kings"],
    "delhi": ["dc", "delhi", "capitals"],
    "gujarat": ["gt", "gujarat", "titans"],
    "kolkata": ["kkr", "kolkata", "knight riders"],
    "rajasthan": ["rr", "rajasthan", "royals"],
    "royal": ["rcb", "bengaluru", "bangalore", "challengers"],
    "sunrisers": ["srh", "hyderabad", "sunrisers"]
  };

  const homeVenues = {
    "csk": "M.A. Chidambaram Stadium, Chennai",
    "lsg": "Ekana Stadium, Lucknow",
    "mi": "Wankhede Stadium, Mumbai",
    "pbks": "Mullanpur Stadium",
    "dc": "Arun Jaitley Stadium, Delhi",
    "gt": "Narendra Modi Stadium, Ahmedabad",
    "kkr": "Eden Gardens, Kolkata",
    "rr": "Jaipur Stadium",
    "rcb": "Chinnaswamy Stadium, Bengaluru",
    "srh": "Rajiv Gandhi Intl Stadium, Hyderabad"
  };

  function escapeRegExp(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function normalize(str) {
    return String(str || "")
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function dedupeSimilarStrings(arr) {
    const out = [];
    arr.forEach(item => {
      const low = item.toLowerCase();
      const exists = out.find(x => {
        const xl = x.toLowerCase();
        return xl === low || xl.includes(low) || low.includes(xl);
      });
      if (!exists) out.push(item);
    });
    return out;
  }

  let t1 = targetTeams.split(' vs ')[0]?.trim().split(' ')[0] || "unknown";
  let t2 = targetTeams.split(' vs ')[1]?.trim().split(' ')[0] || "unknown";

  const t1A = teamAliases[t1] || [t1];
  const t2A = teamAliases[t2] || [t2];

  function matchesTeams(txt) {
    if (!txt) return false;
    const n = normalize(txt);
    return t1A.some(a => n.includes(normalize(a))) && t2A.some(a => n.includes(normalize(a)));
  }

  function extractTeamCodeFromText(text) {
    const n = normalize(text);
    for (const [code, aliases] of Object.entries(teamAliases)) {
      if (aliases.some(a => n.includes(normalize(a)))) return code.toUpperCase();
    }
    return "";
  }

  function isValidScore(runs, wickets, overs) {
    return (
      Number.isFinite(runs) &&
      Number.isFinite(wickets) &&
      Number.isFinite(overs) &&
      runs >= 0 &&
      runs <= 400 &&
      wickets >= 0 &&
      wickets <= 10 &&
      overs >= 0 &&
      overs <= 50
    );
  }

  function extractScoreFromText(text) {
    if (!text) return null;

    const candidates = [];
    const re = /([A-Z]{2,4})\s*(\d{1,3})[\/\-](\d{1,2})\s*\(?(\d{1,2}\.\d{1,2})\)?/gi;
    let m;

    while ((m = re.exec(text)) !== null) {
      const team = (m[1] || "").toUpperCase();
      const runs = parseInt(m[2], 10);
      const wickets = parseInt(m[3], 10);
      const overs = parseFloat(m[4]);

      if (isValidScore(runs, wickets, overs)) {
        candidates.push({
          team,
          runs,
          wickets,
          overs,
          raw: m[0]
        });
      }
    }

    if (candidates.length === 0) return null;

    const targetCodes = new Set(
      [t1, t2]
        .concat(t1A)
        .concat(t2A)
        .map(x => normalize(x))
        .filter(Boolean)
    );

    const preferred = candidates.find(c => {
      const teamN = normalize(c.team);
      return targetCodes.has(teamN) || targetCodes.has(teamN.toLowerCase());
    });

    return preferred || candidates[0];
  }

  function extractBatterRows(rows) {
    const batters = [];
    const batterRe = /([A-Z][a-zA-Z'.\-\s]{2,35}?)\s+(\d{1,3})\s*\(\s*(\d{1,3})\s*\)/;

    for (const row of rows) {
      const low = row.toLowerCase();

      if (
        low.includes('partnership') ||
        low.includes('extras') ||
        low.includes('yet to bat') ||
        low.includes('last wicket') ||
        low.includes('bowler') ||
        low.includes('crr') ||
        low.includes('rrr') ||
        low.includes('score') ||
        low.includes('innings')
      ) continue;

      const m = row.match(batterRe);
      if (!m) continue;

      const name = m[1]
        .replace(/\b(batter|batsman|striker)\b/ig, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (name.length < 3) continue;

      batters.push({
        text: `${name} ${m[2]}(${m[3]})`,
        striker: row.includes('*BAT*') || row.includes('🏏') || row.includes('*')
      });
    }

    return dedupeSimilarStrings(
      batters.map(b => JSON.stringify(b))
    ).map(s => JSON.parse(s));
  }

  function extractBowler(rows, text) {
    const patterns = [
      /bowler\s*[:\-]?\s*([A-Z][a-zA-Z'.\-\s]{2,35}?)(?:\s+\d|\s*$)/i,
      /([A-Z][a-zA-Z'.\-\s]{2,35}?)\s+\d+\-\d+\-\d+\-\d+/,
      /([A-Z][a-zA-Z'.\-\s]{2,35}?)\s+\d+\.\d+\s+\d+\s+\d+/,
      /([A-Z][a-zA-Z'.\-\s]{2,35}?)\s+\d+\.\d+\s+\d+/
    ];

    for (const row of rows) {
      const low = row.toLowerCase();
      if (
        low.includes('batter') ||
        low.includes('batsman') ||
        low.includes('partnership') ||
        low.includes('extras') ||
        low.includes('yet to bat')
      ) continue;

      for (const p of patterns) {
        const m = row.match(p);
        if (m && m[1]) {
          const nm = m[1]
            .replace(/\b(bowler|overs|econ|runs|wickets|spell|imp)\b/ig, '')
            .replace(/\s+/g, ' ')
            .trim();

          if (
            nm.length > 2 &&
            !normalize(nm).includes('josh inglis') &&
            !normalize(nm).includes('choudhary')
          ) {
            return nm;
          }
        }
      }
    }

    const extra = text.match(/bowler\s*[:\-]?\s*([A-Z][a-zA-Z'.\-\s]{2,35}?)(?:\s+\d|\s*$)/i);
    if (extra && extra[1]) {
      return extra[1].replace(/\s+/g, ' ').trim();
    }

    return "NO BOWLER";
  }

  function extractToss(text) {
    const tossPatterns = [
      /([A-Za-z\s'.\-]+won the toss and elected to [A-Za-z]+)/i,
      /([A-Za-z\s'.\-]+won the toss and chose to [A-Za-z]+)/i,
      /([A-Za-z\s'.\-]+opted to [A-Za-z]+)/i,
      /toss\s*[:\-]\s*([A-Za-z\s'.\-]+)/i
    ];

    for (const tp of tossPatterns) {
      const m = text.match(tp);
      if (m && m[1]) return m[1].replace(/\s+/g, ' ').trim();
    }
    return "NO TOSS DATA";
  }

  function extractVenue(text) {
    const venueMatch = text.match(/Venue\s*:?\s*([A-Za-z\s,.'\-()]+)/i);
    if (venueMatch && venueMatch[1]) {
      return venueMatch[1].replace(/\s+/g, ' ').trim();
    }
    return "";
  }

  function extractCurrentRR(text) {
    const crrMatch = text.match(/CRR\s*:?\s*(\d+(?:\.\d+)?)/i);
    return crrMatch ? crrMatch[1] : "NO CRR";
  }

  function extractRequiredRR(text) {
    const reqMatch = text.match(/(?:RRR|REQ|Required RR)\s*:?\s*(\d+(?:\.\d+)?)/i);
    return reqMatch ? reqMatch[1] : "1st Innings";
  }

  function extractLastOver(text) {
    const recentMatch = text.match(/Recent\s*[:\-]?\s*([0-6WNbwd\s|]+)/i);
    if (recentMatch && recentMatch[1]) {
      const arr = recentMatch[1]
        .replace(/\|/g, ' ')
        .split(/\s+/)
        .map(x => x.trim())
        .filter(Boolean)
        .slice(-6);
      if (arr.length > 0) return arr;
    }

    const overBlock = text.match(/Over\s+\d+\s+([0-6WNbwd\s]+)/i);
    if (overBlock && overBlock[1]) {
      const arr = overBlock[1]
        .split(/\s+/)
        .map(x => x.trim())
        .filter(Boolean)
        .slice(-6);
      if (arr.length > 0) return arr;
    }

    return ["-", "-", "-", "-", "-", "-"];
  }

  function extractOdds(text) {
    const oddsText = normalize(text);
    for (const [code, aliases] of Object.entries(teamAliases)) {
      for (const alias of aliases) {
        const re = new RegExp(
          `\\b${escapeRegExp(alias)}\\b[^\\d]{0,25}(\\d{1,3})[^\\d]{1,6}(\\d{1,3})`,
          'i'
        );

        const m = oddsText.match(re);
        if (!m) continue;

        const p1 = parseInt(m[1], 10);
        const p2 = parseInt(m[2], 10);

        if (
          Number.isFinite(p1) &&
          Number.isFinite(p2) &&
          p1 > 0 &&
          p2 > 0 &&
          p1 < 150 &&
          p2 < 150 &&
          Math.abs(p1 - p2) <= 5
        ) {
          const back = Math.min(p1, p2);
          const lay = Math.max(p1, p2);
          return {
            team: code.toUpperCase(),
            back,
            lay
          };
        }
      }
    }
    return null;
  }

  // ==============================================================================
  // MAIN
  // ==============================================================================
  try {

    const timestampBuster = Date.now();
    let htmlAcquired = false;
    let rawHtmlData = "";
    let pageTitle = "";
    let domRows = [];

    // ==============================================================================
    // CREX URL RESOLUTION
    // ==============================================================================
    let crexUrl = "";

    if (targetUrl.includes('crex.com') || targetUrl.includes('crex.live')) {
      crexUrl = targetUrl;
    }

    if (!crexUrl && targetTeams) {
      try {
        const fixtureRes = await axios.get(
          `https://crex.live/fixtures/match-list?_t=${timestampBuster}`,
          { headers, timeout: 8000 }
        );

        const $temp = cheerio.load(fixtureRes.data);
        $temp('a').each((i, el) => {
          const href = $temp(el).attr('href') || "";
          const txt = (($temp(el).text() || "") + " " + href).toLowerCase();

          if (
            matchesTeams(txt) &&
            (
              href.includes('scoreboard') ||
              href.includes('match') ||
              href.includes('score') ||
              href.includes('live')
            )
          ) {
            crexUrl = href.startsWith('http') ? href : 'https://crex.live' + href;
          }
        });
      } catch (e) {}
    }

    if (!crexUrl) {
      payload.status = "MATCH LINK NOT FOUND";
      return res.status(200).json({
        success: false,
        match_info: payload
      });
    }

    // ==============================================================================
    // FETCH MATCH PAGE
    // ==============================================================================
    try {
      const response = await axios.get(
        `${crexUrl}?_t=${timestampBuster}`,
        { headers, timeout: 10000 }
      );

      const html = response.data;
      const $ = cheerio.load(html);

      pageTitle = $('title').text() || "";

      rawHtmlData = html;

      let embeddedJson = "";

      const nextDataMatch = rawHtmlData.match(
        /<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s
      );
      if (nextDataMatch && nextDataMatch[1]) {
        embeddedJson += " " + nextDataMatch[1];
      }

      const apolloMatch = rawHtmlData.match(
        /window\.__APOLLO_STATE__\s*=\s*(\{.*?\});/s
      );
      if (apolloMatch && apolloMatch[1]) {
        embeddedJson += " " + apolloMatch[1];
      }

      const reduxMatch = rawHtmlData.match(
        /window\.__INITIAL_STATE__\s*=\s*(\{.*?\});/s
      );
      if (reduxMatch && reduxMatch[1]) {
        embeddedJson += " " + reduxMatch[1];
      }

      embeddedJson += " " + $('body').text();

      rawHtmlData = embeddedJson
        .replace(/\\u002F/g, '/')
        .replace(/\\u0026/g, '&')
        .replace(/\\"/g, '"')
        .replace(/\\n/g, ' ')
        .replace(/\\t/g, ' ')
        .replace(/\s+/g, ' ');

      htmlAcquired = true;
      payload.fetch_code = "UREKHA";
      payload.source_url = "CREX (Tier 1 Speed)";
    } catch (e) {}

    if (!htmlAcquired) {
      payload.status = "UPLINK FAILED";
      return res.status(200).json({
        success: false,
        match_info: payload
      });
    }

    // ==============================================================================
    // ROW ISOLATION
    // ==============================================================================
    const bodyForRows = rawHtmlData
      .replace(/<svg[^>]*>.*?<\/svg>/gi, ' *BAT* ')
      .replace(/class="[^"]*active[^"]*"/gi, ' *BAT* ')
      .replace(/<\/?(div|tr|p|li|table|tbody|span|section|article|header|footer)[^>]*>/gi, ' |ROW| ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&');

    cleanText = bodyForRows
      .replace(/<[^>]+>/g, ' ')
      .replace(/[{}[\]",]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    domRows = cleanText
      .split('|ROW|')
      .map(r => r.replace(/\s+/g, ' ').trim())
      .filter(Boolean);

    const combinedText = (pageTitle + " " + cleanText).replace(/\s+/g, ' ').trim();

    // ==============================================================================
    // TITLE
    // ==============================================================================
    const titleMatch =
      combinedText.match(/([A-Za-z][A-Za-z\s.']+?\s+(?:vs|v)\s+[A-Za-z][A-Za-z\s.']+)/i);

    if (titleMatch && titleMatch[1]) {
      payload.title = titleMatch[1]
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
    } else if (targetTeams) {
      payload.title = targetTeams.toUpperCase();
    }

    // ==============================================================================
    // SCORE
    // ==============================================================================
    let scoreObj = extractScoreFromText(combinedText);

    if (!scoreObj) {
      // try row-by-row, prioritizing rows that contain team names / score words
      for (const row of domRows) {
        const rowScore = extractScoreFromText(row);
        if (rowScore) {
          scoreObj = rowScore;
          break;
        }
      }
    }

    if (scoreObj) {
      payload.live_score = `${scoreObj.team} ${scoreObj.runs}/${scoreObj.wickets} (${scoreObj.overs})`;
      payload.match_state = "live";
    }

    // ==============================================================================
    // STATUS
    // ==============================================================================
    const lowerCombined = normalize(combinedText);
    if (/won by|tied|abandoned/.test(lowerCombined)) {
      payload.match_state = "completed";
    }

    if (payload.match_state === "live") {
      if (payload.status === "Scanning Fields..." || normalize(payload.status) === "live") {
        payload.status = "Live Match Active";
      }
    } else if (payload.match_state === "completed") {
      const winTxt = combinedText.match(/([A-Za-z\s'.\-]+won by\s+\d+\s+(runs|wickets))/i);
      payload.status = winTxt ? winTxt[1].trim() : "Match Completed";
    } else {
      payload.status = "Scanning Fields...";
    }

    // ==============================================================================
    // TOSS / VENUE / RR
    // ==============================================================================
    const toss = extractToss(combinedText);
    if (toss !== "NO TOSS DATA") payload.toss = toss;

    const venue = extractVenue(combinedText);
    if (venue) {
      payload.venue = venue;
    } else {
      const homeCode = t1A[0];
      if (homeVenues[homeCode]) payload.venue = homeVenues[homeCode];
    }

    payload.current_rr = extractCurrentRR(combinedText);
    payload.required_rr = extractRequiredRR(combinedText);

    // ==============================================================================
    // BATTERS
    // ==============================================================================
    const batters = extractBatterRows(domRows);

    if (batters[0]) {
      payload.batter_1 = batters[0].text + (batters[0].striker ? " 🏏" : "");
    }

    if (batters[1]) {
      payload.batter_2 = batters[1].text + (batters[1].striker ? " 🏏" : "");
    }

    // Fail-safe if one row was duplicated or first batter not tagged
    if (payload.batter_1 === payload.batter_2 && payload.batter_1 !== "NO BATTER 1") {
      payload.batter_2 = "NO BATTER 2";
    }

    // ==============================================================================
    // BOWLER
    // ==============================================================================
    const bowler = extractBowler(domRows, combinedText);
    if (bowler && bowler !== "NO BOWLER") {
      payload.bowler = bowler;
    }

    // ==============================================================================
    // LAST OVER
    // ==============================================================================
    payload.last_over = extractLastOver(combinedText);

    // ==============================================================================
    // TRUE ODDS
    // ==============================================================================
    const odds = extractOdds(combinedText);

    if (odds) {
      payload.match_prediction =
        `[LIVE MARKET ODDS] ${odds.team} is Favorite at ${odds.back}-${odds.lay} Paise\n` +
        `Win Probability: ${(100 / (100 + odds.back) * 100).toFixed(0)}%|` +
        `[ANALYSIS] ${odds.team} is controlling the live market.|` +
        `[DIRECTIVE] 🟢 PLAY (BACK) ${odds.team} at ${odds.back}p or EAT at ${odds.lay}p`;
    } else {
      payload.match_prediction = "[TRUE ODDS] WAITING FOR LIVE DATA";
    }

    // ==============================================================================
    // AI ENGINE
    // ==============================================================================
    if (payload.match_state === "live" && payload.live_score.includes('/')) {
      const sm = payload.live_score.match(/([A-Z]{2,4})\s(\d+)\/(\d+)\s\(([\d\.]+)\)/);

      if (sm) {
        const batTeam = sm[1];
        const runs = parseInt(sm[2], 10);
        const wkts = parseInt(sm[3], 10);
        const overs = parseFloat(sm[4]);

        const crr = parseFloat(payload.current_rr);
        let projected = 180;

        if (Number.isFinite(crr) && overs > 0) {
          projected = Math.floor((runs / overs) * 20);
        }

        let tactic = "🟡 HOLD - BALANCED";
        if (projected >= 210) tactic = "🟢 PLAY (BACK) - HIGH AGGRESSION";
        else if (projected <= 160) tactic = "🔴 EAT (LAY) - WEAK TOTAL";

        payload.prediction = `TARGETS: [20v: ${projected}] \nTACTIC: ${tactic}`;

        // If live score is very strong/weak, slightly refine output text without changing logic
        if (wkts >= 7) {
          payload.prediction = `TARGETS: [20v: ${projected}] \nTACTIC: 🔴 EAT (LAY) - COLLAPSING PATTERN`;
        }

        if (payload.match_prediction === "[TRUE ODDS] WAITING FOR LIVE DATA") {
          payload.match_prediction =
            `[TRUE ODDS] ${batTeam} is active at live pace|[ANALYSIS] Awaiting CREX odds telemetry.|[DIRECTIVE] 🟡 HOLD`;
        }
      }
    } else if (payload.match_state === "completed") {
      payload.prediction = "ORACLE OFFLINE";
    } else {
      payload.prediction = "ORACLE OFFLINE";
    }

    // ==============================================================================
    // FINAL MATCH-STATE SAFETY
    // ==============================================================================
    if (
      payload.live_score === "NO SCORE" ||
      payload.live_score === "Match Not Started"
    ) {
      payload.match_state = "future";
      payload.live_score = "Match Not Started";
      payload.prediction = "ORACLE OFFLINE";

      if (!payload.match_prediction) {
        payload.match_prediction = "[TRUE ODDS] WAITING FOR LIVE DATA";
      }
    } else if (payload.match_state !== "completed") {
      payload.match_state = "live";
    }

    // Normalize status if it is just lowercase "live"
    if (normalize(payload.status) === "live") {
      payload.status = "Live Match Active";
    }

    return res.status(200).json({
      success: true,
      match_info: payload
    });

  } catch (err) {
    payload.status = "FIREWALL BLOCKED CONNECTION";
    payload.live_score = "ERROR: Cannot Fetch";
    payload.prediction = "SCRAPER OFFLINE";
    payload.match_prediction = "DABBA LINE BLOCKED";
    payload.fetch_code = "OH";

    return res.status(200).json({
      success: false,
      error: err.message,
      match_info: payload
    });
  }
};
