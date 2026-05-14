
const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  let targetUrl = req.query.url || "";
  let targetTeams = (req.query.teams || "").toLowerCase().trim();
  let rawDateStr = req.query.time || "";

  // ==============================================================
  // 0. THE URL INTERCEPTOR (Force Mobile Commentary Page)
  // ==============================================================
  if (targetUrl.includes('cricbuzz.com')) {
      // Bypasses desktop armor AND forces the "Live Commentary" page where recent balls exist
      targetUrl = targetUrl.replace('www.', 'm.').replace('/live-cricket-scorecard/', '/cricket-scores/');
  }

  // ==============================================================
  // 1. MASTER LEDGER (Pre-Loaded Absolute Truth Venues)
  // ==============================================================
  const MASTER_LEDGER = {
      "may 14": { id: "may 14", expected: ["punjab", "mumbai", "pbks", "mi"], venue: "Himachal Pradesh Cricket Association Stadium, Dharamsala" },
      "may 15": { id: "may 15", expected: ["lucknow", "chennai", "lsg", "csk"], venue: "Bharat Ratna Shri Atal Bihari Vajpayee Ekana Cricket Stadium, Lucknow" }
  };

  let requestTime = rawDateStr.toLowerCase();
  let ledgerKey = "";
  Object.keys(MASTER_LEDGER).forEach(key => {
      if (requestTime.includes(key)) ledgerKey = key;
  });
  let currentMission = MASTER_LEDGER[ledgerKey] || { id: "", expected: [], venue: "Location Secure" };

  // ==============================================================
  // 2. ALIAS ENGINE
  // ==============================================================
  const teamAliases = {
    "chennai": ["csk", "chennai", "super kings"],
    "delhi": ["dc", "delhi", "capitals"],
    "gujarat": ["gt", "gujarat", "titans"],
    "kolkata": ["kkr", "kolkata", "knight riders"],
    "lucknow": ["lsg", "lucknow", "super giants"],
    "mumbai": ["mi", "mumbai", "indians"],
    "punjab": ["pbks", "punjab", "kings"],
    "rajasthan": ["rr", "rajasthan", "royals"],
    "royal": ["rcb", "bengaluru", "bangalore", "challengers", "royal challengers"],
    "sunrisers": ["srh", "hyderabad", "sunrisers"],
    "tbd": ["tbd"]
  };

  let t1 = targetTeams.split(' vs ')[0]?.trim().split(' ')[0] || "tbd";
  let t2 = targetTeams.split(' vs ')[1]?.trim().split(' ')[0] || "tbd";
  const t1A = [...(teamAliases[t1] || []), t1];
  const t2A = [...(teamAliases[t2] || []), t2];

  let payload = {
        title: "IPL LIVE INTEL", 
        status: "Scanning Fields...", 
        match_state: "standby",
        live_score: "Awaiting Data", 
        overs: null, target: null, required_rr: null, current_rr: null,
        striker: null, non_striker: null, bowler: null,
        toss: "Awaiting Coin Drop", result: null, 
        venue: currentMission.venue, 
        last_ball: null, last_over: [], 
        prediction: "Tracking...", countdown: null,
        source: "searching", source_url: targetUrl
  };

  const headers = { 'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36' };

  function matchesTeams(fullTxt) {
      if (!fullTxt) return false;
      let t1Match = t1 !== "tbd" && t1A.some(a => fullTxt.includes(a));
      let t2Match = t2 !== "tbd" && t2A.some(a => fullTxt.includes(a));
      if (t1Match && t2Match) return true;
      if (currentMission.isPlayoff && currentMission.expected.some(e => fullTxt.includes(e))) return true;
      return false;
  }

  try {
    // ==============================================================
    // SELLER 1: CRICBUZZ DIRECT (Mobile Scraper - Live Commentary)
    // ==============================================================
    if (targetUrl.includes('cricbuzz.com')) {
        const factsUrl = targetUrl.replace('/cricket-scores/', '/cricket-match-facts/');
        const [scRes, factsRes] = await Promise.allSettled([
            axios.get(targetUrl, { headers, timeout: 3500 }),
            axios.get(factsUrl, { headers, timeout: 3500 })
        ]);

        if (scRes.status === 'fulfilled') {
            const $ = cheerio.load(scRes.value.data);
            let rawBodyText = $('body').text().replace(/\s+/g, ' ');
            
            // 1. Clean Live Score
            let score = $('.cb-font-20, .ui-bat-team-scores').first().text().trim();
            if (score && /\d/.test(score)) {
                payload.live_score = score;
                payload.match_state = "live";
            } else {
                // Regex fallback if classes change
                let scoreMatch = rawBodyText.match(/([A-Z]{2,4}\s\d+\/\d+\s\(\d+\.\d+\))/);
                if (scoreMatch) {
                    payload.live_score = scoreMatch[1];
                    payload.match_state = "live";
                }
            }

            // 2. Batsmen & Bowler Extraction
            let batsmen = [];
            $('.cb-min-inf').each((i, el) => {
                let text = $(el).text().trim();
                if (text && !text.includes('CRR')) batsmen.push(text);
            });
            if (batsmen[0]) payload.striker = batsmen[0];
            if (batsmen[1]) payload.non_striker = batsmen[1];

            let cbBowler = $('.cb-min-bowl-rw').find('a').first().text().trim();
            if(cbBowler) payload.bowler = cbBowler;

            // 3. NUCLEAR BALL-BY-BALL HUNTER
            payload.last_over = [];
            // Method A: Standard CSS Classes
            $('.cb-min-rcnt span, .cb-rcnt-ovr span').each((i, el) => {
                let b = $(el).text().trim();
                if (b && b !== '|' && b.toLowerCase() !== 'recent:') payload.last_over.push(b);
            });
            
            // Method B: Regex Text Search Fallback (If classes fail)
            if (payload.last_over.length === 0) {
                let recentTextMatch = rawBodyText.match(/Recent\s*:\s*([W0-9NbLwd|\s]+)/i);
                if (recentTextMatch) {
                    let balls = recentTextMatch[1].split(/[|\s]+/).filter(b => b.trim());
                    payload.last_over = balls;
                }
            }
            
            // Slice to keep only the last 6 balls
            if (payload.last_over.length > 0) {
                payload.last_over = payload.last_over.slice(-6);
            }

            // Status fallback
            let cbStatus = $('.cb-text-complete, .cb-status-msg').first().text().trim();
            if (cbStatus) payload.status = cbStatus;

            if (payload.match_state === "live") payload.source = "cricbuzz-live-mobile";
        }

        // Scrape Toss from Facts via Regex
        if (factsRes.status === 'fulfilled') {
            const $f = cheerio.load(factsRes.value.data);
            let pageText = $f('body').text().replace(/\s+/g, ' ');
            let tossMatch = pageText.match(/([A-Z][a-z]+\s[A-Za-z]+\swon the toss and (?:opted|elected|chose) to (?:bat|bowl) first)/i);
            if (tossMatch) {
                payload.toss = tossMatch[1].trim();
                if (payload.match_state !== "live") payload.status = payload.toss;
            }
        }
    }

    // ==============================================================
    // SELLER 2: ESPN CRICINFO API (Deep JSON Hunt Backup)
    // ==============================================================
    if (payload.source === "searching" || payload.toss === "Awaiting Coin Drop" || !payload.live_score.match(/\d/)) {
        try {
            const espn = await axios.get('https://hs-consumer-api.espncricinfo.com/v1/pages/matches/current', { headers, timeout: 3000 });
            let match = espn.data.matches.find(m => {
                if (currentMission.id) {
                    let mDate = new Date(m.startTime || m.startDate || "");
                    let dateStr = mDate.toLocaleString('en-US', { month: 'short' }).toLowerCase() + " " + mDate.getDate();
                    if (dateStr !== currentMission.id) return false;
                }
                const txt = (m.title + " " + m.teams.map(t => t.team.abbreviation).join(" ")).toLowerCase();
                return matchesTeams(txt);
            });

            if (!match && t1 !== 'tbd') {
                 match = espn.data.matches.find(m => {
                     const txt = m.teams.map(t => t.team.abbreviation).join(" ").toLowerCase();
                     return t1A.some(a => txt.includes(a)) || t2A.some(a => txt.includes(a));
                 });
            }

            if (match) {
                if (match.status === "Live" || match.status === "In Progress") {
                    payload.match_state = "live";
                    let s0 = match.teams[0]?.score || "";
                    let o0 = match.teams[0]?.overs ? `(${match.teams[0].overs})` : "";
                    let s1 = match.teams[1]?.score ? ` v ${match.teams[1].score}` : "";
                    payload.live_score = `${s0} ${o0}${s1}`.trim();
                    payload.status = match.statusText;
                    if (payload.source === "searching") payload.source = "espn-api";
                }
                if (match.tossResults && match.tossResults.text) {
                    payload.toss = match.tossResults.text;
                    if (payload.match_state === "standby") payload.status = payload.toss;
                }
            }
        } catch(e) {}
    }

    // ==============================================================
    // FINAL MATCH STATE ENGINE
    // ==============================================================
    let lowerStatus = (payload.status || "").toLowerCase();
    let isCompleted = lowerStatus.includes('won by') || lowerStatus.includes('tied');

    if (lowerStatus.includes('abandoned')) {
        payload.match_state = "abandoned"; payload.title = "MISSION ABORTED";
    } else if (lowerStatus.includes('delay') || lowerStatus.includes('rain') || lowerStatus.includes('stumps')) {
        payload.match_state = "delay"; payload.title = "WEATHER PROTOCOL";
    } else if (isCompleted) {
        payload.match_state = "completed"; 
        payload.title = "MISSION ACCOMPLISHED";
        payload.result = payload.status; 
        payload.live_score = "Match Ended"; 
        payload.last_over = ["E", "N", "D"];
        payload.striker = null; payload.bowler = "Mission Concluded";
    } else if (payload.live_score && payload.live_score.match(/\d+/)) {
        payload.match_state = "live";
        payload.prediction = "Active Tracking...";
        if (payload.status === "Scanning Fields..." || payload.status === "Uplink Established") {
            payload.status = "LIVE TELEMETRY ACTIVE";
        }
    }

    // Fill missing UI elements to prevent frontend bugs
    if (payload.last_over.length === 0) payload.last_over = ["-", "-", "-", "-", "-", "-"];
    if (!payload.striker) payload.striker = "Awaiting...";
    if (!payload.bowler) payload.bowler = "Awaiting...";

    return res.status(200).json({ success: true, match_info: payload });

  } catch (err) {
    return res.status(200).json({ success: false, error: "Total Uplink Failure: " + err.message });
  }
};
