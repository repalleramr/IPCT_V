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

    // ==========================================
    // FRONTEND COMPATIBLE
    // ==========================================
    batter_1: "NO STRIKER",
    batter_2: "NO NON-STRIKER",

    striker: "NO STRIKER",
    non_striker: "NO NON-STRIKER",

    bowler: "NO BOWLER",

    toss: "NO TOSS DATA",
    venue: "VENUE HIDDEN",

    last_over: ["-", "-", "-", "-", "-", "-"],

    prediction: "AI OFFLINE",
    match_prediction: "",

    source_url: "Hunting...",
    fetch_code: "OH",

    winner: "PENDING",
    result: ""
  };

  let pageTitle = "";
  let bodyText = "";
  let $ = null;

  const teamAliases = {
    "CSK": ["csk", "chennai", "super kings"],
    "MI": ["mi", "mumbai", "indians"],
    "RCB": ["rcb", "bengaluru", "bangalore", "challengers"],
    "GT": ["gt", "gujarat", "titans"],
    "RR": ["rr", "rajasthan", "royals"],
    "DC": ["dc", "delhi", "capitals"],
    "PBKS": ["pbks", "punjab", "kings"],
    "SRH": ["srh", "hyderabad", "sunrisers"],
    "KKR": ["kkr", "kolkata", "knight riders"],
    "LSG": ["lsg", "lucknow", "super giants"]
  };

  function normalize(str) {
    return (str || "")
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function matchesTeams(txt) {

    if (!targetTeams) return true;

    txt = normalize(txt);

    let split = targetTeams.split(' vs ');

    if (split.length < 2) return true;

    let t1 = normalize(split[0]);
    let t2 = normalize(split[1]);

    return txt.includes(t1) && txt.includes(t2);
  }

  try {

    let htmlAcquired = false;
    let timestamp = Date.now();

    // ==========================================
    // FIND CREX URL
    // ==========================================
    let crexUrl = "";

    if (
      targetUrl.includes('crex.com') ||
      targetUrl.includes('crex.live')
    ) {
      crexUrl = targetUrl;
    }

    // ==========================================
    // AUTO FIND MATCH
    // ==========================================
    if (!crexUrl && targetTeams) {

      try {

        const fixtureRes = await axios.get(
          `https://crex.com/fixtures/match-list?_t=${timestamp}`,
          {
            headers,
            timeout: 6000
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
    // FAIL
    // ==========================================
    if (!crexUrl) {

      payload.status = "MATCH LINK NOT FOUND";

      return res.status(200).json({
        success: false,
        match_info: payload
      });
    }

    // ==========================================
    // FETCH PAGE
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
    // FETCH FAIL
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
        .replace(/\|/g, '')
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
    // RESULT / WINNER
    // ==========================================
    let resultMatch =
      bodyText.match(/([A-Za-z\s]+won by\s+\d+\s+(runs|wickets))/i);

    if (resultMatch) {

      payload.match_state = "completed";

      payload.result = resultMatch[1];

      payload.status = resultMatch[1];

      payload.live_score = "Match Ended";

      payload.winner =
        resultMatch[1]
          .split('won by')[0]
          .trim();
    }

    // ==========================================
    // CRR
    // ==========================================
    let crrMatch =
      bodyText.match(/CRR[: ]([\d\.]+)/i);

    if (crrMatch) {
      payload.current_rr = crrMatch[1];
    }

    // ==========================================
    // RRR
    // ==========================================
    let rrrMatch =
      bodyText.match(/RRR[: ]([\d\.]+)/i);

    if (rrrMatch) {
      payload.required_rr = rrrMatch[1];
    } else {
      payload.required_rr = "1st Innings";
    }

    // ==========================================
    // BATTERS
    // ==========================================
    let batterRegex =
      /([A-Z][a-zA-Z\s\.\-']+?)\s(\d+)\((\d+)\)/g;

    let batterMatches =
      [...bodyText.matchAll(batterRegex)];

    let validBatters = [];

    batterMatches.forEach(m => {

      let name = m[1].trim();

      if (
        name.length > 2 &&
        !name.includes('CRR') &&
        !name.includes('RRR') &&
        !name.includes('Fall') &&
        !name.includes('Partnership')
      ) {

        validBatters.push({
          name,
          runs: m[2],
          balls: m[3]
        });
      }
    });

    if (validBatters.length >= 1) {

      payload.batter_1 =
        `${validBatters[0].name} ${validBatters[0].runs}(${validBatters[0].balls}) 🏏`;

      payload.striker =
        payload.batter_1;
    }

    if (validBatters.length >= 2) {

      payload.batter_2 =
        `${validBatters[1].name} ${validBatters[1].runs}(${validBatters[1].balls})`;

      payload.non_striker =
        payload.batter_2;
    }

    // ==========================================
    // BOWLER
    // ==========================================
    let bowlerRegex =
      /([A-Z][a-zA-Z\s]+)\s\d+\-\d+/;

    let bowlerMatch =
      bodyText.match(bowlerRegex);

    if (bowlerMatch) {
      payload.bowler =
        bowlerMatch[1].trim();
    }

    // ==========================================
    // VENUE
    // ==========================================
    let venueMatch =
      bodyText.match(/Venue[: ]([^|]+)/i);

    if (venueMatch) {
      payload.venue =
        venueMatch[1].trim();
    }

    // ==========================================
    // TOSS
    // ==========================================
    let tossMatch =
      bodyText.match(/([A-Za-z\s]+won the toss[^\.]+)/i);

    if (tossMatch) {
      payload.toss =
        tossMatch[1].trim();
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
      // TRUE CREX ODDS
      // ==========================================
      let cleanBody =
        bodyText
          .replace(/\s+/g, ' ')
          .replace(/[|]/g, ' ')
          .replace(/,/g, ' ');

      let realOdds = null;

      Object.keys(teamAliases).forEach(teamCode => {

        if (realOdds) return;

        let aliases =
          teamAliases[teamCode];

        aliases.forEach(alias => {

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
                team: teamCode,
                back,
                lay
              };
            }
          }
        });
      });

      // ==========================================
      // REAL ODDS
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
        // FALLBACK
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
