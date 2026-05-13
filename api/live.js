const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  let targetTeams = (req.query.teams || "").toLowerCase().trim();
  let rawDateStr = req.query.time || ""; 

  if (!targetTeams) return res.status(200).json({ success: false, error: "Awaiting Target Intel..." });

  const teamAliases = {
    "chennai": ["csk", "chennai"], "delhi": ["dc", "delhi"],
    "gujarat": ["gt", "gujarat"], "kolkata": ["kkr", "kolkata"],
    "lucknow": ["lsg", "lucknow"], "mumbai": ["mi", "mumbai"],
    "punjab": ["pbks", "punjab"], "rajasthan": ["rr", "rajasthan"],
    "royal": ["rcb", "bengaluru", "bangalore"], "sunrisers": ["srh", "hyderabad"]
  };

  let t1 = targetTeams.split(' vs ')[0]?.trim().split(' ')[0] || "";
  let t2 = targetTeams.split(' vs ')[1]?.trim().split(' ')[0] || "";
  const t1A = teamAliases[t1] || [t1];
  const t2A = teamAliases[t2] || [t2];

  // STRICT JSON PAYLOAD FORMAT
  let payload = {
        title: "IPL LIVE INTEL",
        status: "Intel Gathering...",
        match_state: "standby",
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
        last_over: ["-", "-", "-", "-", "-", "-"],
        prediction: "Tracking...",
        countdown: null,
        source: "mi6-multi-node",
        source_url: null
  };

  try {
    const headers = { 'User-Agent': 'Mozilla/5.0' };
    
    // NODE 1: ESPNCricinfo (For highly accurate match status & basic score)
    try {
        const { data: xmlData } = await axios.get('https://www.espncricinfo.com/rss/livescores.xml', { timeout: 3000 });
        const $xml = cheerio.load(xmlData, { xmlMode: true });
        $xml('item').each((i, el) => {
            const title = $xml(el).find('title').text().toLowerCase();
            if (t1A.some(a => title.includes(a)) && t2A.some(a => title.includes(a))) {
                let scoreMatch = $xml(el).find('title').text().split(' vs ')[0].trim();
                if (scoreMatch.match(/\d+\/\d+/)) payload.live_score = scoreMatch;
                payload.status = $xml(el).find('description').text().trim();
                return false; 
            }
        });
    } catch(e) {}

    // NODE 2: Cricbuzz (For deep stats: RR, Radar, Strikers, Venue)
    try {
        const { data: pageData } = await axios.get('https://www.cricbuzz.com/cricket-match/live-scores', { headers });
        const $p = cheerio.load(pageData);
        let matchUrl = null;
        $p('a').each((i, el) => {
            const href = $p(el).attr('href') || "";
            const text = ($p(el).text() + " " + href).toLowerCase();
            if (href.includes('/live-cricket-scores/') && t1A.some(a => text.includes(a)) && t2A.some(a => text.includes(a))) {
                matchUrl = 'https://www.cricbuzz.com' + href; return false;
            }
        });

        if (matchUrl) {
            payload.source_url = matchUrl;
            const { data: mHtml } = await axios.get(matchUrl, { headers });
            const $m = cheerio.load(mHtml);

            let cbStatus = $m('.cb-text-complete, .cb-text-live, .cb-status-msg').first().text().trim();
            if (cbStatus) payload.status = cbStatus;

            let crrMatch = $m('.cb-font-12.cb-text-gray').text().match(/CRR:\s*([\d\.]+)/);
            let rrrMatch = $m('.cb-font-12.cb-text-gray').text().match(/REQ:\s*([\d\.]+)/);
            if (crrMatch) payload.current_rr = crrMatch[1];
            if (rrrMatch) payload.required_rr = rrrMatch[1];

            let tgtMatch = $m('.cb-min-stts').text().match(/Target:\s*(\d+)/i);
            if (tgtMatch) payload.target = tgtMatch[1];

            // Deep Players Extraction
            let batLinks = $m('.cb-min-inf.cb-min-bat-rw .cb-text-link');
            if (batLinks.length > 0) payload.striker = $m(batLinks[0]).text().trim();
            if (batLinks.length > 1) payload.non_striker = $m(batLinks[1]).text().trim();
            payload.bowler = $m('.cb-min-bwl-rw .cb-text-link').first().text().trim();

            payload.venue = $m('.cb-nav-subhdr').text().replace('Match Info', '').trim() || null;

            let balls = [];
            $m('.cb-col-10.cb-font-12, .cb-ovr-bl').each((i, el) => {
                let b = $m(el).text().trim(); if (b.length <= 3) balls.push(b);
            });
            if (balls.length > 0) {
                payload.last_over = balls.slice(0, 6);
                payload.last_ball = payload.last_over[payload.last_over.length - 1];
            }
        }
    } catch(e) {}

    // ==========================================
    // MATCH STATE CALCULATION ENGINE
    // ==========================================
    let lowerStatus = (payload.status || "").toLowerCase();

    if (lowerStatus.includes('abandoned')) {
        payload.match_state = "abandoned"; payload.title = "MISSION ABORTED";
    } else if (lowerStatus.includes('delay') || lowerStatus.includes('rain')) {
        payload.match_state = "delay"; payload.title = "WEATHER DELAY PROTOCOL";
    } else if (lowerStatus.includes('won') || lowerStatus.includes('result') || lowerStatus.includes('tied')) {
        payload.match_state = "completed"; payload.title = "MISSION ACCOMPLISHED";
        payload.result = payload.status; payload.last_over = ["E", "N", "D"];
    } else if (lowerStatus.includes('toss')) {
        payload.match_state = "pre-match"; payload.toss = payload.status;
    } else if (payload.live_score && payload.live_score.match(/\d+/)) {
        payload.match_state = "live";
    }

    // Countdown Timer Engine
    if (rawDateStr && (payload.match_state === "standby" || payload.match_state === "pre-match" || payload.match_state === "delay")) {
        try {
            let monthStr = rawDateStr.split(' ')[0]; let dayStr = rawDateStr.split(' ')[1];
            let timeStr = rawDateStr.match(/\((.*?)\)/)[1]; let isPM = timeStr.includes("PM");
            let hours = parseInt(timeStr.split(':')[0]) + (isPM && timeStr.split(':')[0] !== '12' ? 12 : 0);
            let mins = parseInt(timeStr.split(':')[1].replace(/[a-zA-Z\s]/g, ''));
            
            let targetDate = new Date(`2026-${monthStr}-${dayStr} ${hours}:${mins}:00`);
            let now = new Date(); 
            // Correct timezone offset for Indian Standard Time vs UTC
            targetDate.setHours(targetDate.getHours() - 5); targetDate.setMinutes(targetDate.getMinutes() - 30); 

            let diffMs = targetDate - now;
            if (diffMs > 0 && diffMs < 86400000) { 
                let hrs = Math.floor((diffMs % 86400000) / 3600000);
                let m = Math.round(((diffMs % 86400000) % 3600000) / 60000);
                payload.countdown = `T-MINUS ${hrs}h ${m}m TO OPERATION`;
                payload.match_state = "countdown";
            }
        } catch(e) {}
    }

    // Failsafes
    if (!payload.live_score) payload.live_score = "Pre-Match Intel";
    if (payload.match_state === "live") payload.prediction = "Active Tracking...";

    return res.status(200).json({ success: true, match_info: payload });

  } catch (err) {
    return res.status(200).json({ success: false, error: err.message });
  }
};
