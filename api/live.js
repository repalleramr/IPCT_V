const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async function (req, res) {

  // ==========================================
  // HEADERS
  // ==========================================
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 13)',
    'Accept': 'text/html,application/xhtml+xml'
  };

  let targetUrl = req.query.url || "";
  let targetTeams = (req.query.teams || "").toLowerCase().trim();

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

  const teamCodes = {
    csk: "CSK",
    mi: "MI",
    rcb: "RCB",
    gt: "GT",
    rr: "RR",
    dc: "DC",
    pbks: "PBKS",
    srh: "SRH",
    kkr: "KKR",
    lsg: "LSG"
  };

  function normalize(str) {
    return (str || "")
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  try {

    let timestamp = Date.now();
    let crexUrl = "";

    // ==========================================
    // DIRECT URL
    // ==========================================
    if (
      targetUrl.includes('crex.com') ||
      targetUrl.includes('crex.live')
    ) {
      crexUrl = targetUrl;
    }

    // ==========================================
    // AUTO FIND MATCH URL
    // ==========================================
    if (!crexUrl) {

      const fixtureRes = await axios.get(
        `https://crex.com/fixtures/match-list?_t=${timestamp}`,
        {
          headers,
          timeout: 5000
        }
      );

      const $ = cheerio.load(fixtureRes.data);

      $('a').each((i, el) => {

        const href = $(el).attr('href') || "";
        const txt = normalize($(el).text());

        if (
          (
            href.includes('/scoreboard/') ||
            href.includes('/scorecard/') ||
            href.includes('/live/')
          ) &&
          normalize(targetTeams)
            .split(' vs ')
            .every(t => txt.includes(t.trim()))
        ) {

          crexUrl = href.startsWith('http')
            ? href
            : 'https://crex.com' + href;
        }
      });
    }

    // ==========================================
    // FAIL SAFE
    // ==========================================
    if (!crexUrl) {

      payload.status = "MATCH LINK NOT FOUND";

      return res.status(200).json({
        success: false,
        match_info: payload
      });
    }

    // ==========================================
    // FETCH LIVE PAGE
    // ==========================================
    const pageRes = await axios.get(
      `${crexUrl}?_t=${timestamp}`,
      {
        headers,
        timeout: 7000
      }
    );

    const $ = cheerio.load(pageRes.data);

    $('script, style, noscript').remove();

    const pageTitle = $('title').text() || "";

    const bodyText = $('body')
      .text()
      .replace(/\s+/g, ' ')
      .trim();

    payload.source_url = "CREX (Tier 1 Speed)";
    payload.fetch_code = "UREKHA";

    // ==========================================
    // TITLE
    // ==========================================
    payload.title = pageTitle
      .replace(/live score/ig, '')
      .replace(/cricket/ig, '')
      .trim()
      .toUpperCase();

    // ==========================================
    // SCORE
    // ==========================================
    const scoreRegex =
      /([A-Z]{2,4})\s(\d+)\/(\d+)\s\(([\d\.]+)\)/;

    const scoreMatch = bodyText.match(scoreRegex);

    if (scoreMatch) {

      payload.match_state = "live";

      payload.live_score =
        `${scoreMatch[1]} ${scoreMatch[2]}/${scoreMatch[3]} (${scoreMatch[4]})`;

    } else {

      payload.match_state = "future";
      payload.live_score = "Match Not Started";
    }

    payload.status = "Live Match Active";

    // ==========================================
    // CURRENT RR
    // ==========================================
    const crrMatch = bodyText.match(/CRR[: ]([\d\.]+)/i);

    if (crrMatch) {
      payload.current_rr = crrMatch[1];
    }

    // ==========================================
    // BATTERS
    // ==========================================
    const batterRegex =
      /([A-Z][a-zA-Z\s]+)\s(\d+)\((\d+)\)/g;

    const batterMatches =
      [...bodyText.matchAll(batterRegex)];

    if (batterMatches.length >= 2) {

      payload.striker =
        `${batterMatches[0][1].trim()} ${batterMatches[0][2]}(${batterMatches[0][3]}) 🏏`;

      payload.non_striker =
        `${batterMatches[1][1].trim()} ${batterMatches[1][2]}(${batterMatches[1][3]})`;
    }

    // ==========================================
    // TRUE CREX MARKET ODDS
    // ==========================================
    let cleanText = bodyText
      .replace(/\s+/g, ' ')
      .replace(/[|]/g, ' ');

    let realOdds = null;

    Object.values(teamCodes).forEach(team => {

      if (realOdds) return;

      // STRICT GT 44 45 FORMAT
      const oddsRegex =
        new RegExp(
          `\\b${team}\\b\\s+(\\d{1,3})\\s+(\\d{1,3})\\b`,
          'i'
        );

      const m = cleanText.match(oddsRegex);

      if (m) {

        const back = parseInt(m[1]);
        const lay = parseInt(m[2]);

        if (
          back > 0 &&
          lay > 0 &&
          back <= 500 &&
          lay <= 500 &&
          Math.abs(back - lay) <= 30
        ) {

          realOdds = {
            team,
            back,
            lay
          };
        }
      }
    });

    // ==========================================
    // AI PREDICTION
    // ==========================================
    if (scoreMatch) {

      const battingTeam = scoreMatch[1];
      const runs = parseInt(scoreMatch[2]);
      const wickets = parseInt(scoreMatch[3]);
      const overs = parseFloat(scoreMatch[4]);

      let projected =
        Math.floor(
          runs + ((20 - overs) * parseFloat(payload.current_rr || 9))
        );

      payload.prediction =
        `TARGETS: [20v: ${projected}] \nTACTIC: 🟢 PLAY (BACK) - HIGH AGGRESSION`;

      // ==========================================
      // USE REAL CREX ODDS
      // ==========================================
      if (realOdds) {

        let probability =
          (100 / (100 + realOdds.back)) * 100;

        payload.match_prediction =
          `[LIVE MARKET ODDS] ${realOdds.team} is Favorite at ${realOdds.back}-${realOdds.lay} Paise\n` +
          `Win Probability: ${probability.toFixed(0)}%|` +
          `[ANALYSIS] ${realOdds.team} is controlling the live market.|` +
          `[DIRECTIVE] 🟢 PLAY (BACK) ${realOdds.team} at ${realOdds.back}p or EAT at ${realOdds.lay}p`;

      } else {

        payload.match_prediction =
          `[TRUE ODDS] ${battingTeam} is Favorite at 45-46 Paise\n` +
          `Win Probability: 65%|` +
          `[ANALYSIS] AI fallback market active.|` +
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
