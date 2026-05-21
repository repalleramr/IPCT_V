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
    "csk": ["csk", "chennai", "super kings"],
    "mi": ["mi", "mumbai", "indians"],
    "rcb": ["rcb", "bengaluru", "bangalore", "challengers"],
    "gt": ["gt", "gujarat", "titans"],
    "rr": ["rr", "rajasthan", "royals"],
    "dc": ["dc", "delhi", "capitals"],
    "pbks": ["pbks", "punjab", "kings"],
    "srh": ["srh", "hyderabad", "sunrisers"],
    "kkr": ["kkr", "kolkata", "knight riders"],
    "lsg": ["lsg", "lucknow", "super giants"]
  };

  function matchesTeams(txt) {

    if (!targetTeams) return true;

    txt = txt.toLowerCase();

    let split = targetTeams.split(' vs ');

    if (split.length < 2) return true;

    let t1 = split[0].trim();
    let t2 = split[1].trim();

    return txt.includes(t1) && txt.includes(t2);
  }

  try {

    let htmlAcquired = false;
    let timestamp = Date.now();

    // ==========================================
    // CREX URL FINDER
    // ==========================================
    let crexUrl = "";

    if (
      targetUrl.includes('crex.com') ||
      targetUrl.includes('crex.live')
    ) {
      crexUrl = targetUrl;
    }

    // ==========================================
    // AUTO FIND LIVE MATCH
    // ==========================================
    if (!crexUrl && targetTeams) {

      try {

        const fixtureRes = await axios.get(
          `https://crex.com/fixtures/match-list?_t=${timestamp}`,
          {
            headers,
            timeout: 5000
          }
        );

        const $$ = cheerio.load(fixtureRes.data);

        $$('a').each((i, el) => {

          const txt =
            ($$(el).text() || "").toLowerCase();

          const href =
            $$(el).attr('href') || "";

          const combined = txt + " " + href;

          if (
            (
              href.includes('score') ||
              href.includes('match-updates') ||
              href.includes('live-score')
            ) &&
            matchesTeams(combined)
          ) {

            crexUrl = href.startsWith('http')
              ? href
              : 'https://crex.com' + href;
          }
        });

      } catch (e) {}
    }

    // ==========================================
    // MATCH NOT FOUND
    // ==========================================
    if (!crexUrl) {

      payload.status = "MATCH LINK NOT FOUND";

      return res.status(200).json({
        success: false,
        match_info: payload
      });
    }

    // ==========================================
    // FETCH MATCH PAGE
    // ==========================================
    try {

      const pageRes = await axios.get(
        `${crexUrl}?_t=${timestamp}`,
        {
          headers,
          timeout: 7000
        }
      );

      $ = cheerio.load(pageRes.data);

      $('script, style, noscript').remove();

      pageTitle =
        $('title').text() || "";

      bodyText =
        $('body')
          .text()
          .replace(/\s+/g, ' ')
          .trim();

      payload.source_url = "CREX (Tier 1 Speed)";
      payload.fetch_code = "UREKHA";

      htmlAcquired = true;

    } catch (e) {}

    // ==========================================
    // FAIL
    // ==========================================
    if (!htmlAcquired) {

      payload.status = "UPLINK FAILED";

      return res.status(200).json({
        success: false,
        match_info: payload
      });
    }

    // ==========================================
    // TITLE
    // ==========================================
    payload.title =
      pageTitle
        .replace(/live score/ig, '')
        .replace(/cricket/ig, '')
        .trim()
        .toUpperCase();

    // ==========================================
    // SCORE
    // ==========================================
    let scoreRegex =
      /([A-Z]{2,4})\s(\d+)\/(\d+)\s\(([\d\.]+)\)/;

    let scoreMatch =
      bodyText.match(scoreRegex);

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
    // CRR
    // ==========================================
    let crrMatch =
      bodyText.match(/CRR[: ]([\d\.]+)/i);

    if (crrMatch) {
      payload.current_rr = crrMatch[1];
    }

    // ==========================================
    // BATTERS
    // ==========================================
    let batterRegex =
      /([A-Z][a-zA-Z\s\.\-']+?)\s(\d+)\((\d+)\)/g;

    let batterMatches =
      [...bodyText.matchAll(batterRegex)];

    if (batterMatches.length >= 2) {

      payload.striker =
        `${batterMatches[0][1].trim()} ${batterMatches[0][2]}(${batterMatches[0][3]}) 🏏`;

      payload.non_striker =
        `${batterMatches[1][1].trim()} ${batterMatches[1][2]}(${batterMatches[1][3]})`;
    }

    // ==========================================
    // VENUE
    // ==========================================
    let venueMatch =
      bodyText.match(/Venue[: ]([^|]+)/i);

    if (venueMatch) {
      payload.venue = venueMatch[1].trim();
    }

    // ==========================================
    // LAST OVER
    // ==========================================
    let recentMatch =
      bodyText.match(/Recent[: ]([0-9WwdNb\s]+)/i);

    if (recentMatch) {

      payload.last_over =
        recentMatch[1]
          .split(/\s+/)
          .filter(x => x.trim())
          .slice(-6);
    }

    // ==========================================
    // PREDICTION ENGINE
    // ==========================================
    if (scoreMatch) {

      let battingTeam =
        scoreMatch[1];

      let runs =
        parseInt(scoreMatch[2]);

      let wickets =
        parseInt(scoreMatch[3]);

      let overs =
        parseFloat(scoreMatch[4]);

      let crr =
        parseFloat(payload.current_rr || 9);

      let projected20 =
        Math.floor(
          runs + ((20 - overs) * crr)
        );

      payload.prediction =
        `TARGETS: [20v: ${projected20}] \nTACTIC: 🟢 PLAY (BACK) - HIGH AGGRESSION`;

      // ==========================================
      // TRUE CREX ODDS ENGINE
      // ==========================================
      let cleanBody =
        bodyText
          .replace(/\s+/g, ' ')
          .replace(/[|]/g, ' ')
          .replace(/,/g, ' ');

      let realOdds = null;

      Object.keys(teamAliases).forEach(key => {

        if (realOdds) return;

        teamAliases[key].forEach(alias => {

          if (realOdds) return;

          const regex =
            new RegExp(
              `\\b${alias.toUpperCase()}\\b\\s+(\\d{1,3})\\s+(\\d{1,3})\\b`,
              'i'
            );

          const m =
            cleanBody.match(regex);

          if (m) {

            let back =
              parseInt(m[1]);

            let lay =
              parseInt(m[2]);

            if (
              back > 0 &&
              lay > 0 &&
              back <= 500 &&
              lay <= 500 &&
              Math.abs(back - lay) <= 30
            ) {

              realOdds = {
                team: key.toUpperCase(),
                back,
                lay
              };
            }
          }
        });
      });

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

        // ==========================================
        // AI FALLBACK
        // ==========================================
        let aiBack = 45;
        let aiLay = 46;

        if (runs >= 200 && wickets <= 3) {
          aiBack = 28;
          aiLay = 29;
        }

        payload.match_prediction =
          `[TRUE ODDS] ${battingTeam} is Favorite at ${aiBack}-${aiLay} Paise\n` +
          `Win Probability: 65%|` +
          `[ANALYSIS] AI generated fallback market.|` +
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
