const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const SERIES_URL = 'https://www.cricbuzz.com/cricket-series/9241/indian-premier-league-2026/matches';

  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    // 1. Scan Series Page for the REAL active mission
    const { data: seriesHtml } = await axios.get(SERIES_URL, { headers });
    const $series = cheerio.load(seriesHtml);
    let activeMatchUrl = null;

    $series('.cb-series-matches').each((i, el) => {
        const text = $series(el).text().toLowerCase();
        const link = $series(el).find('a[href*="/live-cricket-scores/"]').attr('href');
        
        // PROTOCOL: Skip matches that are already finished (Results)
        const isFinished = text.includes('won by') || text.includes('result') || text.includes('abandoned');
        
        if (link && !isFinished && !activeMatchUrl) {
            activeMatchUrl = link;
        }
    });

    // Fallback: If everything is finished or not started, just grab the first non-archived link
    if (!activeMatchUrl) {
        activeMatchUrl = $series('a[href*="/live-cricket-scores/"]').first().attr('href');
    }

    if (!activeMatchUrl.startsWith('http')) activeMatchUrl = 'https://www.cricbuzz.com' + activeMatchUrl;

    // 2. Scrape the Target Match
    const { data: matchHtml } = await axios.get(activeMatchUrl, { headers });
    const $ = cheerio.load(matchHtml);

    // Score from Browser Title (Very stable)
    const pageTitle = $('title').text();
    let scoreFromTitle = pageTitle.includes('-') ? pageTitle.split('-')[0].trim() : "Pre-Match Intel";

    // DEEP SCAN BOWLER (Checks 3 different locations)
    let bInfo = "Scanning Field...";
    
    // Check Location A: Live mini-row
    const bRow = $('.cb-min-bwl-rw').first();
    if (bRow.length > 0) {
        const name = bRow.find('a').first().text().trim();
        const stats = bRow.text().replace(name, '').replace(/\s+/g, ' ').trim();
        if (name) bInfo = `${name} (${stats})`;
    } else {
        // Check Location B: Statistics Tables
        const bStats = $('.cb-col-50').filter((i, e) => $(e).text().toLowerCase().includes('ov')).first();
        const bName = bStats.prev().text().trim();
        if (bName && bName.length < 25) bInfo = bName + " (On Deck)";
    }

    const liveStatus = $('.cb-text-live, .cb-min-stts').first().text().trim() || "Standby";

    res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      match_info: {
        title: "IPL 2026 MISSION",
        live_score: scoreFromTitle,
        status: liveStatus,
        bowler: bInfo
      },
      target: activeMatchUrl
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
