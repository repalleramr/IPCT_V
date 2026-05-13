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
    let matchState = "unknown"; 
    let fallbackResult = "";

    // --- PHASE 1: UNBREAKABLE 4-LETTER TARGET MATCHING ---
    if (targetTeams) {
        const teamParts = targetTeams.split(' vs ').map(t => t.trim());
        // Grab just the first 4 letters to bypass "Bengaluru" vs "Bangalore" spelling issues
        const t1 = teamParts[0] ? teamParts[0].substring(0, 4) : ""; 
        const t2 = teamParts[1] ? teamParts[1].substring(0, 4) : ""; 

        $series('.cb-col-100, .cb-series-matches').each((i, el) => {
            const text = $series(el).text().toLowerCase();
            
            // If the block contains both 4-letter team identifiers
            if (t1 && text.includes(t1) && (!t2 || text.includes(t2))) {
                const link = $series(el).find('a[href*="cricket-score"]').first().attr('href');
                
                if (link) {
                    activeMatchUrl = link;
                    
                    // Determine Match State directly from the series page
                    if ($series(el).find('.cb-text-complete').length > 0 || text.includes('won by') || text.includes('result')) {
                        matchState = "complete";
                    } else if ($series(el).find('.cb-text-live').length > 0) {
                        matchState = "live";
                    } else {
                        matchState = "upcoming";
                    }
                    
                    // Grab the text containing the time or result
                    fallbackResult = $series(el).find('.cb-text-complete').text().trim() || $series(el).find('.cb-text-preview').text().trim();
                    
                    return false; // Target Locked
                }
            }
        });
    }

    // --- PHASE 2: ERROR HANDLING ---
    if (!activeMatchUrl) {
        return res.status(200).json({
          success: true,
          match_info: { 
              title: "TARGET NOT FOUND", 
              live_score: "Teams not found on Cricbuzz schedule.", 
              status: "Check Dropdown Teams", 
              bowler: "N/A" 
          }
        });
    }

    if (!activeMatchUrl.startsWith('http')) activeMatchUrl = 'https://www.cricbuzz.com' + activeMatchUrl;

    // Force Live URL format to ensure we can read live data if the match just started
    if (activeMatchUrl.includes('/cricket-scores/') && !activeMatchUrl.includes('/live-cricket-scores/')) {
        activeMatchUrl = activeMatchUrl.replace('/cricket-scores/', '/live-cricket-scores/');
    }

    // --- PHASE 3: DATA EXTRACTION & FORMATTING ---
    const { data: matchHtml } = await axios.get(activeMatchUrl, { headers });
    const $ = cheerio.load(matchHtml);

    const pageTitle = $('title').text();
    let scoreFromTitle = pageTitle.includes('-') ? pageTitle.split('-')[0].trim() : pageTitle;
    let bInfo = "N/A";
    let finalStatus = $('.cb-text-complete, .cb-text-live, .cb-text-preview').first().text().trim() || fallbackResult;

    // --- DYNAMIC OUTPUT CONTROL ---
    if (matchState === "complete" || finalStatus.toLowerCase().includes('won by') || finalStatus.toLowerCase().includes('result')) {
        // MATCH ENDED
        scoreFromTitle = finalStatus; 
        finalStatus = "Match Ended";
        bInfo = "Mission Accomplished";
    } 
    else if (matchState === "upcoming" || finalStatus.toLowerCase().includes('time') || finalStatus.toLowerCase().includes('start')) {
        // MATCH NOT STARTED
        scoreFromTitle = finalStatus; 
        finalStatus = "Awaiting First Ball";
        bInfo = "Toss/Assets Pending...";
    } 
    else {
        // MATCH IS LIVE
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
      target: activeMatchUrl
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
