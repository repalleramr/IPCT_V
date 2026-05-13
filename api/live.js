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
    const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };
    const { data: seriesHtml } = await axios.get(SERIES_URL, { headers });
    const $series = cheerio.load(seriesHtml);
    
    let activeMatchUrl = null;
    let matchState = "upcoming";
    let timingStr = "Upcoming Match";

    const team1 = targetTeams.split(' vs ')[0] ? targetTeams.split(' vs ')[0].trim().split(' ')[0] : "";
    const team2 = targetTeams.split(' vs ')[1] ? targetTeams.split(' vs ')[1].trim().split(' ')[0] : "";
    const t1A = teamAliases[team1] || [team1];
    const t2A = teamAliases[team2] || [team2];

    const hasAlias = (txt, aliases) => aliases.some(a => a && txt.includes(a));

    $series('.cb-series-matches').each((i, el) => {
        const text = $series(el).text().toLowerCase();
        if (targetTeams && hasAlias(text, t1A) && hasAlias(text, t2A)) {
            const href = $series(el).find('a[href*="cricket-score"]').first().attr('href');
            if (href) activeMatchUrl = href.startsWith('http') ? href : 'https://www.cricbuzz.com' + href;
            
            if ($series(el).find('.cb-text-live').length > 0) matchState = "live";
            else if ($series(el).find('.cb-text-complete').length > 0 || text.includes('won by')) matchState = "complete";
            
            timingStr = $series(el).find('.cb-text-preview, .cb-text-complete, .text-gray').first().text().trim() || "Live Now";
            return false;
        }
    });

    if (!activeMatchUrl || matchState === "upcoming") {
        return res.status(200).json({
            success: true,
            match_info: { 
                title: "IPCT STANDBY", 
                live_score: "Pre-Match Intel", 
                status: timingStr, 
                bowler: "N/A", 
                last_balls: [], 
                prediction: "Waiting for Toss" 
            },
            target: SERIES_URL
        });
    }

    const commUrl = activeMatchUrl.replace('/cricket-scores/', '/live-cricket-scores/');
    const { data: matchHtml } = await axios.get(commUrl, { headers });
    const $ = cheerio.load(matchHtml);

    let ballHistory = [];
    $('.cb-col-10.cb-font-12').each((i, el) => {
        if (i < 12) ballHistory.push($(el).text().trim());
    });

    let last6 = ballHistory.slice(0, 6);
    let runs = 0; let wkts = 0;
    last6.forEach(b => { if(b === 'W') wkts++; else if(!isNaN(b)) runs += parseInt(b); });
    let pred = runs > 12 ? "AGGRESSIVE: Momentum with Bat." : (wkts > 0 ? "CAUTION: Wicket Pattern Detected." : "STABLE: Standard Play.");

    res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      match_info: {
        title: "IPCT TARGET LOCKED",
        live_score: $('title').text().split('|')[0].trim(),
        status: $('.cb-text-live, .cb-min-stts').first().text().trim() || timingStr,
        bowler: $('.cb-min-bwl-rw').first().find('a').first().text().trim() || "N/A",
        last_balls: ballHistory,
        prediction: pred
      },
      target: activeMatchUrl
    });

  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
};
