const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async function (req, res) {
  // CORS Setup
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // The master schedule link you provided
  const SERIES_URL = 'https://www.cricbuzz.com/cricket-series/9241/indian-premier-league-2026/matches';

  // Read teams from PWA
  let targetTeams = "";
  if (req.query && req.query.teams) {
    targetTeams = String(req.query.teams).toLowerCase();
  } else if (req.url && req.url.includes('teams=')) {
    targetTeams = decodeURIComponent(req.url.split('teams=')[1].split('&')[0]).toLowerCase();
  }
  targetTeams = targetTeams.replace(/\+/g, ' ').trim();

  // IPCT Dictionary
  const teamAliases = {
    "chennai": ["csk", "chennai"],
    "delhi": ["dc", "delhi"],
    "gujarat": ["gt", "gujarat"],
    "kolkata": ["kkr", "kolkata"],
    "lucknow": ["lsg", "lucknow"],
    "mumbai": ["mi", "mumbai"],
    "punjab": ["pbks", "punjab", "kings"],
    "rajasthan": ["rr", "rajasthan"],
    "royal": ["rcb", "royal", "bengaluru", "bangalore"],
    "sunrisers": ["srh", "sunrisers", "hyderabad"]
  };

  try {
    const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' };
    const { data: seriesHtml } = await axios.get(SERIES_URL, { headers });
    const $series = cheerio.load(seriesHtml);

    let activeMatchUrl = null;

    const team1 = targetTeams.split(' vs ')[0] ? targetTeams.split(' vs ')[0].trim().split(' ')[0] : "";
    const team2 = targetTeams.split(' vs ')[1] ? targetTeams.split(' vs ')[1].trim().split(' ')[0] : "";
    const t1A = teamAliases[team1] || [team1];
    const t2A = teamAliases[team2] || [team2];

    // --- PHASE 1: HYBRID URL MATCHER ---
    // Scans both the URL string AND the surrounding text box to guarantee a lock
    $series('a[href*="cricket-score"]').each((i, el) => {
      const href = $series(el).attr('href').toLowerCase();
      // Look two levels up to capture the entire row of text
      const surroundingText = $series(el).parent().parent().parent().text().toLowerCase();
      const combinedIntel = href + " " + surroundingText;
      
      const matchT1 = t1A.some(a => a && combinedIntel.includes(a));
      const matchT2 = t2A.some(a => a && combinedIntel.includes(a));
      
      if (matchT1 && matchT2) {
        activeMatchUrl = $series(el).attr('href');
        activeMatchUrl = activeMatchUrl.startsWith('http') ? activeMatchUrl : 'https://www.cricbuzz.com' + activeMatchUrl;
        return false; // Target Acquired
      }
    });

    // Failsafe if target genuinely does not exist on schedule
    if (!activeMatchUrl) {
      return res.status(200).json({
        success: true,
        match_info: {
          title: "IPCT STANDBY",
          live_score: "Intel Offline",
          status: "Match Not Found on Schedule",
          bowler: "N/A",
          last_balls: [],
          prediction: "Verify Dropdown Target"
        },
        target: SERIES_URL
      });
    }

    // --- PHASE 2: DIRECT MATCH PAGE SCRAPE ---
    // Forces the URL into live commentary mode to extract countdowns or final results
    let commUrl = activeMatchUrl;
    if (commUrl.includes('/cricket-scores/')) {
      commUrl = commUrl.replace('/cricket-scores/', '/live-cricket-scores/');
    } else if (commUrl.includes('/cricket-scorecard/')) {
      commUrl = commUrl.replace('/cricket-scorecard/', '/live-cricket-scores/');
    }

    const { data: matchHtml } = await axios.get(commUrl, { headers });
    const $ = cheerio.load(matchHtml);

    // 1. Fetch Exact Status (Countdown timer, Live status, or Final Result)
    let statusText = $('.cb-text-complete, .cb-text-live, .cb-min-stts, .cb-text-preview, .cb-nav-subhdr').first().text().trim();
    if (!statusText) statusText = $('.text-gray').first().text().trim() || "Status Unknown";

    // 2. Fetch Score from Title
    let pageTitle = $('title').text();
    let scoreStr = pageTitle.split('-')[0].trim();
    if (scoreStr.toLowerCase().includes(' vs ') || scoreStr.toLowerCase().includes('opt to')) {
        scoreStr = "Pre-Match Intel";
    }

    // 3. Fetch Ball History
    let ballHistory = [];
    $('.cb-col-10.cb-font-12, .cb-col.cb-col-8.cb-mtch-blt').each((i, el) => {
      if (i < 12) ballHistory.push($(el).text().trim());
    });

    // 4. Fetch Bowler
    let bowlerStr = "N/A";
    const bRow = $('.cb-min-bwl-rw').first();
    if (bRow.length > 0) {
        const name = bRow.find('a').first().text().trim();
        const stats = bRow.text().replace(name, '').replace(/\s+/g, ' ').trim();
        if (name) bowlerStr = `${name} (${stats})`;
    } else {
        const bStats = $('.cb-col-50').filter((i, e) => $(e).text().toLowerCase().includes('ov')).first();
        if (bStats.length > 0) {
            const bName = bStats.prev().text().trim();
            if (bName) bowlerStr = bName + " (Active)";
        }
    }

    // --- PHASE 3: ORACLE LOGIC & OUTPUT ---
    let isComplete = $('.cb-text-complete').length > 0 || statusText.toLowerCase().includes('won by') || statusText.toLowerCase().includes('result');
    let isUpcoming = scoreStr === "Pre-Match Intel";
    let predStr = "Waiting for Toss";

    if (isUpcoming) {
        bowlerStr = "Toss Pending / Countdown Active";
    } else if (isComplete) {
        bowlerStr = "Match Concluded";
        predStr = "Mission Accomplished";
        scoreStr = "Match Ended";
        if (ballHistory.length === 0) ballHistory = ["E", "N", "D"];
    } else if (ballHistory.length > 0) {
        let runs = 0, wkts = 0;
        ballHistory.slice(0, 6).forEach(b => {
          if (b === 'W') wkts++;
          else if (!isNaN(b)) runs += parseInt(b);
        });
        predStr = runs > 12 ? "AGGRESSIVE: Momentum with Bat." : (wkts > 0 ? "CAUTION: Wicket Pattern Detected." : "STABLE: Standard Play.");
    }

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      match_info: {
        title: isComplete ? "MISSION ACCOMPLISHED" : "IPCT TARGET LOCKED",
        live_score: scoreStr,
        status: statusText, // Will explicitly grab the Countdown Timer here!
        bowler: bowlerStr,
        last_balls: ballHistory,
        prediction: predStr
      },
      target: commUrl
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
