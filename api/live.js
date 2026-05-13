const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const SERIES_URL = 'https://www.cricbuzz.com/cricket-series/9241/indian-premier-league-2026/matches';
  const HOME_URL = 'https://www.cricbuzz.com/';

  // BULLETPROOF QUERY EXTRACTOR 
  let targetTeams = "";
  try {
      const urlStr = req.url.startsWith('http') ? req.url : `http://localhost${req.url}`;
      const urlObj = new URL(urlStr);
      targetTeams = urlObj.searchParams.get('teams') || "";
      targetTeams = targetTeams.toLowerCase().replace(/\+/g, ' ');
  } catch(e) {}

  const teamAliases = {
      "chennai": ["csk", "chennai"],
      "delhi": ["dc", "delhi"],
      "gujarat": ["gt", "gujarat"],
      "kolkata": ["kkr", "kolkata"],
      "lucknow": ["lsg", "lucknow"],
      "mumbai": ["mi", "mumbai"],
      "punjab": ["pbks", "punjab", "kings"],
      "rajasthan": ["rr", "rajasthan"],
      "royal": ["rcb", "royal", "bengaluru", "bangalore"],
      "sunrisers": ["srh", "sunrisers", "hyderabad"]
  };

  try {
    const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };
    
    let activeMatchUrl = null;
    let matchState = "unknown"; 
    let fallbackResult = "Upcoming Scheduled Match";

    const t1Word = targetTeams.split(' vs ')[0] ? targetTeams.split(' vs ')[0].trim().split(' ')[0] : "";
    const t2Word = targetTeams.split(' vs ')[1] ? targetTeams.split(' vs ')[1].trim().split(' ')[0] : "";

    const t1Aliases = teamAliases[t1Word] || [t1Word];
    const t2Aliases = teamAliases[t2Word] || [t2Word];
    const hasAlias = (text, aliases) => aliases.some(alias => alias && text.includes(alias));

    // --- PHASE 1: SERIES PAGE SCANNER ---
    try {
        const { data: seriesHtml } = await axios.get(SERIES_URL, { headers });
        const $series = cheerio.load(seriesHtml);
        
        $series('.cb-col-100, .cb-series-matches').each((i, el) => {
            const text = $series(el).text().toLowerCase();
            const href = $series(el).find('a[href*="cricket-score"]').first().attr('href') || "";
            
            const matchesT1 = hasAlias(text, t1Aliases) || hasAlias(href, t1Aliases);
            const matchesT2 = hasAlias(text, t2Aliases) || hasAlias(href, t2Aliases);

            if (targetTeams && matchesT1 && matchesT2) {
                if ($series(el).find('.cb-text-complete').length > 0 || text.includes('won by') || text.includes('result')) {
                    matchState = "complete";
                    fallbackResult = $series(el).find('.cb-text-complete').text().trim() || "Match Ended";
                } else if ($series(el).find('.cb-text-live').length > 0) {
                    matchState = "live";
                    fallbackResult = "In Progress";
                } else {
                    matchState = "upcoming";
                    let timeText = $series(el).find('.cb-text-preview').text().trim();
                    if (!timeText) timeText = $series(el).find('.text-gray').text().trim();
                    if (timeText) fallbackResult = timeText;
                }

                if (href) activeMatchUrl = href.startsWith('http') ? href : 'https://www.cricbuzz.com' + href;
                return false; 
            }
        });
    } catch(e) {}

    // --- PHASE 2: HOMEPAGE FALLBACK ---
    if (!activeMatchUrl && targetTeams) {
        try {
            const { data: homeHtml } = await axios.get(HOME_URL, { headers });
            const $home = cheerio.load(homeHtml);
            
            $home('a[href*="/live-cricket-scores/"]').each((i, el) => {
                const href = $home(el).attr('href').toLowerCase();
                const text = $home(el).text().toLowerCase();
                
                if (hasAlias(text, t1Aliases) && hasAlias(text, t2Aliases)) {
                    activeMatchUrl = $home(el).attr('href');
                    activeMatchUrl = activeMatchUrl.startsWith('http') ? activeMatchUrl : 'https://www.cricbuzz.com' + activeMatchUrl;
                    
                    if (text.includes('won by') || text.includes('result')) {
                        matchState = "complete"; fallbackResult = "Match Ended";
                    } else {
                        matchState = "live"; fallbackResult = "In Progress";
                    }
                    return false;
                }
            });
        } catch(e) {}
    }

    // --- PHASE 3: OUTPUT ---
    if (!activeMatchUrl || matchState === "upcoming" || matchState === "unknown") {
        return res.status(200).json({
          success: true,
          timestamp: new Date().toISOString(),
          match_info: {
            title: "STANDBY MODE",
            live_score: "Pre-Match / Future Schedule",
            status: targetTeams ? fallbackResult : "Select Mission Target",
            bowler: "Toss Pending / N/A"
          },
          target: SERIES_URL
        });
    }

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
        scoreFromTitle = finalStatus; 
        finalStatus = "Match Ended";
        bInfo = "Mission Accomplished";
    } else {
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
