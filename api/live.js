const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async function (req, res) {

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
  let rawDateStr = req.query.time || "";
  let userPosition = (req.query.position || "NONE").toUpperCase().trim();

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 13; SM-G991U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
  };

  let payload = {
    title: "TARGET UNKNOWN",
    status: "Scanning Fields...",
    match_state: "standby",
    winner: "PENDING",

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
    "pbks": "Mullanpur / Mohali",
    "dc": "Arun Jaitley Stadium, Delhi",
    "gt": "Narendra Modi Stadium, Ahmedabad",
    "kkr": "Eden Gardens, Kolkata",
    "rr": "Sawai Mansingh Stadium, Jaipur",
    "rcb": "M. Chinnaswamy Stadium, Bengaluru",
    "srh": "Rajiv Gandhi Intl Stadium, Hyderabad"
  };

  function escapeRegExp(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  let t1 = targetTeams.split(' vs ')[0]?.trim().split(' ')[0] || "unknown";
  let t2 = targetTeams.split(' vs ')[1]?.trim().split(' ')[0] || "unknown";

  const t1A = teamAliases[t1] || [t1];
  const t2A = teamAliases[t2] || [t2];

  function matchesTeams(txt) {
    if (!txt) return false;

    return (
      t1A.some(a => txt.includes(a)) &&
      t2A.some(a => txt.includes(a))
    );
  }

  try {

    let htmlAcquired = false;
    let timestampBuster = Date.now();

    // ==========================================================
    // CREX FETCH
    // ==========================================================

    try {

      let crexUrl = "";

      const cxRes = await axios.get(
        `https://crex.com/fixtures/match-list?_t=${timestampBuster}`,
        {
          headers,
          timeout: 4000
        }
      );

      const $temp = cheerio.load(cxRes.data);

      $temp('a').each((i, el) => {

        let txt = $temp(el).text().toLowerCase();
        let href = $temp(el).attr('href') || "";

        if (
          matchesTeams(txt + " " + href) &&
          (
            href.includes('scoreboard') ||
            href.includes('match')
          )
        ) {

          crexUrl = href.startsWith('http')
            ? href
            : 'https://crex.com' + href;
        }
      });

      if (crexUrl) {

        const cRes = await axios.get(
          `${crexUrl}?_t=${timestampBuster}`,
          {
            headers,
            timeout: 5000
          }
        );

        $ = cheerio.load(cRes.data);

        $('script,style,noscript').remove();

        pageTitle = $('title').text() || "";

        let rawHtml = $('body').html() || "";

        rawHtml = rawHtml
          .replace(/<svg[^>]*>.*?<\/svg>/gis, ' *BAT* ')
          .replace(/&nbsp;/gi, ' ')
          .replace(/&amp;/gi, '&');

        bodyText = rawHtml
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        payload.source_url = "CREX (Tier 1 Speed)";
        payload.fetch_code = "UREKHA";

        htmlAcquired = true;
      }

    } catch (e) {}

    // ==========================================================
    // FAILSAFE
    // ==========================================================

    if (!htmlAcquired) {

      payload.status = "UPLINK FAILED";
      payload.fetch_code = "OH";

      return res.status(200).json({
        success: false,
        match_info: payload
      });
    }

    // ==========================================================
    // TITLE
    // ==========================================================

    let vsMatch = pageTitle.match(
      /([a-zA-Z0-9\s]+?\s+(?:vs|v)\s+[a-zA-Z0-9\s]+)/i
    );

    if (vsMatch) {
      payload.title = vsMatch[1]
        .replace(/live/gi, '')
        .replace(/cricket/gi, '')
        .trim()
        .toUpperCase();
    } else {
      payload.title = targetTeams.toUpperCase();
    }

    // ==========================================================
    // VENUE
    // ==========================================================

    let venueMatch = bodyText.match(/Venue\s*:\s*([^•|]+)/i);

    if (venueMatch) {
      payload.venue = venueMatch[1].trim();
    } else {

      let homeCode = t1A[0];

      if (homeVenues[homeCode]) {
        payload.venue = homeVenues[homeCode];
      }
    }

    // ==========================================================
    // STATUS
    // ==========================================================

    let scoreRegex = /([A-Z]{2,4})\s*(\d+)\/(\d+)\s*\(([\d\.]+)\)/;

    let scoreMatch = bodyText.match(scoreRegex);

    if (scoreMatch) {

      payload.match_state = "live";

      payload.live_score =
        `${scoreMatch[1]} ${scoreMatch[2]}/${scoreMatch[3]} (${scoreMatch[4]})`;

    } else {

      payload.match_state = "future";
      payload.live_score = "Match Not Started";
    }

    // ==========================================================
    // STATUS TEXT
    // ==========================================================

    let statusText = "";

    statusText =
      $('.match-status').first().text().trim() ||
      $('.cb-status').first().text().trim() ||
      $('.status').first().text().trim();

    if (!statusText) {

      if (payload.match_state === "live") {
        statusText = "Live";
      } else {
        statusText = "Upcoming";
      }
    }

    payload.status = statusText;

    // ==========================================================
    // TOSS
    // ==========================================================

    let tossMatch = bodyText.match(
      /([A-Za-z\s]+ won the toss [A-Za-z\s]+)/i
    );

    if (tossMatch) {
      payload.toss = tossMatch[1].trim();
    }

    // ==========================================================
    // RR
    // ==========================================================

    let crrMatch = bodyText.match(/CRR[: ]+([\d\.]+)/i);

    if (crrMatch) {
      payload.current_rr = crrMatch[1];
    }

    let reqMatch = bodyText.match(/REQ[: ]+([\d\.]+)/i);

    if (reqMatch) {
      payload.required_rr = reqMatch[1];
    } else {
      payload.required_rr = "1st Innings";
    }

    // ==========================================================
    // LAST OVER
    // ==========================================================

    let recentMatch = bodyText.match(
      /Recent[: ]+([0-9WNbwd\s]+)/i
    );

    if (recentMatch) {

      let balls = recentMatch[1]
        .split(/\s+/)
        .filter(x => x.trim());

      payload.last_over = balls.slice(-6);
    }

    // ==========================================================
    // STRIKER ENGINE
    // ==========================================================

    try {

      let safeText = bodyText
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/([a-zA-Z])(\d)/g, '$1 $2');

      let batterRegex =
        /([A-Z][a-zA-Z\s\.\-']{2,30}?)\s+(\d{1,3})\s*\(\s*(\d{1,3})\s*\)/g;

      let allBatters = [...safeText.matchAll(batterRegex)];

      let validBatters = [];

      allBatters.forEach(m => {

        let rawName = m[1]
          .replace(/[A-Z]{3,}/g, '')
          .replace(/\s+/g, ' ')
          .trim();

        if (
          rawName.length > 2 &&
          !rawName.toLowerCase().includes('bowler') &&
          !rawName.toLowerCase().includes('partnership') &&
          !rawName.toLowerCase().includes('extras')
        ) {

          validBatters.push({
            full: `${rawName} ${m[2]}(${m[3]})`,
            name: rawName,
            runs: parseInt(m[2]),
            balls: parseInt(m[3])
          });
        }
      });

      // REMOVE DUPLICATES

      let uniqueBatters = [];

      validBatters.forEach(v => {

        if (!uniqueBatters.find(u => u.full === v.full)) {
          uniqueBatters.push(v);
        }
      });

      if (uniqueBatters.length > 0) {

        let b1 = uniqueBatters[0];
        let b2 = uniqueBatters[1] || null;

        let strikerFound = false;

        // ======================================================
        // DIRECT BAT SYMBOL DETECTION
        // ======================================================

        let batRegex =
          /([A-Z][a-zA-Z\s\.\-']{2,30}?)\s*\*BAT\*\s*\d{1,3}\s*\(\s*\d{1,3}\s*\)/i;

        let batMatch = safeText.match(batRegex);

        if (batMatch && batMatch[1]) {

          let strikerName = batMatch[1]
            .trim()
            .split(' ')
            .slice(-2)
            .join(' ')
            .toLowerCase();

          if (b2 && b2.name.toLowerCase().includes(strikerName)) {

            payload.striker = b2.full + " 🏏";
            payload.non_striker = b1.full;

          } else {

            payload.striker = b1.full + " 🏏";
            payload.non_striker = b2 ? b2.full : "Off-Strike";
          }

          strikerFound = true;
        }

        // ======================================================
        // STRIKE ROTATION FROM LAST BALL
        // ======================================================

        if (!strikerFound) {

          let lastBall =
            payload.last_over[payload.last_over.length - 1];

          if (
            lastBall === "1" ||
            lastBall === "3"
          ) {

            if (b2) {

              payload.striker = b2.full + " 🏏";
              payload.non_striker = b1.full;

            } else {

              payload.striker = b1.full + " 🏏";
              payload.non_striker = "Off-Strike";
            }

          } else {

            payload.striker = b1.full + " 🏏";
            payload.non_striker = b2 ? b2.full : "Off-Strike";
          }
        }

      } else {

        payload.striker = "Awaiting Batters";
        payload.non_striker = "Standby";
      }

    } catch (e) {

      payload.striker = "Extractor Error";
      payload.non_striker = "Extractor Error";
    }

    // ==========================================================
    // BOWLER
    // ==========================================================

    try {

      let bowlerRegex =
        /([A-Z][a-zA-Z\s\.\-']{2,30}?)\s+(\d+\-\d+|\d+\.\d+\s+\d+)/;

      let bowlerMatch = bodyText.match(bowlerRegex);

      if (bowlerMatch && bowlerMatch[1]) {

        payload.bowler = bowlerMatch[1]
          .replace(/[A-Z]{3,}/g, '')
          .trim();

      } else {

        payload.bowler = "Active Bowler";
      }

    } catch (e) {

      payload.bowler = "Bowler Error";
    }

    // ==========================================================
    // PREDICTION
    // ==========================================================

    if (payload.match_state === "live") {

      let scoreClean =
        payload.live_score.match(/(\d+)\/(\d+)\s*\(([\d\.]+)\)/);

      if (scoreClean) {

        let runs = parseInt(scoreClean[1]);
        let wkts = parseInt(scoreClean[2]);
        let overs = parseFloat(scoreClean[3]);

        let projected = Math.floor(
          runs + ((20 - overs) * 9)
        );

        payload.prediction =
          `TARGETS: [20v: ${projected}] \nTACTIC: 🟢 PLAY (BACK) - HIGH AGGRESSION`;

        payload.match_prediction =
          `[TRUE ODDS] LIVE MARKET ACTIVE|[DIRECTIVE] 🟡 HOLD AND WATCH MOMENTUM`;
      }

    } else {

      payload.prediction = "ORACLE OFFLINE";

      payload.match_prediction =
        "[TRUE ODDS] WAITING FOR LIVE DATA";
    }

    return res.status(200).json({
      success: true,
      match_info: payload
    });

  } catch (err) {

    payload.status = "FIREWALL BLOCKED CONNECTION";
    payload.live_score = "ERROR";
    payload.prediction = "SCRAPER OFFLINE";
    payload.match_prediction = "SYSTEM DOWN";
    payload.fetch_code = "OH";

    return res.status(200).json({
      success: false,
      error: err.message,
      match_info: payload
    });
  }
};
