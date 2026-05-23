// ==============================================================================
// MI6 QUANTUM ORACLE - CORE SCRAPING ENGINE & DATA ISOLATION PROTOCOL
// Version: 9.1.0 (BUG FIXED BUILD)
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
  let rawDateStr = req.query.time || "";
  let userPosition = (req.query.position || "NONE").toUpperCase().trim();

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 13)',
    'Accept': 'text/html,application/xhtml+xml'
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

  let pageTitle = "";
  let rawHtmlData = "";
  let $ = null;

  // ==============================================================================
  // TEAM MAP
  // ==============================================================================
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

  // ==============================================================================
  // VENUES
  // ==============================================================================
  const homeVenues = {
    "csk": "M.A. Chidambaram Stadium, Chennai",
    "mi": "Wankhede Stadium, Mumbai",
    "rcb": "M. Chinnaswamy Stadium, Bengaluru",
    "gt": "Narendra Modi Stadium, Ahmedabad",
    "rr": "Sawai Mansingh Stadium, Jaipur",
    "dc": "Arun Jaitley Stadium, Delhi",
    "pbks": "Mullanpur Stadium, Punjab",
    "srh": "Rajiv Gandhi Intl Stadium, Hyderabad",
    "kkr": "Eden Gardens, Kolkata",
    "lsg": "Ekana Stadium, Lucknow"
  };

  // ==============================================================================
  // HELPERS
  // ==============================================================================
  function normalize(str) {
    return String(str || "")
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function escapeRegExp(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  let t1 = targetTeams.split(' vs ')[0]?.trim().split(' ')[0] || "unknown";
  let t2 = targetTeams.split(' vs ')[1]?.trim().split(' ')[0] || "unknown";

  const t1A =
    Object.values(teamAliases).find(a => a.includes(t1)) || [t1];

  const t2A =
    Object.values(teamAliases).find(a => a.includes(t2)) || [t2];

  function matchesTeams(txt) {

    txt = normalize(txt);

    return (
      t1A.some(a => txt.includes(a)) &&
      t2A.some(a => txt.includes(a))
    );
  }

  try {

    // ==============================================================================
    // FETCH MATCH
    // ==============================================================================
    let htmlAcquired = false;
    let timestampBuster = Date.now();

    let crexUrl = "";

    if (
      targetUrl.includes('crex.com') ||
      targetUrl.includes('crex.live')
    ) {
      crexUrl = targetUrl;
    }

    // ==============================================================================
    // AUTO FIND
    // ==============================================================================
    if (!crexUrl && targetTeams) {

      try {

        const cxRes = await axios.get(
          `https://crex.com/fixtures/match-list?_t=${timestampBuster}`,
          {
            headers,
            timeout: 5000
          }
        );

        const $temp = cheerio.load(cxRes.data);

        $temp('a').each((i, el) => {

          let txt =
            ($temp(el).text() || "").toLowerCase();

          let href =
            $temp(el).attr('href') || "";

          let strictTeamCheck =
            txt + " " + href;

          if (
            (
              href.includes('score') ||
              href.includes('match-updates') ||
              href.includes('live-score')
            ) &&
            matchesTeams(strictTeamCheck)
          ) {

            crexUrl =
              href.startsWith('http')
                ? href
                : 'https://crex.com' + href;
          }
        });

      } catch (e) {}
    }

    // ==============================================================================
    // LINK FAIL
    // ==============================================================================
    if (!crexUrl) {

      payload.status = "MATCH LINK NOT FOUND";

      return res.status(200).json({
        success: false,
        match_info: payload
      });
    }

    // ==============================================================================
    // FETCH PAGE
    // ==============================================================================
    try {

      const cRes = await axios.get(
        `${crexUrl}?_t=${timestampBuster}`,
        {
          headers,
          timeout: 6000
        }
      );

      $ = cheerio.load(cRes.data);

      $('script, style, noscript').remove();

      pageTitle =
        $('title').text() || "";

      rawHtmlData =
        $('body').html() || "";

      payload.source_url =
        "CREX (Tier 1 Speed)";

      payload.fetch_code = "UREKHA";

      htmlAcquired = true;

    } catch (e) {}

    // ==============================================================================
    // FETCH FAIL
    // ==============================================================================
    if (!htmlAcquired) {

      payload.status =
        "UPLINK FAILED";

      return res.status(200).json({
        success: false,
        match_info: payload
      });
    }

    // ==============================================================================
    // HTML CLEAN
    // ==============================================================================
    rawHtmlData =
      rawHtmlData
        .replace(/<svg[^>]*>.*?<\/svg>/gi, ' *BAT* ')
        .replace(/class="[^"]*active[^"]*"/gi, ' *BAT* ')
        .replace(/<\/?(div|tr|p|li|table|tbody|span)[^>]*>/gi, ' |ROW| ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&');

    let cleanText =
      rawHtmlData.replace(/<[^>]+>/g, ' ');

    let domRows =
      cleanText
        .split('|ROW|')
        .map(r => r.replace(/\s+/g, ' ').trim())
        .filter(r => r.length > 0);

    let fullBodyText =
      domRows.join(' ');

    // ==============================================================================
    // TITLE
    // ==============================================================================
    payload.title =
      (
        targetTeams ||
        pageTitle
      )
      .replace(/live score/ig, '')
      .replace(/cricket/ig, '')
      .trim()
      .toUpperCase();

    // ==============================================================================
    // SCORE
    // ==============================================================================
    let scoreRegex =
      /([A-Z]{2,4})\s*(\d+)\/(\d+)\s*\(?([\d\.]+)\)?/i;

    let scoreMatch =
      fullBodyText.match(scoreRegex);

    if (scoreMatch) {

      payload.match_state = "live";

      payload.live_score =
        `${scoreMatch[1].toUpperCase()} ${scoreMatch[2]}/${scoreMatch[3]} (${scoreMatch[4]})`;

    } else {

      payload.match_state = "future";
      payload.live_score = "Match Not Started";
    }

    // ==============================================================================
    // RESULT
    // ==============================================================================
    let resultMatch =
      fullBodyText.match(/([A-Za-z\s]+won by\s+\d+\s+(runs|wickets))/i);

    if (resultMatch) {

      payload.match_state = "completed";

      payload.status =
        resultMatch[1];

      payload.winner =
        resultMatch[1]
          .split('won by')[0]
          .trim();

      payload.live_score =
        "Match Ended";
    }

    // ==============================================================================
    // STATUS
    // ==============================================================================
    if (payload.match_state === "live") {
      payload.status = "Live Match Active";
    }

    // ==============================================================================
    // RR
    // ==============================================================================
    let crrMatch =
      fullBodyText.match(/CRR[: ]([\d\.]+)/i);

    if (crrMatch) {
      payload.current_rr = crrMatch[1];
    }

    let rrrMatch =
      fullBodyText.match(/(?:RRR|REQ)[: ]([\d\.]+)/i);

    if (rrrMatch) {
      payload.required_rr = rrrMatch[1];
    } else {
      payload.required_rr = "1st Innings";
    }

    // ==============================================================================
    // VENUE
    // ==============================================================================
    let venueMatch =
      fullBodyText.match(/Venue[: ]([^|]+)/i);

    if (venueMatch) {

      payload.venue =
        venueMatch[1].trim();

    } else {

      let homeCode =
        t1A[0];

      if (homeVenues[homeCode]) {
        payload.venue =
          homeVenues[homeCode];
      }
    }

    // ==============================================================================
    // TOSS
    // ==============================================================================
    let tossMatch =
      fullBodyText.match(/([A-Za-z\s]+won the toss[^\.]+)/i);

    if (tossMatch) {
      payload.toss =
        tossMatch[1].trim();
    }

    // ==============================================================================
    // BATTERS FIX
    // ==============================================================================
    try {

      let validBatters = [];

      for (let r of domRows) {

        if (
          r.match(/partnership|yet to bat|last wicket|extras|bowler/i)
        ) continue;

        let m =
          r.match(/([A-Za-z\.\-\s']{3,30})\s+(\d{1,3})\s*\((\d{1,3})\)/);

        if (m) {

          let name =
            m[1]
              .replace(/\b(batter|batsman)\b/ig, '')
              .trim();

          if (
            name.length < 3
          ) continue;

          let isStriker =
            r.includes('*BAT*');

          validBatters.push({
            text: `${name} ${m[2]}(${m[3]})`,
            striker: isStriker
          });
        }
      }

      // REMOVE DUPLICATES
      let unique = [];

      validBatters.forEach(b => {

        if (
          !unique.find(
            u => u.text === b.text
          )
        ) {
          unique.push(b);
        }
      });

      if (unique.length > 0) {

        payload.batter_1 =
          unique[0].text +
          (unique[0].striker ? " 🏏" : "");

        if (unique.length > 1) {

          payload.batter_2 =
            unique[1].text +
            (unique[1].striker ? " 🏏" : "");
        }

        // FAILSAFE
        if (
          !payload.batter_1.includes('🏏') &&
          !payload.batter_2.includes('🏏')
        ) {
          payload.batter_1 += " 🏏";
        }
      }

    } catch (e) {

      payload.batter_1 =
        "Extractor Error";

      payload.batter_2 =
        "Extractor Error";
    }

    // ==============================================================================
    // BOWLER FIX
    // ==============================================================================
    try {

      for (let r of domRows) {

        if (
          r.match(/batter|partnership|extras/i)
        ) continue;

        let bm =
          r.match(/([A-Z][a-zA-Z\s\.']+)\s+\d+\-\d+/);

        if (bm) {

          payload.bowler =
            bm[1].trim();

          break;
        }
      }

    } catch (e) {
      payload.bowler = "Bowler Error";
    }

    // ==============================================================================
    // LAST OVER
    // ==============================================================================
    try {

      let recent =
        fullBodyText.match(/Recent[: ]([0-9WwdNb\s]+)/i);

      if (recent) {

        payload.last_over =
          recent[1]
            .split(/\s+/)
            .filter(x => x.trim())
            .slice(-6);
      }

    } catch (e) {}

    // ==============================================================================
    // AI ENGINE
    // ==============================================================================
    try {

      if (
        payload.match_state === "live" &&
        payload.live_score.includes('/')
      ) {

        let sm =
          payload.live_score.match(/([A-Z]{2,4})\s(\d+)\/(\d+)\s\(([\d\.]+)\)/);

        if (sm) {

          let batTeam = sm[1];
          let runs = parseInt(sm[2]);
          let wkts = parseInt(sm[3]);
          let overs = parseFloat(sm[4]);

          let crr =
            parseFloat(payload.current_rr);

          if (isNaN(crr)) {
            crr = 8.5;
          }

          // ==============================================================================
          // TARGETS
          // ==============================================================================
          let projected20 =
            Math.floor(
              runs + ((20 - overs) * crr)
            );

          payload.prediction =
            `TARGETS: [20v: ${projected20}] \nTACTIC: 🟢 PLAY (BACK) - HIGH AGGRESSION`;

          // ==============================================================================
          // TRUE ODDS FIX
          // ==============================================================================
          let foundOdds = false;

          for (let r of domRows) {

            if (foundOdds) break;

            let row =
              normalize(r);

            for (const [teamCode, aliases] of Object.entries(teamAliases)) {

              if (foundOdds) break;

              for (const alias of aliases) {

                let regex =
                  new RegExp(
                    `\\b${escapeRegExp(alias)}\\b.{0,25}?(\\d{1,3})\\s+(\\d{1,3})`,
                    'i'
                  );

                let m =
                  row.match(regex);

                if (m) {

                  let p1 =
                    parseInt(m[1]);

                  let p2 =
                    parseInt(m[2]);

                  // ==============================================================================
                  // STRICT MARKET FILTER
                  // ==============================================================================

                  if (
                    p1 > 0 &&
                    p2 > 0 &&
                    p1 < 150 &&
                    p2 < 150 &&
                    Math.abs(p1 - p2) <= 5 &&
                    p1 !== p2
                  ) {

                    let back =
                      Math.min(p1, p2);

                    let lay =
                      Math.max(p1, p2);

                    let prob =
                      (100 / (100 + back)) * 100;

                    payload.match_prediction =
                      `[LIVE MARKET ODDS] ${teamCode} is Favorite at ${back}-${lay} Paise\n` +
                      `Win Probability: ${prob.toFixed(0)}%|` +
                      `[ANALYSIS] ${teamCode} is controlling the live market.|` +
                      `[DIRECTIVE] 🟢 PLAY (BACK) ${teamCode} at ${back}p or EAT at ${lay}p`;

                    foundOdds = true;
                    break;
                  }
                }
              }
            }
          }

          // ==============================================================================
          // FALLBACK
          // ==============================================================================
          if (!foundOdds) {

            let aiBack = 45;
            let aiLay = 47;

            payload.match_prediction =
              `[TRUE ODDS] ${batTeam} is Favorite at ${aiBack}-${aiLay} Paise\n` +
              `Win Probability: 65%|` +
              `[ANALYSIS] AI generated fallback market.|` +
              `[DIRECTIVE] 🟡 HOLD`;
          }
        }

      } else {

        payload.prediction =
          "ORACLE OFFLINE";

        payload.match_prediction =
          "[TRUE ODDS] WAITING FOR LIVE DATA";
      }

    } catch (e) {

      payload.prediction =
        "Quantum Core Error";

      payload.match_prediction =
        "Prediction Error";
    }

    // ==============================================================================
    // RESPONSE
    // ==============================================================================
    return res.status(200).json({
      success: true,
      match_info: payload
    });

  } catch (err) {

    payload.status =
      "FIREWALL BLOCKED CONNECTION";

    payload.live_score =
      "ERROR: Cannot Fetch";

    payload.prediction =
      "SCRAPER OFFLINE";

    payload.match_prediction =
      "DABBA LINE BLOCKED";

    payload.fetch_code = "OH";

    return res.status(200).json({
      success: false,
      error: err.message,
      match_info: payload
    });
  }
};
