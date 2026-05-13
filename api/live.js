const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async function (req, res) {

  // =========================
  // HEADERS
  // =========================
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Prevent caching
  res.setHeader(
    'Cache-Control',
    'no-store, max-age=0, must-revalidate, proxy-revalidate'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // =========================
  // TEAM QUERY PARSER
  // =========================
  let query = req.query.teams || "";

  if (!query && req.url.includes('teams=')) {
    query = decodeURIComponent(
      req.url.split('teams=')[1].split('&')[0]
    );
  }

  let targetTeams = query
    .toLowerCase()
    .replace(/\+/g, ' ')
    .trim();

  if (!targetTeams || targetTeams === "vs") {
    return res.status(200).json({
      success: false,
      error: "Satellite waiting for target teams..."
    });
  }

  // =========================
  // TEAM ALIASES
  // =========================
  const teamAliases = {
    "chennai": ["csk", "chennai"],
    "csk": ["csk", "chennai"],

    "delhi": ["dc", "delhi"],
    "dc": ["dc", "delhi"],

    "gujarat": ["gt", "gujarat"],
    "gt": ["gt", "gujarat"],

    "kolkata": ["kkr", "kolkata"],
    "kkr": ["kkr", "kolkata"],

    "lucknow": ["lsg", "lucknow"],
    "lsg": ["lsg", "lucknow"],

    "mumbai": ["mi", "mumbai"],
    "mi": ["mi", "mumbai"],

    "punjab": ["pbks", "punjab", "kings"],
    "pbks": ["pbks", "punjab", "kings"],

    "rajasthan": ["rr", "rajasthan"],
    "rr": ["rr", "rajasthan"],

    "royal": ["rcb", "royal", "bengaluru", "bangalore"],
    "rcb": ["rcb", "royal", "bengaluru", "bangalore"],

    "sunrisers": ["srh", "sunrisers", "hyderabad"],
    "srh": ["srh", "sunrisers", "hyderabad"]
  };

  try {

    // =========================
    // REQUEST HEADERS
    // =========================
    const headers = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };

    // =========================
    // TEAM EXTRACTION
    // =========================
    let t1 = targetTeams
      .split(' vs ')[0]
      ?.trim()
      .toLowerCase() || "";

    let t2 = targetTeams
      .split(' vs ')[1]
      ?.trim()
      .toLowerCase() || "";

    const t1A = teamAliases[t1] || [t1];
    const t2A = teamAliases[t2] || [t2];

    // =========================
    // FETCH RECENT MATCHES
    // =========================
    const recentUrl =
      'https://www.cricbuzz.com/cricket-match/live-scores/recent-matches';

    const { data } = await axios.get(recentUrl, {
      headers,
      timeout: 10000
    });

    const $ = cheerio.load(data);

    let matchUrl = null;

    // =========================
    // FIND MATCH
    // =========================
    $('a').each((i, el) => {

      const href = $(el).attr('href') || "";

      const text = (
        $(el).text() + " " + href
      ).toLowerCase();

      const looksLikeMatch =
        href.includes('scores') ||
        href.includes('match') ||
        href.includes('live');

      const hasT1 = t1A.some(a => text.includes(a));
      const hasT2 = t2A.some(a => text.includes(a));

      if (looksLikeMatch && hasT1 && hasT2) {

        matchUrl = href.startsWith('http')
          ? href
          : 'https://www.cricbuzz.com' + href;

        return false;
      }
    });

    // =========================
    // NO MATCH FOUND
    // =========================
    if (!matchUrl) {
      throw new Error(
        `Target ${t1} vs ${t2} not in Matrix.`
      );
    }

    // =========================
    // FETCH MATCH PAGE
    // =========================
    const { data: mHtml } = await axios.get(matchUrl, {
      headers,
      timeout: 10000
    });

    const $m = cheerio.load(mHtml);

    // =========================
    // STATUS DETECTION
    // =========================
    let status = "";

    const statusSelectors = [
      '.cb-text-complete',
      '.cb-status-msg',
      '.cb-text-live',
      '.cb-mini-status'
    ];

    for (const sel of statusSelectors) {

      const txt = $m(sel)
        .first()
        .text()
        .trim();

      if (txt) {
        status = txt;
        break;
      }
    }

    if (!status) {
      status = "Live telemetry active";
    }

    // =========================
    // SCORE DETECTION
    // =========================
    let score = "";

    const scoreSelectors = [
      '.cb-min-bat-rw',
      '.cb-font-20',
      '.cb-scrs-wrp',
      '.cb-col-100.cb-col',
      '.cb-col.cb-col-100.cb-min-tm'
    ];

    for (const sel of scoreSelectors) {

      const txt = $m(sel)
        .first()
        .text()
        .trim();

      if (txt && txt.length > 3) {
        score = txt;
        break;
      }
    }

    // Regex fallback
    if (!score) {

      const bodyText = $m('body').text();

      const match = bodyText.match(
        /\\d{1,3}\\/\\d{1,2}/
      );

      if (match) {
        score = match[0];
      }
    }

    // =========================
    // MATCH COMPLETE CHECK
    // =========================
    const isComplete =
      status.toLowerCase().includes('won') ||
      status.toLowerCase().includes('result') ||
      status.toLowerCase().includes('complete') ||
      $m('.cb-text-complete').length > 0;

    // =========================
    // SIMPLE AI PREDICTION
    // =========================
    let prediction = "Balanced";

    if (score.includes('/')) {

      const runs = parseInt(
        score.split('/')[0]
      );

      if (runs > 200) {
        prediction =
          "Batting Side Heavy Favorite";
      }
      else if (runs > 170) {
        prediction =
          "Batting Side Slight Edge";
      }
      else if (runs < 140) {
        prediction =
          "Bowling Side Pressure Building";
      }
    }

    if (isComplete) {
      prediction = "Mission Secured";
    }

    // =========================
    // FINAL RESPONSE
    // =========================
    return res.status(200).json({

      success: true,

      match_info: {

        title: isComplete
          ? "MISSION ACCOMPLISHED"
          : "IPCT TARGET LOCKED",

        live_score: score || (
          isComplete
            ? "Match Ended"
            : "Pre-Match Intel"
        ),

        status: status,

        bowler: isComplete
          ? "Mission Over"
          : "Active Play",

        last_balls: isComplete
          ? ["E","N","D"]
          : ["1","0","W","4","0","1"],

        prediction: prediction,

        source_url: matchUrl
      }
    });

  }
  catch (err) {

    return res.status(200).json({

      success: false,

      error: err.message || "Unknown uplink failure"
    });
  }
};
