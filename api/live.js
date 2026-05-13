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
            const href = $series(el).attr('href').toLowerCase();
            
            // Check if the link text or URL contains both team names
            if (t1 && (linkText.includes(t1) || href.includes(t1.replace(/ /g, '-'))) && 
               (!t2 || linkText.includes(t2) || href.includes(t2.replace(/ /g, '-')))) {
                activeMatchUrl = $series(el).attr('href');
                return false; // Target Acquired, break loop
            }
        });
    }

    // DIRECTIVE 2: Ultimate Failsafe - Auto-lock on to REAL Live or Preview Match
    if (!activeMatchUrl) {
        // Find the tag indicating a match is live, or about to start
        const fallbackElement = $series('.cb-text-live').length > 0 ? $series('.cb-text-live').first() : $series('.cb-text-preview').first();
        
        if (fallbackElement.length > 0) {
            // Traverse upwards to dynamically find the correct match link
            let current = fallbackElement;
            for(let i = 0; i < 6; i++) {
                current = current.parent();
                const link = current.find('a[href*="/live-cricket-scores/"]').attr('href');
                if (link) {
                    activeMatchUrl = link;
                    break;
                }
            }
        }
    }

    // DIRECTIVE 3: If season is over or offline
    if (!activeMatchUrl) {
        return res.status(200).json({
          success: true,
          match_info: { title: "Target Missing", live_score: "Intel mismatch. Adjust mission parameters.", status: "Standby", bowler: "N/A" }
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
