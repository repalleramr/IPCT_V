const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const SERIES_URL = 'https://www.cricbuzz.com/cricket-series/9241/indian-premier-league-2026/matches';

  let targetTeams = "";
  if (req.query && req.query.teams) {
      targetTeams = String(req.query.teams).toLowerCase();
  } else if (req.url && req.url.includes('teams=')) {
      targetTeams = decodeURIComponent(req.url.split('teams=')[1].split('&')[0]).toLowerCase();
  }
  targetTeams = targetTeams.replace(/\+/g, ' ').trim();

  try {
    const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };
    const { data: seriesHtml } = await axios.get(SERIES_URL, { headers });
    const $series = cheerio.load(seriesHtml);
    
    let activeMatchUrl = null;

    // --- PHASE 1: FIND TARGET ---
    $series('.cb-series-matches').each((i, el) => {
        const text = $series(el).text().toLowerCase();
        if (targetTeams && text.includes(targetTeams.split(' vs ')[0].substring(0,4))) {
            const href = $series(el).find('a[href*="cricket-score"]').first().attr('href');
            if (href) activeMatchUrl = href.startsWith('http') ? href : 'https://www.cricbuzz.com' + href;
            return false;
        }
    });

    if (!activeMatchUrl) {
        return res.status(200).json({ success: true, match_info: { title: "IPCT STANDBY", live_score: "Awaiting Mission", status: "Offline", bowler: "N/A", prediction: "Oracle Offline" } });
    }

    // --- PHASE 2: SCRAPE LIVE DATA & COMMENTARY ---
    const liveUrl = activeMatchUrl.replace('/cricket-scores/', '/live-cricket-scores/');
    const { data: matchHtml } = await axios.get(liveUrl, { headers });
    const $ = cheerio.load(matchHtml);

    // 1. Basic Stats
    const score = $('title').text().split('-')[0].trim();
    const status = $('.cb-text-live, .cb-text-preview, .cb-text-complete').first().text().trim();
    
    // 2. Prediction Engine (Last 10 Balls)
    let last10 = [];
    $('.cb-col-10.cb-font-12').each((i, el) => {
        if (i < 10) last10.push($(el).text().trim());
    });

    let runsInLast10 = 0;
    let wicketsInLast10 = 0;
    last10.forEach(ball => {
        if (ball === 'W') wicketsInLast10++;
        else if (!isNaN(ball)) runsInLast10 += parseInt(ball);
    });

    let prediction = "STABLE: Momentum neutral.";
    if (wicketsInLast10 > 1) prediction = "DANGER: High Sabotage Risk (Eat).";
    else if (runsInLast10 > 15) prediction = "AGGRESSIVE: Strong Buy (Play).";

    res.status(200).json({
      success: true,
      match_info: {
        title: "IPCT TARGET LOCKED",
        live_score: score,
        status: status,
        bowler: $('.cb-min-bwl-rw').first().find('a').first().text().trim() || "N/A",
        last_10: last10.join(' | ') || "No data yet",
        prediction: prediction
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
