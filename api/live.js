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

        $series('.cb-col-100, .cb-series-matches').each((i, el) => {
            const blockText = $series(el).text().toLowerCase();
            // If this match block contains both your selected team names
            if (t1 && blockText.includes(t1) && blockText.includes(t2)) {
                const link = $series(el).find('a[href*="/live-cricket-scores/"]').attr('href');
                if (link) {
                    activeMatchUrl = link;
                    return false; // Target Acquired, break the loop
                }
            }
        });
    }

    // DIRECTIVE 2: Failsafe to live/next match if no target was sent
    if (!activeMatchUrl) {
        const liveElement = $series('.cb-text-live, .cb-text-preview').first();
        if (liveElement.length > 0) {
            activeMatchUrl = liveElement.closest('div.cb-col-100').find('a[href*="/live-cricket-scores/"]').attr('href');
        }
    }

    if (!activeMatchUrl) {
        return res.status(200).json({
          success: true,
          match_info: { title: "Target Missing", live_score: "Could not locate this match on server.", status: "Standby", bowler: "N/A" }
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
