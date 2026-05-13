const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const SERIES_URL = 'https://www.cricbuzz.com/cricket-series/9241/indian-premier-league-2026/matches';

  let targetTeams = "";
  if (req.query && req.query.teams) {
    targetTeams = String(req.query.teams).toLowerCase();
  } else if (req.url && req.url.includes('teams=')) {
    targetTeams = decodeURIComponent(req.url.split('teams=')[1].split('&')[0]).toLowerCase();
  }
  targetTeams = targetTeams.replace(/\+/g, ' ').trim();

  const teamAliases = {
    "chennai": ["csk", "chennai"], "delhi": ["dc", "delhi"], "gujarat": ["gt", "gujarat"],
    "kolkata": ["kkr", "kolkata"], "lucknow": ["lsg", "lucknow"], "mumbai": ["mi", "mumbai"],
    "punjab": ["pbks", "punjab"], "rajasthan": ["rr", "rajasthan"],
    "royal": ["rcb", "royal", "bengaluru", "bangalore"], "sunrisers": ["srh", "sunrisers"]
  };

  try {
    const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };
    const { data: seriesHtml } = await axios.get(SERIES_URL, { headers });
    const $series = cheerio.load(seriesHtml);

    let activeMatchUrl = null;

    const team1 = targetTeams.split(' vs ')[0] ? targetTeams.split(' vs ')[0].trim().split(' ')[0] : "";
    const team2 = targetTeams.split(' vs ')[1] ? targetTeams.split(' vs ')[1].trim().split(' ')[0] : "";
    const t1A = teamAliases[team1] || [team1];
    const t2A = teamAliases[team2] || [team2];

    const hasAlias = (txt, aliases) => aliases.some(a => a && txt.includes(a));

    // PHASE 1: Find the Match URL on the Series Page
    $series('.cb-series-matches').each((i, el) => {
      const text = $series(el).text().toLowerCase();
      if (targetTeams && hasAlias(text, t1A) && hasAlias(text, t2A)) {
        const href = $series(el).find('a[href*="cricket-score"]').first().attr('href');
        if (href) {
            activeMatchUrl = href.startsWith('http') ? href : 'https://www.cricbuzz.com' + href;
            return false;
        }
      }
    });

    if (!activeMatchUrl) {
      return res.status(200).json({
        success: true,
        match_info: {
          title: "IPCT STANDBY",
          live_score: "Pre-Match Intel",
          status: "Target Not Found in Schedule",
          bowler: "N/A",
          last_balls: [],
          prediction: "Awaiting Schedule Sync"
        },
        target: SERIES_URL
      });
    }

    // PHASE 2: FORCE SCRAPE THE ACTUAL MATCH PAGE (Never return early!)
    let commUrl = activeMatchUrl;
    if (commUrl.includes('/cricket-scores/')) {
      commUrl = commUrl.replace('/cricket-scores/', '/live-cricket-scores/');
    } else if (commUrl.includes('/cricket-scorecard/')) {
      commUrl = commUrl.replace('/cricket-scorecard/', '/live-cricket-scores/');
    }

    const { data: matchHtml } = await axios.get(commUrl, { headers });
    const $ = cheerio.load(matchHtml);

    // 1. Exact Status / Countdown / Result from the page
    let statusText = $('.cb-text-complete, .cb-text-live, .cb-text-preview, .cb-min-stts').first().text().trim();
    if (!statusText) {
         statusText = $('.text-gray').first().text().trim() || "Status Unknown";
    }

    // 2. Exact Score
    let pageTitle = $('title').text();
    let scoreStr = pageTitle.split('-')[0].split('|')[0].trim();
    
    // Mask the title if the match hasn't started (contains "vs" instead of numbers)
    if (scoreStr.toLowerCase().includes(' vs ')) {
        scoreStr = "Pre-Match Intel"; 
    }

    // 3. Ball History
    let ballHistory = [];
    $('.cb-col-10.cb-font-12, .cb-col.cb-col-8.cb-mtch-blt').each((i, el) => {
      if (i < 12) ballHistory.push($(el).text().trim());
    });

    // 4. Bowler / Active Info
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

    // PHASE 3: STATE POLISH (Final Output Generation)
    let isComplete = $('.cb-text-complete').length > 0 || statusText.toLowerCase().includes('won by');
    let isUpcoming = scoreStr === "Pre-Match Intel";
    let predStr = "Waiting for Toss";

    if (isUpcoming) {
        bowlerStr = "Toss Pending";
    } else if (isComplete) {
        bowlerStr = "Match Concluded";
        predStr = "Match Ended";
        if (ballHistory.length === 0) ballHistory = ["E", "N", "D"];
    } else if (ballHistory.length > 0) {
        let runs = 0, wkts = 0;
        ballHistory.slice(0, 6).forEach(b => {
          if (b === 'W') wkts++;
          else if (!isNaN(b)) runs += parseInt(b);
        });
        predStr = runs > 12 ? "AGGRESSIVE: Momentum with Bat."
          : (wkts > 0 ? "CAUTION: Wicket Pattern Detected."
          : "STABLE: Standard Play.");
    }

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      match_info: {
        title: isComplete ? "MISSION ACCOMPLISHED" : "IPCT TARGET LOCKED",
        live_score: scoreStr,
        status: statusText, // This will now grab the EXACT countdown or exact "Team won by" result!
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
