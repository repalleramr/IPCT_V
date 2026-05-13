const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

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

    // SCAN BOTH LIVE AND RECENT PAGES
    const scanPages = [
        'https://www.cricbuzz.com/cricket-match/live-scores',
        'https://www.cricbuzz.com/cricket-match/live-scores/recent-matches'
    ];

    let matchUrl = null;
    for (const page of scanPages) {
        const { data: pageData } = await axios.get(page, { headers });
        const $p = cheerio.load(pageData);
        $p('a').each((i, el) => {
            const href = $p(el).attr('href') || "";
            const text = ($p(el).text() + " " + href).toLowerCase();
            if ((href.includes('scores') || href.includes('match')) && t1A.some(a => text.includes(a)) && t2A.some(a => text.includes(a))) {
                matchUrl = href.startsWith('http') ? href : 'https://www.cricbuzz.com' + href;
                return false;
            }
        });
        if (matchUrl) break;
    }

    if (!matchUrl) throw new Error(`Target ${t1} vs ${t2} not found in current matrix.`);

    const { data: mHtml } = await axios.get(matchUrl, { headers });
    const $m = cheerio.load(mHtml);

    // UNIVERSAL SELECTORS (Handles both new and old layouts)
    let status = $m('.cb-text-complete, .cb-status-msg, .cb-text-live, .cb-text-preview').first().text().trim();
    let score = $m('.cb-min-bat-rw, .cb-font-20, .cb-ovr-flo').first().text().trim();
    
    // Check if match is actually over
    let isComplete = status.toLowerCase().includes('won') || status.toLowerCase().includes('result') || status.toLowerCase().includes('beat');
    
    // BALL HISTORY HUNTER (Real data extraction)
    let balls = [];
    $m('.cb-col-10.cb-font-12, .cb-ovr-bl, .cb-col-8.cb-mtch-blt').each((i, el) => {
        let b = $m(el).text().trim();
        if (b && b.length <= 2) balls.push(b);
    });

    // Prediction Engine
    let prediction = "Waiting for Toss";
    if (isComplete) {
        prediction = "Mission Accomplished: Match Secured.";
        score = score || "Final Result Reached";
        balls = ["E", "N", "D"];
    } else if (score && score !== "") {
        prediction = "Tracking Active Momentum...";
    }

    return res.status(200).json({
      success: true,
      match_info: {
        title: isComplete ? "MISSION ACCOMPLISHED" : "IPCT TARGET LOCKED",
        live_score: score || "Pre-Match Intel",
        status: status || "Uplink Established",
        bowler: isComplete ? "Mission Over" : ($m('.cb-min-bwl-rw').first().text().trim() || "Active Play"),
        last_balls: balls.length > 0 ? balls.slice(0, 6) : ["-","-","-","-","-","-"],
        prediction: prediction
      }
    });
  } catch (err) {
    res.status(200).json({ success: false, error: err.message });
  }
};
