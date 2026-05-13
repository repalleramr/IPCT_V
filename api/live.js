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

    const { data: seriesHtml } = await axios.get(SERIES_URL, { headers });
    const $series = cheerio.load(seriesHtml);
    let activeMatchUrl = null;

    // 1. LOOK FOR A LIVE MATCH
    const liveElement = $series('.cb-text-live').first();
    if (liveElement.length > 0) {
        activeMatchUrl = liveElement.closest('div.cb-col-100, .cb-series-matches').find('a[href*="/live-cricket-scores/"]').attr('href');
    }

    // 2. IF NO LIVE MATCH, LOOK FOR THE NEXT UPCOMING MATCH (e.g., MI vs RCB)
    if (!activeMatchUrl) {
        const previewElement = $series('.cb-text-preview').first();
        if (previewElement.length > 0) {
            activeMatchUrl = previewElement.closest('div.cb-col-100, .cb-series-matches').find('a[href*="/live-cricket-scores/"]').attr('href');
        }
    }

    // 3. FAILSAFE: Find the first match that does NOT have the "Completed" tag
    if (!activeMatchUrl) {
        $series('a[href*="/live-cricket-scores/"]').each((i, el) => {
            const block = $series(el).closest('div.cb-col-100');
            const isFinished = block.find('.cb-text-complete').length > 0;
            
            if (!isFinished && !activeMatchUrl && $series(el).attr('href').includes('indian-premier-league')) {
                activeMatchUrl = $series(el).attr('href');
            }
        });
    }

    // If season is over
    if (!activeMatchUrl) {
        return res.status(200).json({
          success: true,
          match_info: { title: "IPL Offline", live_score: "No active matches found.", status: "Standby", bowler: "Scanning..." }
        });
    }

    if (!activeMatchUrl.startsWith('http')) activeMatchUrl = 'https://www.cricbuzz.com' + activeMatchUrl;

    // FETCH THE TARGET MATCH
    const { data: matchHtml } = await axios.get(activeMatchUrl, { headers });
    const $ = cheerio.load(matchHtml);

    const pageTitle = $('title').text();
    let scoreFromTitle = pageTitle.includes('-') ? pageTitle.split('-')[0].trim() : "Pre-Match Intel";

    // BOWLER EXTRACTION
    let bInfo = "Scanning Field...";
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

    const liveStatus = $('.cb-text-live, .cb-text-preview, .cb-min-stts').first().text().trim() || "Match starting soon...";

    res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      match_info: {
        title: "IPL 2026 MISSION",
        live_score: scoreFromTitle,
        status: liveStatus,
        bowler: bInfo
      },
      target: activeMatchUrl // Watch this link change to MI vs RCB!
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
