const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async function (req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // The Master Series Page for IPL 2026
  const SERIES_URL = 'https://www.cricbuzz.com/cricket-series/9241/indian-premier-league-2026/matches';

  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    // 1. STEP ONE: Ping the Series Page
    const { data: seriesHtml } = await axios.get(SERIES_URL, { headers });
    const $series = cheerio.load(seriesHtml);

    let activeMatchUrl = null;

    // 2. STEP TWO: Hunt for the active "Live" Match
    $series('.cb-text-live, .cb-text-preview').each((i, el) => {
        const parentCard = $series(el).closest('.cb-col-100, .cb-series-matches');
        const link = parentCard.find('a[href*="/live-cricket-scores/"]').attr('href') || parentCard.find('a').attr('href');
        
        if (link && !activeMatchUrl && link.includes('cricket-scores')) {
            activeMatchUrl = link;
        }
    });

    // Fallback: If no live tag is found, grab the first available match link
    if (!activeMatchUrl) {
        $series('a[href*="/live-cricket-scores/"]').each((i, el) => {
            const href = $series(el).attr('href');
            if (href && !href.includes('archives') && !activeMatchUrl) {
                 activeMatchUrl = href; 
            }
        });
    }

    // If absolutely no matches are found
    if (!activeMatchUrl) {
        return res.status(200).json({
          success: true,
          timestamp: new Date().toISOString(),
          match_info: {
            title: "Series Target Offline",
            live_score: "Awaiting Live Action",
            status: "No active IPL match found right now.",
            bowler: "Standby..."
          }
        });
    }

    // Ensure it's a full URL
    if (!activeMatchUrl.startsWith('http')) {
        activeMatchUrl = 'https://www.cricbuzz.com' + activeMatchUrl;
    }

    // 3. STEP THREE: Scrape the specific match we just found
    const { data: matchHtml } = await axios.get(activeMatchUrl, { headers });
    const $ = cheerio.load(matchHtml);

    // Title Score Extractor
    const pageTitle = $('title').text();
    let scoreFromTitle = pageTitle.includes('-') ? pageTitle.split('-')[0].trim() : "Fetching Score...";

    // Deep Scan Bowler Extractor
    let bowlerInfo = "";
    const bowlerRow = $('.cb-min-bwl-rw').first();
    
    if (bowlerRow.length > 0) {
        const name = bowlerRow.find('.cb-text-link, a').first().text().trim();
        const overs = bowlerRow.find('.cb-col-10, .cb-col-8').eq(0).text().trim();
        const runs = bowlerRow.find('.cb-col-10, .cb-col-8').eq(2).text().trim();
        const wkts = bowlerRow.find('.cb-col-10, .cb-col-8').eq(3).text().trim();
        
        if (name) bowlerInfo = `${name} [${wkts}/${runs} in ${overs} ov]`;
    }

    if (!bowlerInfo) {
        $('div, span').each((i, el) => {
            if ($(el).text().trim() === 'Bowler') {
                const foundName = $(el).parent().next().find('a').first().text().trim();
                if (foundName) {
                    bowlerInfo = foundName + " (Active)";
                    return false;
                }
            }
        });
    }

    if (!bowlerInfo) bowlerInfo = "Analyzing Field Assets...";

    const liveStatus = $('.cb-text-live, .cb-text-complete, .cb-min-stts').first().text().trim() || "In Progress";

    res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      match_info: {
        title: "IPL 2026 LIVE",
        live_score: scoreFromTitle,
        status: liveStatus,
        bowler: bowlerInfo
      },
      debug_target_url: activeMatchUrl // This helps you see exactly which match the bot found
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
