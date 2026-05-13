const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async function (req, res) {
  // CORS Setup
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // New Strategy: Scan the master homepage slider instead of a hidden series link
  const HOME_URL = 'https://www.cricbuzz.com/';

  // Read the Target Teams sent from your Android App
  let targetTeams = null;
  if (req.url.includes('teams=')) {
      targetTeams = decodeURIComponent(req.url.split('teams=')[1].split('&')[0]).toLowerCase();
      // Auto-correct Bengaluru to Bangalore as Cricbuzz URLs use the old name
      targetTeams = targetTeams.replace('bengaluru', 'bangalore');
  }

  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    const { data: homeHtml } = await axios.get(HOME_URL, { headers });
    const $home = cheerio.load(homeHtml);
    let activeMatchUrl = null;

    // DIRECTIVE 1: Search the Cricbuzz Home Page specifically for IPL links
    $home('a[href*="/live-cricket-scores/"]').each((i, el) => {
        const href = $home(el).attr('href').toLowerCase();
        
        // Filter strictly for IPL matches in the slider
        if (href.includes('indian-premier-league')) {
            if (targetTeams) {
                // Extract the first word of the team you selected (e.g., "royal" or "mumbai")
                const team1FirstWord = targetTeams.split(' vs ')[0].trim().split(' ')[0]; 
                
                // Check if the Cricbuzz URL contains that word
                if (href.includes(team1FirstWord)) {
                    activeMatchUrl = $home(el).attr('href');
                    return false; // Found exact match, stop searching
                }
            } else {
                // If no team specified, grab the very first IPL match found
                activeMatchUrl = $home(el).attr('href');
                return false;
            }
        }
    });

    // DIRECTIVE 2: Ultimate Failsafe - Just grab the first IPL match regardless of teams
    if (!activeMatchUrl) {
        $home('a[href*="/live-cricket-scores/"]').each((i, el) => {
            const href = $home(el).attr('href').toLowerCase();
            if (href.includes('indian-premier-league')) {
                activeMatchUrl = $home(el).attr('href');
                return false;
            }
        });
    }

    // DIRECTIVE 3: If literally nothing is found on the homepage
    if (!activeMatchUrl || activeMatchUrl === "undefined") {
        return res.status(200).json({
          success: true,
          match_info: { title: "MISSION FAILED", live_score: "Cricbuzz Home API Offline", status: "No IPL Match Found", bowler: "N/A" }
        });
    }

    if (!activeMatchUrl.startsWith('http')) activeMatchUrl = 'https://www.cricbuzz.com' + activeMatchUrl;

    // FETCH THE TARGETED MATCH
    const { data: matchHtml } = await axios.get(activeMatchUrl, { headers });
    const $ = cheerio.load(matchHtml);

    const pageTitle = $('title').text();
    let scoreFromTitle = pageTitle.includes('-') ? pageTitle.split('-')[0].trim() : "Pre-Match Intel";

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
            if (bName && bName.length < 25) bInfo = bName + " (On Deck)";
        }
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
