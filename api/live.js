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

    // 2. Deep Intelligence Bowler Scraper
    let bowlerInfo = "";
    
    // Method 1: Check standard Live Match rows
    $('.cb-min-bwl-rw').each((i, el) => {
        const name = $(el).find('a').first().text().trim();
        const stats = $(el).text().replace(name, '').replace(/\s+/g, ' ').trim();
        if (name) bowlerInfo = `${name} [${stats}]`;
    });

    // Method 2: If Method 1 fails, search all tables for player stats with 'ov'
    if (!bowlerInfo) {
        $('.cb-col-100').each((i, el) => {
            const text = $(el).text();
            if (text.includes('ov') && (text.includes('wkts') || text.includes('runs'))) {
                const parts = text.split(/\d+\.?\d*/); // Split by numbers to find the name
                const name = parts[0].replace('Bowler', '').trim();
                if (name && name.length < 30) {
                    bowlerInfo = name + " (Active)";
                }
            }
        });
    }

    // Method 3: Fallback to the mini-summary text if available
    if (!bowlerInfo) {
        const summary = $('.cb-min-inf').text();
        if (summary.includes('to')) {
             const parts = summary.split('to');
             bowlerInfo = parts[0].trim(); // Usually "Bowler Name to Batsman Name"
        }
    }

    const liveStatus = $('.cb-text-live, .cb-text-complete').first().text().trim() || "In Progress";

    res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      match_info: {
        title: "GT vs SRH",
        live_score: scoreFromTitle,
        status: liveStatus,
        bowler: bowlerInfo || "Scanning Field for Bowler..."
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
