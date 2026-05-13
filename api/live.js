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
            if ((href.includes('/live-cricket-scores/') || href.includes('/cricket-scores/')) && !href.includes('news')) {
                if (t1A.some(a => text.includes(a)) && t2A.some(a => text.includes(a))) {
                    matchUrl = href.startsWith('http') ? href : 'https://www.cricbuzz.com' + href;
                    return false;
                }
            }
        });
        if (matchUrl) break;
    }

    if (!matchUrl) throw new Error(`Target ${t1} vs ${t2} not found in matrix.`);

    const { data: mHtml } = await axios.get(matchUrl, { headers });
    const $m = cheerio.load(mHtml);

    // DEEP INTEL EXTRACTION (Mapping to your CREX-style JSON)
    let payload = {
        title: "IPL LIVE INTEL",
        status: null,
        match_state: "live",
        live_score: null,
        overs: null,
        target: null,
        required_rr: null,
        current_rr: null,
        striker: null,
        non_striker: null,
        bowler: null,
        toss: null,
        result: null,
        venue: null,
        last_ball: null,
        last_over: [],
        prediction: "Tracking...",
        source: "mi6-core-scraper",
        source_url: matchUrl
    };

    // 1. Status & Result
    payload.status = $m('.cb-text-complete, .cb-text-live, .cb-status-msg').first().text().trim();
    if (payload.status.toLowerCase().includes('won') || payload.status.toLowerCase().includes('result')) {
        payload.match_state = "complete";
        payload.result = payload.status;
        payload.title = "MISSION ACCOMPLISHED";
    } else if (payload.status.toLowerCase().includes('delay') || payload.status.toLowerCase().includes('rain') || payload.status.toLowerCase().includes('stumps')) {
        payload.match_state = "delay";
    } else if (payload.status.toLowerCase().includes('toss')) {
        payload.match_state = "pre-match";
        payload.toss = payload.status;
    }

    // 2. Scores & Overs
    let rawScore = $m('.cb-min-bat-rw').first().text().trim() || $m('.ui-bat-team-scores').first().text().trim();
    if (rawScore) {
        // Example: "RCB 180/4 (17.2)"
        let scoreMatch = rawScore.match(/(.*?)\s*(\d+\/\d+|\d+)\s*\((.*?)\)/);
        if (scoreMatch) {
            payload.live_score = scoreMatch[1].trim() + " " + scoreMatch[2].trim();
            payload.overs = scoreMatch[3].replace('ov', '').trim();
        } else {
            payload.live_score = rawScore;
        }
    }

    // 3. Run Rates & Target
    let rrText = $m('.cb-font-12.cb-text-gray').text() || "";
    let crrMatch = rrText.match(/CRR:\s*([\d\.]+)/);
    let rrrMatch = rrText.match(/REQ:\s*([\d\.]+)/);
    if (crrMatch) payload.current_rr = crrMatch[1];
    if (rrrMatch) payload.required_rr = rrrMatch[1];
    
    let targetText = $m('.cb-min-stts').text() || "";
    let tgtMatch = targetText.match(/Target:\s*(\d+)/i);
    if (tgtMatch) payload.target = tgtMatch[1];

    // 4. Players
    let batRows = $m('.cb-min-inf.cb-min-bat-rw').find('.cb-text-link');
    if (batRows.length > 0) payload.striker = $m(batRows[0]).text().trim();
    if (batRows.length > 1) payload.non_striker = $m(batRows[1]).text().trim();
    payload.bowler = $m('.cb-min-bwl-rw').find('.cb-text-link').first().text().trim() || null;

    // 5. Radar (Last Over)
    $m('.cb-col-10.cb-font-12, .cb-ovr-bl, .cb-col-8.cb-mtch-blt').each((i, el) => {
        let b = $m(el).text().trim();
        if (b && b.length <= 3) payload.last_over.push(b);
    });
    if (payload.last_over.length > 0) {
        payload.last_over = payload.last_over.slice(0, 6);
        payload.last_ball = payload.last_over[payload.last_over.length - 1];
    } else if (payload.match_state === "complete") {
        payload.last_over = ["E", "N", "D"];
    } else {
        payload.last_over = ["-", "-", "-", "-", "-", "-"];
    }

    // 6. Venue
    payload.venue = $m('.cb-nav-subhdr').text().replace('Match Info', '').trim() || null;

    // Clean up Nulls
    if (!payload.live_score && payload.match_state === "complete") payload.live_score = "Match Ended";
    if (!payload.live_score) payload.live_score = "Pre-Match Intel";

    return res.status(200).json({
      success: true,
      match_info: payload
    });

  } catch (err) {
    return res.status(200).json({ success: false, error: err.message });
  }
};
