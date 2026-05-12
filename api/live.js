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

    // 2. Aggressive Bowler Extraction (Deep Scan)
    let bowlerInfo = "";
    
    // Method A: Direct class targeting (most common on live matches)
    const bowlerRow = $('.cb-min-bwl-rw').first();
    if (bowlerRow.length > 0) {
        const name = bowlerRow.find('.cb-text-link, a').first().text().trim();
        const overs = bowlerRow.find('.cb-col-10, .cb-col-8').eq(0).text().trim();
        const runs = bowlerRow.find('.cb-col-10, .cb-col-8').eq(2).text().trim();
        const wkts = bowlerRow.find('.cb-col-10, .cb-col-8').eq(3).text().trim();
        
        if (name) bowlerInfo = `${name} [${wkts}/${runs} in ${overs} ov]`;
    }

    // Method B: Look for the exact word "Bowler" on the page and grab the player under it
    if (!bowlerInfo || bowlerInfo.includes("undefined")) {
        $('div, span').each((i, el) => {
            if ($(el).text().trim() === 'Bowler') {
                const nextContainer = $(el).parent().next();
                const foundName = nextContainer.find('a').first().text().trim();
                if (foundName) {
                    bowlerInfo = foundName + " (Active)";
                    return false; // Break the loop once found
                }
            }
        });
    }

    // Fallback if completely hidden by Cricbuzz during an over break
    if (!bowlerInfo || bowlerInfo === "") {
        bowlerInfo = "Data encrypted during over break...";
    }

    const liveStatus = $('.cb-text-live, .cb-text-complete').first().text().trim() || "In Progress";

    res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      match_info: {
        title: "GT vs SRH",
        live_score: scoreFromTitle,
        status: liveStatus,
        bowler: bowlerInfo
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
