const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async function (req, res) {
  // CORS Setup
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const SERIES_URL = 'https://www.cricbuzz.com/cricket-series/9241/indian-premier-league-2026/matches';

  // Extract selected teams from the App's request
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

    // --- PHASE 1: TARGETED SEARCH ---
    if (targetTeams) {
        const teamParts = targetTeams.split(' vs ').map(t => t.trim());
        const t1 = teamParts[0];
        const t2 = teamParts[1] || "";

        // We check ALL anchor tags on the series page for team name matches
        $series('a').each((i, el) => {
            const href = $series(el).attr('href') || "";
            const linkText = $series(el).text().toLowerCase();
            
            // Only consider links that look like cricket score pages
            if (href.includes('cricket-scores')) {
                if (t1 && linkText.includes(t1) && (!t2 || linkText.includes(t2))) {
                    activeMatchUrl = href;
                    return false; // Found our mission target
                }
            }
        });
    }

    // --- PHASE 2: AUTOMATIC FALLBACK ---
    // If targeted search fails, find the first match that isn't 'Completed'
    if (!activeMatchUrl) {
        $series('.cb-series-matches').each((i, el) => {
            const blockText = $series(el).text().toLowerCase();
            const isDone = blockText.includes('won by') || blockText.includes('result');
            
            if (!isDone) {
                const link = $series(el).find('a[href*="cricket-scores"]').attr('href');
                if (link) {
                    activeMatchUrl = link;
                    return false;
                }
            }
        });
    }

    if (!activeMatchUrl || activeMatchUrl === "undefined") {
        return res.status(200).json({
          success: true,
          match_info: { title: "MISSION FAILED", live_score: "Target Out of Range", status: "Offline", bowler: "N/A" }
        });
    }

    if (!activeMatchUrl.startsWith('http')) activeMatchUrl = 'https://www.cricbuzz.com' + activeMatchUrl;

    // --- PHASE 3: DATA EXTRACTION ---
    const { data: matchHtml } = await axios.get(activeMatchUrl, { headers });
    const $ = cheerio.load(matchHtml);

    // Title Score Extractor
    const pageTitle = $('title').text();
    let scoreFromTitle = pageTitle.includes('-') ? pageTitle.split('-')[0].trim() : "Pre-Match Intelligence";

    // Status Extractor
    const liveStatus = $('.cb-text-live, .cb-text-preview, .cb-min-stts').first().text().trim() || "Standby";

    // Bowler Extractor
    let bInfo = "Standby (Toss Pending)";
    const bRow = $('.cb-min-bwl-rw').first();
    if (bRow.length > 0) {
        const name = bRow.find('a').first().text().trim();
        const stats = bRow.text().replace(name, '').replace(/\s+/g, ' ').trim();
        if (name) bInfo = `${name} (${stats})`;
    } else {
        const bStats = $('.cb-col-50').filter((i, e) => $(e).text().toLowerCase().includes('ov')).first();
        const bName = bStats.prev().text().trim();
        if (bName && bName.length < 25) bInfo = bName + " (Active)";
    }

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
