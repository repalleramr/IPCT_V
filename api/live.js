// ==============================================================================
// MI6 QUANTUM ORACLE - FULL FIXED BUILD
// Version: 10.2.0 FINAL MOBILE REPLACE BUILD
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
  // TEAM ALIASES
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

  let t1 = targetTeams.split(' vs ')[0]?.trim().split(' ')[0] || "unknown";
  let t2 = targetTeams.split(' vs ')[1]?.trim().split(' ')[0] || "unknown";

  const t1A = teamAliases[t1] || [t1];
  const t2A = teamAliases[t2] || [t2];

  function matchesTeams(txt) {
    if (!txt) return false;
    return t1A.some(a => txt.includes(a)) &&
           t2A.some(a => txt.includes(a));
  }

  try {

    let timestampBuster = Date.now();

    let rawHtmlData = "";
    let cleanText = "";
    let pageTitle = "";

    let htmlAcquired = false;

    // ==============================================================================
    // FIND CREX URL
    // ==============================================================================
    let crexUrl = "";

    try {

      if (targetUrl.includes('crex')) {
        crexUrl = targetUrl;
      }

      if (!crexUrl) {

        const fixtureRes = await axios.get(
          `https://crex.live/fixtures/match-list?_t=${timestampBuster}`,
          { headers, timeout: 8000 }
        );

        const $$ = cheerio.load(fixtureRes.data);

        $$('a').each((i, el) => {

          let href = $$(el).attr('href') || "";
          let txt = ($$(el).text() + " " + href).toLowerCase();

          if (
            matchesTeams(txt) &&
            (
              href.includes('scoreboard') ||
              href.includes('match') ||
              href.includes('score')
            )
          ) {

            if (href.startsWith('http')) {
              crexUrl = href;
            } else {
              crexUrl = "https://crex.live" + href;
            }
          }
        });
      }

    } catch (e) {}

    // ==============================================================================
    // FETCH PAGE
    // ==============================================================================
    if (crexUrl) {

      try {

        const response = await axios.get(
          crexUrl + "?_t=" + timestampBuster,
          {
            headers,
            timeout: 10000
          }
        );

        const html = response.data;

        const $ = cheerio.load(html);

        pageTitle = $('title').text() || "";

        rawHtmlData = html;

        // ==========================================================================
        // NEXTJS HYDRATION EXTRACTION
        // ==========================================================================
        let embeddedJson = "";

        let nextDataMatch = rawHtmlData.match(
          /<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s
        );

        if (nextDataMatch && nextDataMatch[1]) {
          embeddedJson += " " + nextDataMatch[1];
        }

        let apolloMatch = rawHtmlData.match(
          /window\.__APOLLO_STATE__\s*=\s*(\{.*?\});/s
        );

        if (apolloMatch && apolloMatch[1]) {
          embeddedJson += " " + apolloMatch[1];
        }

        embeddedJson += " " + $('body').text();

        rawHtmlData = embeddedJson
          .replace(/\\u002F/g, '/')
          .replace(/\\u0026/g, '&')
          .replace(/\\"/g, '"')
          .replace(/\\n/g, ' ')
          .replace(/\\t/g, ' ');

        htmlAcquired = true;

        payload.fetch_code = "UREKHA";
        payload.source_url = "CREX (Tier 1 Speed)";

      } catch (e) {}
    }

    // ==============================================================================
    // FAIL
    // ==============================================================================
    if (!htmlAcquired) {

      payload.status = "MATCH LINK NOT FOUND";

      return res.status(200).json({
        success: false,
        match_info: payload
      });
    }

    // ==============================================================================
    // CLEAN TEXT
    // ==============================================================================
    cleanText = rawHtmlData
      .replace(/<[^>]+>/g, ' ')
      .replace(/[{}[\]",]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // ==============================================================================
    // TITLE
    // ==============================================================================
    let titleMatch =
      cleanText.match(/([A-Za-z\s]+vs[A-Za-z\s]+)/i);

    if (titleMatch) {
      payload.title = titleMatch[1]
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
    } else {
      payload.title = targetTeams.toUpperCase();
    }

    // ==============================================================================
    // SCORE
    // ==============================================================================
    let scoreRegex =
      /([A-Z]{2,4})\s*(\d+)\/(\d+)\s*\(?(\d+\.\d+)\)?|([A-Z]{2,4})\s*(\d+)-(\d+)\s*\(?(\d+\.\d+)\)?/i;

    let scoreMatch = cleanText.match(scoreRegex);

    if (scoreMatch) {

      let tm =
        scoreMatch[1] || scoreMatch[5];

      let rs =
        scoreMatch[2] || scoreMatch[6];

      let wk =
        scoreMatch[3] || scoreMatch[7];

      let ov =
        scoreMatch[4] || scoreMatch[8];

      payload.live_score =
        `${tm} ${rs}/${wk} (${ov})`;

      payload.match_state = "live";
    }

    // ==============================================================================
    // STATUS
    // ==============================================================================
    let statusPatterns = [

      /([A-Za-z\s]+won by\s+\d+\s+(runs|wickets))/i,

      /(need\s+\d+\s+runs?.*?\d+\s+balls?)/i,

      /(innings break)/i,

      /(strategic timeout)/i,

      /(live)/i
    ];

    for (let p of statusPatterns) {

      let sm = cleanText.match(p);

      if (sm && sm[1]) {
        payload.status = sm[1];
        break;
      }
    }

    if (
      payload.status === "Scanning Fields..." &&
      payload.match_state === "live"
    ) {
      payload.status = "Live Match Active";
    }

    // ==============================================================================
    // TOSS
    // ==============================================================================
    let tossPatterns = [

      /([A-Za-z\s]+won the toss and elected to [A-Za-z]+)/i,

      /([A-Za-z\s]+won the toss and chose to [A-Za-z]+)/i,

      /([A-Za-z\s]+opted to [A-Za-z]+)/i,

      /toss\s*:\s*([A-Za-z\s]+)/i
    ];

    for (let tp of tossPatterns) {

      let tm = cleanText.match(tp);

      if (tm && tm[1]) {

        payload.toss = tm[1]
          .replace(/\s+/g, ' ')
          .trim();

        break;
      }
    }

    // ==============================================================================
    // VENUE
    // ==============================================================================
    let venueMatch =
      cleanText.match(/Venue\s*:?\s*([A-Za-z\s,]+)/i);

    if (venueMatch) {

      payload.venue =
        venueMatch[1].trim();

    } else {

      let homeCode = t1A[0];

      if (homeVenues[homeCode]) {
        payload.venue = homeVenues[homeCode];
      }
    }

    // ==============================================================================
    // CRR / RRR
    // ==============================================================================
    let crrMatch =
      cleanText.match(/CRR\s*:?\s*(\d+\.\d+)/i);

    if (crrMatch) {
      payload.current_rr = crrMatch[1];
    }

    let reqMatch =
      cleanText.match(/(RRR|REQ)\s*:?\s*(\d+\.\d+)/i);

    if (reqMatch) {
      payload.required_rr = reqMatch[2];
    } else {
      payload.required_rr = "1st Innings";
    }

    // ==============================================================================
    // BATTERS
    // ==============================================================================
    let batterRegex =
      /([A-Z][a-z]+(?:\s[A-Z][a-z]+){0,2})\s+(\d+)\s*\((\d+)\)/g;

    let batters = [];
    let bm;

    while ((bm = batterRegex.exec(cleanText)) !== null) {

      let nm = bm[1].trim();

      if (
        nm.length > 2 &&
        !nm.toLowerCase().includes('total') &&
        !nm.toLowerCase().includes('extras') &&
        !nm.toLowerCase().includes('partnership')
      ) {

        batters.push(
          `${nm} ${bm[2]}(${bm[3]})`
        );
      }
    }

    let uniqueBatters = [];

    batters.forEach(b => {

      let exists = uniqueBatters.find(x => {

        let a = x.toLowerCase();
        let c = b.toLowerCase();

        return (
          a.includes(c) ||
          c.includes(a)
        );
      });

      if (!exists) {
        uniqueBatters.push(b);
      }
    });

    batters = uniqueBatters;

    if (batters[0]) {
      payload.batter_1 = batters[0] + " 🏏";
    }

    if (batters[1]) {
      payload.batter_2 = batters[1];
    }

    // ==============================================================================
    // BOWLER
    // ==============================================================================
    let bowlerPatterns = [

      /bowler\s*([A-Z][a-z]+\s?[A-Z]?[a-z]*)/i,

      /([A-Z][a-z]+\s?[A-Z]?[a-z]*)\s+\d+\-\d+\-\d+\-\d+/,

      /([A-Z][a-z]+\s?[A-Z]?[a-z]*)\s+\d+\.\d+\s+\d+\s+\d+/,

      /([A-Z][a-z]+\s?[A-Z]?[a-z]*)\s+\d+\.\d+\s+\d+/
    ];

    for (let p of bowlerPatterns) {

      let bm = cleanText.match(p);

      if (bm && bm[1]) {

        let nm = bm[1]
          .replace(/bowler/i, '')
          .trim();

        if (
          nm.length > 2 &&
          !nm.toLowerCase().includes('josh inglis')
        ) {

          payload.bowler = nm;
          break;
        }
      }
    }

    // ==============================================================================
    // LAST OVER
    // ==============================================================================
    let recentMatch =
      cleanText.match(/Recent\s*:?\s*([0-6WNbwd\s]+)/i);

    if (recentMatch) {

      payload.last_over =
        recentMatch[1]
          .trim()
          .split(/\s+/)
          .slice(-6);
    }

    // ==============================================================================
    // TRUE ODDS
    // ==============================================================================
    let oddsFound = false;

    for (const [code, aliases] of Object.entries(teamAliases)) {

      if (oddsFound) break;

      for (const alias of aliases) {

        let re = new RegExp(
          `\\b${escapeRegExp(alias)}\\b[^\\d]{0,25}(\\d{1,3})[^\\d]{1,5}(\\d{1,3})`,
          'i'
        );

        let mo = cleanText.match(re);

        if (mo) {

          let p1 = parseInt(mo[1]);
          let p2 = parseInt(mo[2]);

          if (
            Math.abs(p1 - p2) <= 4 &&
            p1 > 0 &&
            p2 > 0 &&
            p1 < 100 &&
            p2 < 100
          ) {

            let fav = code.toUpperCase();

            let back = Math.min(p1, p2);
            let lay = Math.max(p1, p2);

            payload.match_prediction =
              `[LIVE MARKET ODDS] ${fav} is Favorite at ${back}-${lay} Paise`;

            oddsFound = true;
            break;
          }
        }
      }
    }

    if (!oddsFound) {
      payload.match_prediction =
        "[TRUE ODDS] WAITING FOR LIVE DATA";
    }

    // ==============================================================================
    // AI ENGINE
    // ==============================================================================
    if (
      payload.live_score !== "NO SCORE" &&
      payload.live_score !== "Match Not Started"
    ) {

      let s =
        payload.live_score.match(/(\d+)\/(\d+)\s*\(([\d\.]+)\)/);

      if (s) {

        let runs = parseInt(s[1]);
        let wkts = parseInt(s[2]);
        let overs = parseFloat(s[3]);

        let projected = 180;

        if (overs > 0) {
          projected =
            Math.floor((runs / overs) * 20);
        }

        let tactic = "🟡 HOLD - BALANCED";

        if (projected >= 210) {
          tactic = "🟢 PLAY (BACK) - HIGH AGGRESSION";
        }

        if (projected <= 160) {
          tactic = "🔴 EAT (LAY) - WEAK TOTAL";
        }

        payload.prediction =
          `TARGETS: [20v: ${projected}] \nTACTIC: ${tactic}`;
      }

    } else {

      payload.prediction = "ORACLE OFFLINE";
    }

    // ==============================================================================
    // MATCH STATE FINAL FIX
    // ==============================================================================
    if (
      payload.live_score === "NO SCORE" ||
      payload.live_score === "Match Not Started"
    ) {

      payload.match_state = "future";
      payload.live_score = "Match Not Started";

      payload.prediction = "ORACLE OFFLINE";

      if (!payload.match_prediction) {

        payload.match_prediction =
          "[TRUE ODDS] WAITING FOR LIVE DATA";
      }

    } else {

      payload.match_state = "live";
    }

    // ==============================================================================
    // FINAL
    // ==============================================================================
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
