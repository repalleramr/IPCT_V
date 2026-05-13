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
  if (req.query && req.query.teams) {
      targetTeams = String(req.query.teams).toLowerCase();
  } else if (req.url && req.url.includes('teams=')) {
      targetTeams = decodeURIComponent(req.url.split('teams=')[1].split('&')[0]).toLowerCase();
  }
  targetTeams = targetTeams.replace(/\+/g, ' ').trim();

  // IPCT Alias Dictionary
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
    const { data: seriesHtml } = await axios.get(SERIES_URL, { headers });
    const $series = cheerio.load(seriesHtml);
    
    let activeMatchUrl = null;
    let matchState = "unknown";
    let fallbackResult = "Awaiting Match Timing";

    const t1Word = targetTeams.split(' vs ')[0] ? targetTeams.split(' vs ')[0].trim().split(' ')[0] : "";
    const t2Word = targetTeams.split(' vs ')[1] ? targetTeams.split(' vs ')[1].trim().split(' ')[0] : "";

    const t1Aliases = teamAliases[t1Word] || [t1Word];
    const t2Aliases = teamAliases[t2Word] || [t2Word];
    const hasAlias = (text, aliases) => aliases.some(alias => alias && text.includes(alias));

    // --- PHASE 1: LOCATE TARGET ON SERIES PAGE ---
    $series('.cb-col-100, .cb-series-matches').each((i, el) => {
        const text = $series(el).text().toLowerCase();
        const href = $series(el).find('a[href*="cricket-score"]').first().attr('href') || "";
        
        if (targetTeams && (hasAlias(text, t1Aliases) || hasAlias(href, t1Aliases)) && (hasAlias(text, t2Aliases) || hasAlias(href, t2Aliases))) {
            
            if ($series(el).find('.cb-text-complete').length > 0 || text.includes('won by') || text.includes('result')) {
                matchState = "complete";
                fallbackResult = $series(el).find('.cb-text-complete').text().trim() || "Match Ended";
            } else if ($series(el).find('.cb-text-live').length > 0) {
                matchState = "live";
            } else {
                matchState = "upcoming";
                fallbackResult = $series(el).find('.cb-text-preview').text().trim() || $series(el).find('.text-gray').text().trim() || "Starting Soon";
            }

            if (href) activeMatchUrl = href.startsWith('http') ? href : 'https://www.cricbuzz.com' + href;
            return false;
        }
    });

    // --- PHASE 2: IF UPCOMING OR NOT FOUND ---
    if (!activeMatchUrl || matchState === "upcoming") {
         return res.status(200).json({
          success: true,
          match_info: {
            title: "IPCT STANDBY",
            live_score: "Pre-Match Intel",
            status: targetTeams ? fallbackResult : "Select Target",
            bowler: "Toss Pending / N/A",
            last_10: "Awaiting First Ball",
            prediction: "Oracle Offline"
          }
        });
    }

    // --- PHASE 3: LIVE OR COMPLETED MATCH DATA ---
    const liveUrl = activeMatchUrl.replace('/cricket-scores/', '/live-cricket-scores/');
    const { data: matchHtml } = await axios.get(liveUrl, { headers });
    const $ = cheerio.load(matchHtml);

    let score = $('title').text().split('-')[0].trim();
    let status = $('.cb-text-live, .cb-text-complete, .cb-min-stts').first().text().trim() || fallbackResult;
    let bowlerInfo = "N/A";
    
    let last10 = [];
    let prediction = "Match Ended";

    if (matchState === "complete" || status.toLowerCase().includes('won by') || status.toLowerCase().includes('result')) {
        score = status;
        status = "Match Ended";
        bowlerInfo = "Mission Accomplished";
        last10 = ["Data Archived"];
    } else {
        const bRow = $('.cb-min-bwl-rw').first();
        if (bRow.length > 0) {
            const name = bRow.find('a').first().text().trim();
            const stats = bRow.text().replace(name, '').replace(/\s+/g, ' ').trim();
            if (name) bowlerInfo = `${name} (${stats})`;
        } else {
            const bStats = $('.cb-col-50').filter((i, e) => $(e).text().toLowerCase().includes('ov')).first();
            if (bStats.length > 0) {
                const bName = bStats.prev().text().trim();
                if (bName) bowlerInfo = bName + " (Active)";
            }
        }

        // IPCT Momentum Prediction Engine
        $('.cb-col-10.cb-font-12').each((i, el) => {
            if (i < 10) last10.push($(el).text().trim());
        });

        let runsInLast10 = 0;
        let wicketsInLast10 = 0;
        last10.forEach(ball => {
            if (ball === 'W') wicketsInLast10++;
            else if (!isNaN(ball)) runsInLast10 += parseInt(ball);
        });

        prediction = "STABLE: Momentum neutral.";
        if (wicketsInLast10 > 1) prediction = "DANGER: High Sabotage Risk (Eat).";
        else if (runsInLast10 > 15) prediction = "AGGRESSIVE: Strong Buy (Play).";
    }

    res.status(200).json({
      success: true,
      match_info: {
        title: "IPCT TARGET LOCKED",
        live_score: score,
        status: status,
        bowler: bowlerInfo,
        last_10: last10.join(' | ') || "No data yet",
        prediction: prediction
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
