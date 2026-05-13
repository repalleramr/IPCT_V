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
  let targetTeams = null;
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

    // DIRECTIVE 1: Search specifically for the teams selected in the app dropdown
    if (targetTeams) {
        const teamParts = targetTeams.split(' vs ').map(t => t.trim());
        const t1 = teamParts[0];
        const t2 = teamParts[1] || ""; 

        $series('a[href*="/live-cricket-scores/"]').each((i, el) => {
            const linkText = $series(el).text().toLowerCase();
            if (t1 && linkText.includes(t1) && (!t2 || linkText.includes(t2))) {
                activeMatchUrl = $series(el).attr('href');
                return false; // Target Acquired
            }
        });
    }

    // DIRECTIVE 2: Ultimate Brute Force Failsafe 
    // If the selected match isn't found, find the first match that IS NOT finished yet.
    if (!activeMatchUrl) {
        $series('a[href*="/live-cricket-scores/"]').each((i, el) => {
            // We check the entire block of text surrounding the link
            const matchBlockText = $series(el).closest('.cb-col-100, .cb-series-matches').text().toLowerCase();
            const isCompleted = matchBlockText.includes('won by') || matchBlockText.includes('result') || matchBlockText.includes('abandoned');
            
            if (!isCompleted && !activeMatchUrl) {
                activeMatchUrl = $series(el).attr('href');
            }
        });
    }

    // DIRECTIVE 3: Absolute Failsafe (Grab literally the first link if all else fails)
    if (!activeMatchUrl) {
        activeMatchUrl = $series('a[href*="/live-cricket-scores/"]').first().attr('href');
    }

    if (!activeMatchUrl || activeMatchUrl === "undefined") {
        return res.status(200).json({
          success: true,
          match_info: { title: "Target Missing", live_score: "Cricbuzz server is not responding with matches.", status: "Offline", bowler: "N/A" }
        });
    }

    if (!activeMatchUrl.startsWith('http')) activeMatchUrl = 'https://www.cricbuzz.com' + activeMatchUrl;

    // FETCH THE TARGETED MATCH
    const { data: matchHtml } = await axios.get(activeMatchUrl, { headers });
    const $ = cheerio.load(matchHtml);

    const pageTitle = $('title').text();
    let scoreFromTitle = pageTitle.includes('-') ? pageTitle.split('-')[0].trim() : "Pre-Match Intel";

    let bInfo = "Waiting for Bowler...";
    const bRow = $('.cb-min-bwl-rw').first();
    if (bRow.length > 0) {
        const name = bRow.find('a').first().text().trim();
        const stats = bRow.text().replace(name, '').replace(/\s+/g, ' ').trim();
        if (name) bInfo = `${name} (${stats})`;
    } else {
        const bStats = $('.cb-col-50').filter((i, e) => $(e).text().toLowerCase().includes('ov')).first();
        const bName = bStats.prev().text().trim();
        if (bName && bName.length < 25) bInfo = bName + " (On Deck)";
    }

    const liveStatus = $('.cb-text-live, .cb-text-preview, .cb-text-complete, .cb-min-stts').first().text().trim() || "Status Unknown";

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
