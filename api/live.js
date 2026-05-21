const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async function (req, res) {

  // ==========================================
  // ANTI CACHE
  // ==========================================
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.method === 'OPTIONS') return res.status(200).end();

  let targetUrl = req.query.url || "";
  let targetTeams = (req.query.teams || "").toLowerCase().trim();

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 13)',
    'Accept': 'text/html,application/xhtml+xml'
  };

  let payload = {
    title: "TARGET UNKNOWN",
    status: "Scanning Fields...",
    match_state: "standby",
    live_score: "NO SCORE",
    current_rr: "NO CRR",
    required_rr: "NO REQ",
    striker: "NO STRIKER",
    non_striker: "NO NON-STRIKER",
    bowler: "NO BOWLER",
    toss: "NO TOSS DATA",
    venue: "VENUE HIDDEN",
    last_over: ["-", "-", "-", "-", "-", "-"],
    prediction: "AI OFFLINE",
    match_prediction: "",
    source_url: "Hunting...",
    fetch_code: "OH"
  };

  let pageTitle = "";
  let bodyText = "";
  let $ = null;

  const teamAliases = {
    "chennai": ["CSK", "CHENNAI", "SUPER KINGS"],
    "lucknow": ["LSG", "LUCKNOW", "SUPER GIANTS"],
    "mumbai": ["MI", "MUMBAI", "INDIANS"],
    "punjab": ["PBKS", "PUNJAB", "KINGS"],
    "delhi": ["DC", "DELHI", "CAPITALS"],
    "gujarat": ["GT", "GUJARAT", "TITANS"],
    "kolkata": ["KKR", "KOLKATA", "KNIGHT RIDERS"],
    "rajasthan": ["RR", "RAJASTHAN", "ROYALS"],
    "royal": ["RCB", "BENGALURU", "BANGALORE", "CHALLENGERS"],
    "sunrisers": ["SRH", "HYDERABAD", "SUNRISERS"]
  };

  function matchesTeams(txt) {
    txt = txt.toLowerCase();

    let parts = targetTeams.split(' vs ');
    if (parts.length < 2) return true;

    let t1 = parts[0].trim();
    let t2 = parts[1].trim();

    return txt.includes(t1) && txt.includes(t2);
  }

  try {

    let timestampBuster = Date.now();

    // ==========================================
    // FETCH CREX
    // ==========================================
    let crexUrl = "";

    if (
      targetUrl.includes('crex.com') ||
      targetUrl.includes('crex.live')
    ) {
      crexUrl = targetUrl;
    }

    if (!crexUrl && targetTeams) {

      const listRes = await axios.get(
        `https://crex.com/fixtures/match-list?_t=${timestampBuster}`,
        { headers, timeout: 4000 }
      );

      const $$ = cheerio.load(listRes.data);

      $$('a').each((i, el) => {

        const txt = $$(el).text().toLowerCase();
        const href = $$(el).attr('href') || "";

        if (
          (txt.includes('ipl') || txt.includes('indian premier league')) &&
          matchesTeams(txt + " " + href)
        ) {
          crexUrl = href.startsWith('http')
            ? href
            : 'https://crex.com' + href;
        }
      });
    }

    if (!crexUrl) {
      payload.status = "MATCH LINK NOT FOUND";
      return res.status(200).json({
        success: false,
        match_info: payload
      });
    }

    const crexRes = await axios.get(
      `${crexUrl}?_t=${timestampBuster}`,
      { headers, timeout: 5000 }
    );

    $ = cheerio.load(crexRes.data);

    $('script, style, noscript').remove();

    pageTitle = $('title').text() || "";

    bodyText = $('body')
      .text()
      .replace(/\s+/g, ' ')
      .trim();

    payload.source_url = "CREX (Tier 1 Speed)";
    payload.fetch_code = "UREKHA";

    // ==========================================
    // TITLE
    // ==========================================
    payload.title = pageTitle
      .replace(/live score/gi, '')
      .replace(/cricket/gi, '')
      .trim()
      .toUpperCase();

    // ==========================================
    // LIVE SCORE
    // ==========================================
    let scoreRegex = /([A-Z]{2,4})\s(\d+)\/(\d+)\s\(([\d\.]+)\)/i;

    let scoreMatch = bodyText.match(scoreRegex);

    if (scoreMatch) {

      payload.match_state = "live";

      payload.live_score =
        `${scoreMatch[1]} ${scoreMatch[2]}/${scoreMatch[3]} (${scoreMatch[4]})`;

    } else {

      payload.match_state = "future";
      payload.live_score = "Match Not Started";
    }

    // ==========================================
    // STATUS
    // ==========================================
    payload.status = "Live Match Active";

    // ==========================================
    // CURRENT RR
    // ==========================================
    let crrMatch = bodyText.match(/CRR[: ]([\d\.]+)/i);

    if (crrMatch) {
      payload.current_rr = crrMatch[1];
    }

    // ==========================================
    // BATTERS
    // ==========================================
    let batterRegex =
      /([A-Z][a-zA-Z\s]+)\s(\d+)\((\d+)\)/g;

    let batters = [...bodyText.matchAll(batterRegex)];

    if (batters.length >= 2) {

      payload.striker =
        `${batters[0][1].trim()} ${batters[0][2]}(${batters[0][3]}) 🏏`;

      payload.non_striker =
        `${batters[1][1].trim()} ${batters[1][2]}(${batters[1][3]})`;
    }

    // ==========================================
    // VENUE
    // ==========================================
    let venueMatch = bodyText.match(/Venue[: ]([^|]+)/i);

    if (venueMatch) {
      payload.venue = venueMatch[1].trim();
    }

    // ==========================================
    // LAST OVER
    // ==========================================
    let recentMatch = bodyText.match(/Recent[: ]([0-9WwdNb\s]+)/i);

    if (recentMatch) {

      payload.last_over = recentMatch[1]
        .split(/\s+/)
        .filter(x => x.trim())
        .slice(-6);
    }

    // ==========================================
    // PREDICTION ENGINE
    // ==========================================
    let scoreData = payload.live_score.match(
      /([A-Z]{2,4})\s(\d+)\/(\d+)\s\(([\d\.]+)\)/
    );

    if (scoreData) {

      let battingTeam = scoreData[1];
      let runs = parseInt(scoreData[2]);
      let wickets = parseInt(scoreData[3]);
      let overs = parseFloat(scoreData[4]);

      // ==========================================
      // TARGET PREDICTION
      // ==========================================
      let projected20 =
        Math.floor(runs + ((20 - overs) * parseFloat(payload.current_rr || 9)));

      payload.prediction =
        `TARGETS: [20v: ${projected20}] \nTACTIC: 🟢 PLAY (BACK) - HIGH AGGRESSION`;

      // ==========================================
      // TRUE CREX ODDS ENGINE
      // ==========================================
      let cleanBody = bodyText
        .replace(/\s+/g, ' ')
        .replace(/[|]/g, ' ')
        .replace(/,/g, ' ');

      let crexOdds = null;

      const activeTeams = [];

      Object.keys(teamAliases).forEach(key => {

        teamAliases[key].forEach(alias => {

          if (
            payload.title.toUpperCase().includes(alias)
          ) {
            activeTeams.push(alias);
          }
        });
      });

      const uniqueTeams = [...new Set(activeTeams)];

      // ==========================================
      // STRICT GT 44 45 FORMAT ONLY
      // ==========================================
      for (let tm of uniqueTeams) {

        const strictRegex = new RegExp(
          `\\b${tm}\\b\\s+(\\d{1,3})\\s+(\\d{1,3})\\b`,
          'i'
        );

        const match = cleanBody.match(strictRegex);

        if (match) {

          let back = parseInt(match[1]);
          let lay = parseInt(match[2]);

          if (
            back > 0 &&
            lay > 0 &&
            back <= 500 &&
            lay <= 500 &&
            Math.abs(back - lay) <= 30
          ) {

            crexOdds = {
              team: tm,
              back,
              lay
            };

            break;
          }
        }
      }

      // ==========================================
      // USE REAL CREX ODDS
      // ==========================================
      if (crexOdds) {

        const favTeam = crexOdds.team;
        const back = crexOdds.back;
        const lay = crexOdds.lay;

        const probability =
          (100 / (100 + back)) * 100;

        payload.match_prediction =
          `[LIVE MARKET ODDS] ${favTeam} is Favorite at ${back}-${lay} Paise\n` +
          `Win Probability: ${probability.toFixed(0)}%|` +
          `[ANALYSIS] ${favTeam} is controlling the live market.|` +
          `[DIRECTIVE] 🟢 PLAY (BACK) ${favTeam} at ${back}p or EAT at ${lay}p`;

      } else {

        // ==========================================
        // FALLBACK AI ODDS
        // ==========================================
        let aiPaise = 45;

        if (runs > 180 && wickets <= 3) {
          aiPaise = 28;
        }

        payload.match_prediction =
          `[TRUE ODDS] ${battingTeam} is Favorite at ${aiPaise}-${aiPaise + 1} Paise\n` +
          `Win Probability: 65%|` +
          `[ANALYSIS] AI generated fallback odds.|` +
          `[DIRECTIVE] 🟡 HOLD`;
      }
    }

    return res.status(200).json({
      success: true,
      match_info: payload
    });

  } catch (err) {

    payload.status = "SCRAPER ERROR";
    payload.live_score = "ERROR";
    payload.fetch_code = "OH";

    return res.status(200).json({
      success: false,
      error: err.message,
      match_info: payload
    });
  }
};
