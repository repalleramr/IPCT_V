const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async function (req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Direct Match URL
  const MATCH_URL = 'https://www.cricbuzz.com/live-cricket-scores/152119/gt-vs-srh-56th-match-indian-premier-league-2026';

  try {
    const { data: html } = await axios.get(MATCH_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      timeout: 10000
    });

    const $ = cheerio.load(html);

    // Targetting the specific score area for this match page
    const matchTitle = $('.cb-nav-hdr').first().text().trim() || 'GT vs SRH';
    const score = $('.cb-font-20.text-bold').first().text().trim() || $('.cb-min-bat-rw').text().trim();
    const status = $('.cb-text-live, .cb-text-complete, .cb-min-stts').first().text().trim();
    const bats1 = $('.cb-min-inf.cb-col-100').first().text().trim();

    res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      match_info: {
        title: matchTitle,
        live_score: score || "Fetching Score...",
        status: status || "Match in Progress",
        summary: bats1 || "Waiting for commentary update..."
      },
      source: "Direct Uplink"
    });

  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: "Direct link access failed", 
      error: error.message 
    });
  }
};
