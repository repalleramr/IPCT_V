const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // 1. IMPROVED TEAM CAPTURE
  let query = req.query.teams || "";
  if (!query && req.url.includes('teams=')) {
      query = decodeURIComponent(req.url.split('teams=')[1].split('&')[0]);
  }
  let targetTeams = query.toLowerCase().replace(/\+/g, ' ').trim();

  if (!targetTeams || targetTeams === "vs") {
      return res.status(200).json({ success: false, error: "Satellite waiting for target teams..." });
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
    const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };
    let t1 = targetTeams.split(' vs ')[0]?.trim().split(' ')[0] || "";
    let t2 = targetTeams.split(' vs ')[1]?.trim().split(' ')[0] || "";
    const t1A = teamAliases[t1] || [t1];
    const t2A = teamAliases[t2] || [t2];

    const { data } = await axios.get('https://www.cricbuzz.com/cricket-match/live-scores/recent-matches', { headers });
    const $ = cheerio.load(data);
    let matchUrl = null;

    $('a').each((i, el) => {
        const href = $(el).attr('href') || "";
        const text = ($(el).text() + " " + href).toLowerCase();
        if ((href.includes('scores') || href.includes('match')) && t1A.some(a => text.includes(a)) && t2A.some(a => text.includes(a))) {
            matchUrl = href.startsWith('http') ? href : 'https://www.cricbuzz.com' + href;
            return false;
        }
    });

    if (!matchUrl) throw new Error(`Target ${t1} vs ${t2} not in Matrix.`);

    const { data: mHtml } = await axios.get(matchUrl, { headers });
    const $m = cheerio.load(mHtml);
    let status = $m('.cb-text-complete, .cb-status-msg, .cb-text-live').first().text().trim() || "Live Telemetry Active";
    let score = $m('.cb-min-bat-rw').text().trim() || $m('.cb-font-20').first().text().trim();
    let isComplete = status.toLowerCase().includes('won') || status.toLowerCase().includes('result') || $m('.cb-text-complete').length > 0;

    return res.status(200).json({
      success: true,
      match_info: {
        title: isComplete ? "MISSION ACCOMPLISHED" : "IPCT TARGET LOCKED",
        live_score: score || (isComplete ? "Match Ended" : "Pre-Match Intel"),
        status: status,
        bowler: isComplete ? "Mission Over" : "Active Play",
        last_balls: isComplete ? ["E","N","D"] : ["1","0","W","4","0","1"],
        prediction: isComplete ? "Secured" : "Tracking..."
      }
    });
  } catch (err) {
    res.status(200).json({ success: false, error: err.message });
  }
};
