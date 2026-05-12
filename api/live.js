const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async function (req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const MATCH_URL = 'https://www.cricbuzz.com/live-cricket-scores/152119/gt-vs-srh-56th-match-indian-premier-league-2026';

  try {
    const { data: html } = await axios.get(MATCH_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const $ = cheerio.load(html);

    // 1. Stable Score from Browser Title
    const pageTitle = $('title').text();
    let scoreFromTitle = pageTitle.includes('-') ? pageTitle.split('-')[0].trim() : "Fetching Score...";

    // 2. Extract Active Bowler Name and Figures
    // We target the mini-scorecard bowler row which is very reliable for live games
    let bowlerInfo = $('.cb-min-bwl-rw').first().text().trim();
    
    if (!bowlerInfo) {
        // Fallback search for bowler name in the stats table
        bowlerInfo = $('.cb-col-50').filter((i, el) => $(el).text().includes('ovrs')).first().prev().text().trim();
    }

    const liveStatus = $('.cb-text-live, .cb-text-complete').first().text().trim() || "In Progress";

    res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      match_info: {
        title: "GT vs SRH",
        live_score: scoreFromTitle,
        status: liveStatus,
        bowler: bowlerInfo || "Awaiting Bowler Data..."
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
