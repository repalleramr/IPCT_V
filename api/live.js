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

  // Expanding Aliases to catch all naming variations
  const teamAliases = {
    "chennai": ["csk", "chennai"], "delhi": ["dc", "delhi"],
    "gujarat": ["gt", "gujarat"], "kolkata": ["kkr", "kolkata"],
    "lucknow": ["lsg", "lucknow"], "mumbai": ["mi", "mumbai"],
    "punjab": ["pbks", "punjab", "kings"], "rajasthan": ["rr", "rajasthan"],
    "royal": ["rcb", "bengaluru", "bangalore"], "sunrisers": ["srh", "hyderabad", "sunrisers"]
  };

  let t1 = targetTeams.split(' vs ')[0]?.trim().split(' ')[0] || "";
  let t2 = targetTeams.split(' vs ')[1]?.trim().split(' ')[0] || "";
  const t1A = teamAliases[t1] || [t1];
  const t2A = teamAliases[t2] || [t2];

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
        source: "mi6-deep-archive",
        source_url: null
  };

  try {
    const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };
    
    // NODE 1: ESPNCricinfo (Failsafe for Status)
    try {
        const { data: xmlData } = await axios.get('https://www.espncricinfo.com/rss/livescores.xml', { timeout: 3000 });
        const $xml = cheerio.load(xmlData, { xmlMode: true });
        $xml('item').each((i, el) => {
            const title = $xml(el).find('title').text().toLowerCase();
            if (t1A.some(a => title.includes(a)) && t2A.some(a => title.includes(a))) {
                let desc = $xml(el).find('description').text().trim();
                if (desc) payload.status = desc;
                return false; 
            }
        });
    } catch(e) {}

    // NODE 2: Cricbuzz Deep Archive & Live Scraper
    // We now scan the MASTER series page so older matches are never lost.
    const scanPages = [
        'https://www.cricbuzz.com/cricket-match/live-scores',
        'https://www.cricbuzz.com/cricket-match/live-scores/recent-matches',
        'https://www.cricbuzz.com/cricket-series/9241/indian-premier-league-2026/matches'
    ];

    let matchUrl = null;
    for (const page of scanPages) {
        try {
            const { data: pageData } = await axios.get(page, { headers });
            const $p = cheerio.load(pageData);
            $p('a').each((i, el) => {
                const href = $p(el).attr('href') || "";
                const text = ($p(el).text() + " " + href).toLowerCase();
                if ((href.includes('/live-cricket-scores/') || href.includes('/cricket-scores/')) && !href.includes('news')) {
                    if (t1A.some(a => text.includes(a)) && t2A.some(a => text.includes(a))) {
                        matchUrl = href.startsWith('http') ? href : 'https://www.cricbuzz.com' + href;
                        return false; // Break loop
                    }
                }
            });
            if (matchUrl) break; // Break page array loop
        } catch(e) {}
    }

    if (!matchUrl) throw new Error(`Target ${t1} vs ${t2} not found in Archive.`);

    // If it's an old match, force it to the scorecard view to ensure data exists.
    let stableUrl = matchUrl.replace('/live-cricket-scores/', '/cricket-scores/');
    payload.source_url = stableUrl;

    const { data: mHtml } = await axios.get(stableUrl, { headers });
    const $m = cheerio.load(mHtml);

    // DEEP DATA EXTRACTION
    let pageTitle = $m('title').text() || "";
    
    // Status (Won by, Delayed, etc)
    let cbStatus = $m('.cb-text-complete').first().text().trim() || $m('.cb-status-msg').first().text().trim() || $m('.cb-text-live').first().text().trim();
    if (cbStatus) payload.status = cbStatus;

    // Score extraction (Universal selector for Live and Scorecard views)
    let scoreHeader = $m('.cb-nav-hdr.cb-font-18.line-ht24').first().text().trim();
    let liveScoreBox = $m('.cb-font-20.text-bold').first().text().trim() || $m('.cb-min-bat-rw').first().text().trim();
    
    if (scoreHeader && scoreHeader.match(/\d+\/\d+/)) {
        payload.live_score = scoreHeader.split('-')[0].trim(); // Formats "GT 180/4 - Innings Break" properly
    } else if (liveScoreBox) {
        payload.live_score = liveScoreBox;
    } else {
        // Ultimate fallback: Strip score from Title tag
        let titleScore = pageTitle.split(',')[0].trim();
        if (titleScore.match(/\d+\/\d+/)) payload.live_score = titleScore;
    }

    // Run Rates & Target
    let rrText = $m('.cb-font-12.cb-text-gray').text() || "";
    let crrMatch = rrText.match(/CRR:\s*([\d\.]+)/);
    let rrrMatch = rrText.match(/REQ:\s*([\d\.]+)/);
    if (crrMatch) payload.current_rr = crrMatch[1];
    if (rrrMatch) payload.required_rr = rrrMatch[1];

    let tgtMatch = $m('.cb-min-stts').text().match(/Target:\s*(\d+)/i);
    if (tgtMatch) payload.target = tgtMatch[1];

    // Live Players
    let batLinks = $m('.cb-min-inf.cb-min-bat-rw .cb-text-link');
    if (batLinks.length > 0) payload.striker = $m(batLinks[0]).text().trim();
    if (batLinks.length > 1) payload.non_striker = $m(batLinks[1]).text().trim();
    payload.bowler = $m('.cb-min-bwl-rw .cb-text-link').first().text().trim() || null;

    payload.venue = $m('.cb-nav-subhdr').text().replace('Match Info', '').trim() || null;

    // Radar
    let balls = [];
    $m('.cb-col-10.cb-font-12, .cb-ovr-bl').each((i, el) => {
        let b = $m(el).text().trim(); if (b.length <= 3) balls.push(b);
    });
    if (balls.length > 0) {
        payload.last_over = balls.slice(0, 6);
        payload.last_ball = payload.last_over[payload.last_over.length - 1];
    }

    // ==========================================
    // MATCH STATE CALCULATION ENGINE
    // ==========================================
    let lowerStatus = (payload.status || "").toLowerCase();
    let lowerTitle = pageTitle.toLowerCase();

    let isCompleted = lowerStatus.includes('won') || lowerStatus.includes('result') || lowerStatus.includes('tied') || lowerTitle.includes('won by');

    if (lowerStatus.includes('abandoned')) {
        payload.match_state = "abandoned"; 
        payload.title = "MISSION ABORTED";
    } else if (lowerStatus.includes('delay') || lowerStatus.includes('rain') || lowerStatus.includes('stumps')) {
        payload.match_state = "delay"; 
        payload.title = "WEATHER PROTOCOL";
    } else if (isCompleted) {
        payload.match_state = "completed"; 
        payload.title = "MISSION ACCOMPLISHED";
        payload.result = payload.status; 
        payload.last_over = ["E", "N", "D"];
        payload.striker = null; payload.bowler = "Mission Concluded";
        if (!payload.status) payload.status = "Match Completed";
    } else if (lowerStatus.includes('toss')) {
        payload.match_state = "pre-match"; 
        payload.toss = payload.status;
        payload.live_score = "Pre-Match Intel";
    } else if (payload.live_score && payload.live_score.match(/\d+/)) {
        payload.match_state = "live";
        payload.prediction = "Active Tracking...";
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

    if (!payload.live_score) payload.live_score = "Intel Processing...";

    return res.status(200).json({ success: true, match_info: payload });

  } catch (err) {
    return res.status(200).json({ success: false, error: err.message });
  }
};
