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

    // The Bulletproof Method: Read the Browser Tab Title
    const pageTitle = $('title').text();
    let scoreFromTitle = "Fetching Score...";
    
    // The title usually looks like: "GT 45/2 (5.3) vs SRH - Live Cricket Score..."
    if (pageTitle.includes('-')) {
      scoreFromTitle = pageTitle.split('-')[0].trim();
    }

    // Try to grab the status text (e.g., "Sunrisers Hyderabad opt to bowl")
    const liveStatus = $('.cb-text-live, .cb-text-complete').first().text().trim() || "In Progress";

    res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      match_info: {
        title: "GT vs SRH",
        live_score: scoreFromTitle,
        status: liveStatus
      },
      debug_title: pageTitle // This will show us exactly what Vercel sees
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
