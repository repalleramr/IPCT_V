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
        source: "crex-live-engine",
        source_url: null
  };

  try {
    const headers = { 
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
    };

    // ==============================================================
    // STEP 1: INFILTRATE THE CREX MASTER SERIES PAGE
    // ==============================================================
    const seriesUrl = 'https://crex.com/series/indian-premier-league-2026-1PW/matches';
    const { data: listData } = await axios.get(seriesUrl, { headers, timeout: 8000 });
    const $list = cheerio.load(listData);
    
    let matchUrl = null;

    // Scan all links on the CREX series page
    $list('a').each((i, el) => {
        const href = $list(el).attr('href') || "";
        const text = ($list(el).text() + " " + href).toLowerCase();
        
        if (href.includes('cricket-live-score') || href.includes('match-details')) {
            if (t1A.some(a => text.includes(a)) && t2A.some(a => text.includes(a))) {
                matchUrl = href.startsWith('http') ? href : 'https://crex.com' + href;
                return false; // Break loop once found
            }
        }
    });

    if (!matchUrl) throw new Error(`Target ${t1} vs ${t2} not found on CREX.`);
    payload.source_url = matchUrl;

    // ==============================================================
    // STEP 2: RIP THE CREX MATCH PAGE
    // ==============================================================
    const { data: matchData } = await axios.get(matchUrl, { headers, timeout: 8000 });
    const $m = cheerio.load(matchData);

    let pageText = $m('body').text();
    let pageTitle = $m('title').text() || "";

    // 1. EXTRACT FROM NEXT.JS INTERNAL JSON (If available)
    let nextDataBlock = $m('#__NEXT_DATA__').html();
    if (nextDataBlock) {
        try {
            let nextJson = JSON.parse(nextDataBlock);
            // CREX stores massive amounts of data in their Next.js props. 
            // We can stringify it and regex the exact values we need.
            let stringified = JSON.stringify(nextJson);
            
            let venueMatch = stringified.match(/"venueName":"(.*?)"/);
            if (venueMatch) payload.venue = venueMatch[1];

            let tossMatch = stringified.match(/"tossText":"(.*?)"/);
            if (tossMatch) payload.toss = tossMatch[1];
            
            let statusMatch = stringified.match(/"statusText":"(.*?)"/);
            if (statusMatch) payload.status = statusMatch[1];

        } catch (e) { console.log("Next JSON parsing skipped."); }
    }

    // 2. FALLBACK AGGRESSIVE DOM EXTRACTION (If JSON is encrypted)
    
    // Status Failsafe
    if (!payload.status) {
        let titleSplit = pageTitle.split('|')[0].trim();
        if (titleSplit.toLowerCase().includes('won') || titleSplit.toLowerCase().includes('result')) {
            payload.status = titleSplit;
        }
    }

    // Deep Hunt for Venue & Toss
    $m('div, span, p').each((i, el) => {
        let txt = $m(el).text().trim();
        if (!payload.venue && txt.includes('Venue')) {
            let v = txt.split('Venue')[1]?.split(',')[0]?.replace(':', '').trim();
            if (v && v.length > 3) payload.venue = v;
        }
        if (!payload.toss && txt.includes('Toss')) {
            let t = txt.split('Toss')[1]?.split(/(?=Time|Venue)/)[0]?.replace(':', '').trim();
            if (t && t.length > 3) payload.toss = t;
        }
    });

    // Extract Score
    let rawScore = $m('.live-score, .score, h1, h2').text().match(/([A-Z-]+\s*\d+\/\d+\s*\([\d\.]+\))/g);
    if (rawScore && rawScore.length > 0) {
        payload.live_score = rawScore.join(' v ');
    } else {
        // Rip from Title Tab (CREX puts the score right in the tab name)
        let titleScore = pageTitle.split('|')[0].replace('Live Cricket Score', '').trim();
        if (titleScore.match(/\d+\/\d+/)) payload.live_score = titleScore;
    }

    // Extract Run Rates & Target
    let crrMatch = pageText.match(/CRR[:\s]*([\d\.]+)/);
    let rrrMatch = pageText.match(/REQ[:\s]*([\d\.]+)/);
    let tgtMatch = pageText.match(/Target[:\s]*(\d+)/i);
    if (crrMatch) payload.current_rr = crrMatch[1];
    if (rrrMatch) payload.required_rr = rrrMatch[1];
    if (tgtMatch) payload.target = tgtMatch[1];

    // Build the Radar
    let balls = [];
    let ballMatches = pageText.match(/\b(W|0|1|2|3|4|5|6)\b/g); 
    if (ballMatches && ballMatches.length > 10) {
        // Grab the last 6 reasonable cricket ball events found
        balls = ballMatches.slice(-6);
        payload.last_over = balls;
        payload.last_ball = balls[balls.length - 1];
    }

    // ==============================================================
    // STEP 3: MATCH STATE ENGINE
    // ==============================================================
    let lowerStatus = (payload.status || "").toLowerCase();
    let lowerTitle = pageTitle.toLowerCase();
    let isCompleted = lowerStatus.includes('won') || lowerTitle.includes('won by');

    if (lowerStatus.includes('abandoned')) {
        payload.match_state = "abandoned"; payload.title = "MISSION ABORTED";
    } else if (lowerStatus.includes('delay') || lowerStatus.includes('rain')) {
        payload.match_state = "delay"; payload.title = "WEATHER PROTOCOL";
    } else if (isCompleted) {
        payload.match_state = "completed"; 
        payload.title = "MISSION ACCOMPLISHED";
        payload.result = payload.status; 
        payload.last_over = ["E", "N", "D"];
        payload.striker = null; payload.bowler = "Mission Concluded";
    } else if (lowerStatus.includes('toss')) {
        payload.match_state = "pre-match"; 
        if (!payload.toss) payload.toss = payload.status;
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
    if (!payload.venue) payload.venue = "Location Secure";
    if (!payload.toss) payload.toss = "Awaiting Coin Drop";
    if (!payload.status) payload.status = "Uplink Established";

    return res.status(200).json({ success: true, match_info: payload });

  } catch (err) {
    return res.status(200).json({ success: false, error: err.message });
  }
};
