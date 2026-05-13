const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async function (req, res) {
  // CORS Setup
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // The master series page you provided
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
    let matchState = "unknown"; 
    let fallbackResult = "Awaiting match timing...";

    // --- PHASE 1: SERIES PAGE SCANNING ---
    if (targetTeams) {
        const teamParts = targetTeams.split(' vs ').map(t => t.trim());
        const t1 = teamParts[0] ? teamParts[0].substring(0, 4) : ""; 
        const t2 = teamParts[1] ? teamParts[1].substring(0, 4) : ""; 

        $series('.cb-col-100, .cb-series-matches').each((i, el) => {
            const text = $series(el).text().toLowerCase();
            
            // If the block contains your targeted teams
            if (t1 && text.includes(t1) && (!t2 || text.includes(t2))) {
                const link = $series(el).find('a[href*="cricket-score"]').first().attr('href');
                
                // Determine exactly what state the match is in
                if ($series(el).find('.cb-text-complete').length > 0 || text.includes('won by') || text.includes('result')) {
                    matchState = "complete";
                    fallbackResult = $series(el).find('.cb-text-complete').text().trim() || "Match Ended";
                } else if ($series(el).find('.cb-text-live').length > 0) {
                    matchState = "live";
                    fallbackResult = "In Progress";
                } else {
                    matchState = "upcoming";
                    // Grab the match timing/date directly from the series page
                    fallbackResult = $series(el).find('.cb-text-preview').text().trim() || "Match Starting Soon";
                }

                if (link) {
                    activeMatchUrl = link.startsWith('http') ? link : 'https://www.cricbuzz.com' + link;
                }
                
                return false; // Break loop
            }
        });
    }

    // --- PHASE 2: YOUR REQUESTED LOGIC ---
    // If no match has started, target the Series Link and return the timing!
    if (!activeMatchUrl || matchState === "upcoming" || matchState === "unknown") {
        return res.status(200).json({
          success: true,
          timestamp: new Date().toISOString(),
          match_info: {
            title: "STANDBY MODE",
            live_score: "Awaiting First Ball",
            status: fallbackResult !== "Awaiting match timing..." ? fallbackResult : "Check Dropdown Teams",
            bowler: "Toss Pending / N/A"
          },
          target: SERIES_URL // Safe fallback to the series page
        });
    }

    // --- PHASE 3: MATCH HAS STARTED (Live or Ended) ---
    // Target the specific Match Link as requested
    if (activeMatchUrl.includes('/cricket-scores/') && !activeMatchUrl.includes('/live-cricket-scores/')) {
        activeMatchUrl = activeMatchUrl.replace('/cricket-scores/', '/live-cricket-scores/');
    }

    const { data: matchHtml } = await axios.get(activeMatchUrl, { headers });
    const $ = cheerio.load(matchHtml);

    const pageTitle = $('title').text();
    let scoreFromTitle = pageTitle.includes('-') ? pageTitle.split('-')[0].trim() : pageTitle;
    let bInfo = "N/A";
    let finalStatus = $('.cb-text-complete, .cb-text-live, .cb-min-stts').first().text().trim() || fallbackResult;

    if (matchState === "complete" || finalStatus.toLowerCase().includes('won by') || finalStatus.toLowerCase().includes('result')) {
        // Show result for ended matches
        scoreFromTitle = finalStatus; 
        finalStatus = "Match Ended";
        bInfo = "Mission Accomplished";
    } else {
        // Scrape Live Bowler
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
    }

    res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      match_info: {
        title: "TARGET LOCKED",
        live_score: scoreFromTitle,
        status: finalStatus,
        bowler: bInfo
      },
      target: activeMatchUrl // Targets the live match link!
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
