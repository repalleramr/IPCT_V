const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async function (req, res) {
  // CORS Setup
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const SERIES_URL = 'https://www.cricbuzz.com/cricket-series/9241/indian-premier-league-2026/matches';

  // Read the Target Teams sent from your Android App
  let targetTeams = "";
  if (req.url.includes('teams=')) {
      targetTeams = decodeURIComponent(req.url.split('teams=')[1].split('&')[0]).toLowerCase();
  }

  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    const { data: seriesHtml } = await axios.get(SERIES_URL, { headers });
    const $series = cheerio.load(seriesHtml);
    
    let activeMatchUrl = null;
    let fallbackUrl = null;

    // --- PHASE 1: TARGETED SEARCH WITH STATUS CHECK ---
    $series('.cb-series-matches').each((i, el) => {
        const text = $series(el).text().toLowerCase();
        const linkElem = $series(el).find('a[href*="/live-cricket-scores/"]').first();
        const href = linkElem.attr('href');
        
        if (!href) return;
        
        // Strict Status Checks using Cricbuzz's internal HTML classes
        const isLive = $series(el).find('.cb-text-live').length > 0;
        const isPreview = $series(el).find('.cb-text-preview').length > 0;
        const isComplete = $series(el).find('.cb-text-complete').length > 0 || text.includes('won by');

        // Check if this block matches the teams you selected
        if (targetTeams) {
            // Extract just the first word of each team (e.g. "royal" and "kolkata") for a foolproof match
            const t1 = targetTeams.split(' vs ')[0].trim().split(' ')[0]; 
            const t2 = targetTeams.split(' vs ')[1] ? targetTeams.split(' vs ')[1].trim().split(' ')[0] : ""; 
            
            if (text.includes(t1) && (!t2 || text.includes(t2))) {
                if (!isComplete) {
                    activeMatchUrl = href;
                    return false; // Target Locked, stop searching
                }
            }
        }

        // If targeted search misses, save the very first Live or Preview match as a backup
        if (!fallbackUrl && !isComplete && (isLive || isPreview)) {
            fallbackUrl = href;
        }
    });

    // --- PHASE 2: FALLBACK TO ACTIVE MATCH ---
    if (!activeMatchUrl) {
        activeMatchUrl = fallbackUrl;
    }

    if (!activeMatchUrl) {
        return res.status(200).json({
          success: true,
          match_info: { title: "STANDBY", live_score: "Awaiting Next Mission", status: "Offline", bowler: "N/A" }
        });
    }

    if (!activeMatchUrl.startsWith('http')) activeMatchUrl = 'https://www.cricbuzz.com' + activeMatchUrl;

    // --- PHASE 3: DATA EXTRACTION ---
    const { data: matchHtml } = await axios.get(activeMatchUrl, { headers });
    const $ = cheerio.load(matchHtml);

    // Score Extractor
    const pageTitle = $('title').text();
    let scoreFromTitle = pageTitle.includes('-') ? pageTitle.split('-')[0].trim() : "Pre-Match Intel";

    // Deep Bowler Extractor
    let bInfo = "Waiting for Toss/Bowler...";
    const bRow = $('.cb-min-bwl-rw').first();
    if (bRow.length > 0) {
        const name = bRow.find('a').first().text().trim();
        const stats = bRow.text().replace(name, '').replace(/\s+/g, ' ').trim();
        if (name) bInfo = `${name} (${stats})`;
    } else {
        const bStats = $('.cb-col-50').filter((i, e) => $(e).text().toLowerCase().includes('ov')).first();
        if (bStats.length > 0) {
            const bName = bStats.prev().text().trim();
            if (bName && bName.length < 25) bInfo = bName + " (Active)";
        }
    }

    const liveStatus = $('.cb-text-live, .cb-text-preview, .cb-min-stts').first().text().trim() || "Status Unknown";

    res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      match_info: {
        title: "TARGET LOCKED",
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
