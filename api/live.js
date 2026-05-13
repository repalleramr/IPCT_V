const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  if (req.method === 'OPTIONS') return res.status(200).end();

  let targetTeams = "";
  try {
      if (req.query && req.query.teams) targetTeams = req.query.teams;
      else if (req.url && req.url.includes('teams=')) targetTeams = decodeURIComponent(req.url.split('teams=')[1].split('&')[0]);
      targetTeams = String(targetTeams).toLowerCase().replace(/\+/g, ' ').trim();
  } catch (e) {}

  if (!targetTeams || targetTeams === "vs") {
      return res.status(200).json({ success: false, error: "No target teams received." });
  }

  const teamAliases = {
    "chennai": ["csk", "chennai"], "csk": ["csk", "chennai"],
    "delhi": ["dc", "delhi"], "dc": ["dc", "delhi"],
    "gujarat": ["gt", "gujarat"], "gt": ["gt", "gujarat"],
    "kolkata": ["kkr", "kolkata"], "kkr": ["kkr", "kolkata"],
    "lucknow": ["lsg", "lucknow"], "lsg": ["lsg", "lucknow"],
    "mumbai": ["mi", "mumbai"], "mi": ["mi", "mumbai"],
    "punjab": ["pbks", "punjab", "kings"], "pbks": ["pbks", "punjab", "kings"],
    "rajasthan": ["rr", "rajasthan"], "rr": ["rr", "rajasthan"],
    "royal": ["rcb", "royal", "bengaluru", "bangalore"], "rcb": ["rcb", "royal", "bengaluru", "bangalore"],
    "sunrisers": ["srh", "sunrisers", "hyderabad"], "srh": ["srh", "sunrisers", "hyderabad"]
  };

  try {
    const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' };
    
    let team1 = targetTeams.split(' vs ')[0]?.trim().split(' ')[0] || "";
    let team2 = targetTeams.split(' vs ')[1]?.trim().split(' ')[0] || "";
    const t1A = teamAliases[team1] || [team1];
    const t2A = teamAliases[team2] || [team2];

    const pagesToScan = [
        'https://www.cricbuzz.com/cricket-series/9241/indian-premier-league-2026/matches',
        'https://www.cricbuzz.com/cricket-match/live-scores/recent-matches'
    ];

    let activeMatchUrl = null;
    for (const url of pagesToScan) {
        if (activeMatchUrl) break;
        const { data } = await axios.get(url, { headers });
        const $p = cheerio.load(data);
        $p('a').each((i, el) => {
            const href = $p(el).attr('href') || "";
            const text = ($p(el).text() + " " + href).toLowerCase();
            if (href.includes('cricket-scores') || href.includes('live-cricket')) {
                if (t1A.some(a => text.includes(a)) && t2A.some(a => text.includes(a))) {
                    activeMatchUrl = href.startsWith('http') ? href : 'https://www.cricbuzz.com' + href;
                    return false;
                }
            }
        });
    }

    if (!activeMatchUrl) throw new Error("Match ID not found in Matrix.");

    // FORCE REDIRECT TO SCORECARD PAGE FOR REAL DATA
    let finalUrl = activeMatchUrl.replace('/cricket-scores/', '/live-cricket-scorecard/');
    if (!finalUrl.includes('scorecard')) finalUrl = finalUrl.replace('/live-cricket-scores/', '/live-cricket-scorecard/');

    const { data: matchHtml } = await axios.get(finalUrl, { headers });
    const $m = cheerio.load(matchHtml);

    // Precise Data Extraction
    let status = $m('.cb-text-complete, .cb-status-msg, .cb-text-live, .cb-text-preview').first().text().trim() || "Status Unknown";
    let score = $m('.cb-min-bat-rw').text().trim() || $m('.cb-font-20').first().text().trim();
    
    let isComplete = status.toLowerCase().includes('won by') || status.toLowerCase().includes('result') || $m('.cb-text-complete').length > 0;
    
    if (!score && isComplete) score = "Match Ended";
    if (!score) score = "Pre-Match Intel";

    let bowler = "Toss Pending";
    if (score !== "Pre-Match Intel" && !isComplete) {
        bowler = $m('.cb-min-bwl-rw').first().text().trim() || "Active Play";
    } else if (isComplete) {
        bowler = "Match Concluded";
    }

    let balls = [];
    $m('.cb-col-10.cb-font-12, .cb-ovr-bl').each((i, el) => { if(i < 6) balls.push($m(el).text().trim()); });

    return res.status(200).json({
      success: true,
      match_info: {
        title: isComplete ? "MISSION ACCOMPLISHED" : "IPCT TARGET LOCKED",
        live_score: score,
        status: status,
        bowler: bowler,
        last_balls: isComplete ? ["E", "N", "D"] : balls,
        prediction: isComplete ? "Mission Accomplished" : (score === "Pre-Match Intel" ? "Waiting for Toss" : "Calculating Momentum...")
      }
    });

  } catch (error) {
    res.status(200).json({ success: false, error: error.message });
  }
};
