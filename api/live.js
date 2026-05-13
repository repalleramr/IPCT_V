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
        source: "mi6-multi-probe-aggregator",
        source_url: null
  };

  try {
    const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };
    
    // ==============================================================
    // PROBE 1: FIND THE TARGET ACROSS MULTIPLE DIRECTORIES
    // ==============================================================
    const directories = [
        'https://www.cricbuzz.com/cricket-match/live-scores',
        'https://www.cricbuzz.com/cricket-match/live-scores/recent-matches',
        'https://www.cricbuzz.com/cricket-series/9241/indian-premier-league-2026/matches'
    ];

    let baseMatchUrl = null;
    for (const dir of directories) {
        try {
            const { data: dirData } = await axios.get(dir, { headers });
            const $d = cheerio.load(dirData);
            $d('a').each((i, el) => {
                const href = $d(el).attr('href') || "";
                const text = ($d(el).text() + " " + href).toLowerCase();
                if ((href.includes('/live-cricket-scores/') || href.includes('/cricket-scores/')) && !href.includes('news')) {
                    if (t1A.some(a => text.includes(a)) && t2A.some(a => text.includes(a))) {
                        baseMatchUrl = href.startsWith('http') ? href : 'https://www.cricbuzz.com' + href;
                        return false; 
                    }
                }
            });
            if (baseMatchUrl) break; 
        } catch(e) {}
    }

    if (!baseMatchUrl) throw new Error(`Target ${t1} vs ${t2} completely missing from global matrix.`);
    
    payload.source_url = baseMatchUrl;

    // ==============================================================
    // PROBE 2: FIRE PARALLEL REQUESTS TO ALL MATCH SUB-PAGES
    // (Live View, Scorecard View, and Match Facts View)
    // ==============================================================
    let liveUrl = baseMatchUrl.replace('/cricket-scores/', '/live-cricket-scores/');
    let scorecardUrl = baseMatchUrl.replace('/live-cricket-scores/', '/live-cricket-scorecard/').replace('/cricket-scores/', '/live-cricket-scorecard/');
    let factsUrl = baseMatchUrl.replace('/live-cricket-scores/', '/cricket-match-facts/').replace('/cricket-scores/', '/cricket-match-facts/');

    // Fetch them all at the exact same time so the server doesn't lag
    const [liveRes, scoreRes, factsRes] = await Promise.allSettled([
        axios.get(liveUrl, { headers }),
        axios.get(scorecardUrl, { headers }),
        axios.get(factsUrl, { headers })
    ]);

    // ==============================================================
    // PROBE 3: THE MERGER (Stitch data from wherever it successfully landed)
    // ==============================================================
    
    // --- 3A: Extract from Match Facts (Best for Venue & Toss) ---
    if (factsRes.status === 'fulfilled') {
        const $f = cheerio.load(factsRes.value.data);
        $f('.cb-col.cb-col-100, .cb-font-14').each((i, el) => {
            let txt = $f(el).text().trim();
            if (!payload.venue && txt.includes('Venue:')) {
                payload.venue = txt.split('Venue:')[1].split(',')[0].trim();
            }
            if (!payload.toss && txt.includes('Toss:')) {
                payload.toss = txt.split('Toss:')[1].split(/(?=Time|Venue)/)[0].trim();
            }
        });
    }

    // --- 3B: Extract from Scorecard (Best for Final Status & Result) ---
    if (scoreRes.status === 'fulfilled') {
        const $s = cheerio.load(scoreRes.value.data);
        let scStatus = $s('.cb-text-complete').first().text().trim() || $s('.cb-status-msg').first().text().trim();
        if (scStatus) payload.status = scStatus;
        
        let scTitle = $s('title').text() || "";
        if (scTitle.toLowerCase().includes('won by') && !payload.status) {
            payload.status = scTitle.split(',')[0].trim();
        }
    }

    // --- 3C: Extract from Live Page (Best for Radar, Score, Strikers) ---
    if (liveRes.status === 'fulfilled') {
        const $l = cheerio.load(liveRes.value.data);
        
        if (!payload.status) payload.status = $l('.cb-text-live, .cb-status-msg').first().text().trim();
        
        // Universal Score Scraper
        let liveScoreBox = $l('.cb-min-bat-rw').first().text().trim() || $l('.cb-font-20.text-bold').first().text().trim() || $l('.cb-nav-hdr.cb-font-18').first().text().split('-')[0].trim();
        if (liveScoreBox) payload.live_score = liveScoreBox;

        // Run Rates
        let rrText = $l('.cb-font-12.cb-text-gray').text() || "";
        let crrMatch = rrText.match(/CRR:\s*([\d\.]+)/);
        let rrrMatch = rrText.match(/REQ:\s*([\d\.]+)/);
        if (crrMatch) payload.current_rr = crrMatch[1];
        if (rrrMatch) payload.required_rr = rrrMatch[1];
        let tgtMatch = $l('.cb-min-stts').text().match(/Target:\s*(\d+)/i);
        if (tgtMatch) payload.target = tgtMatch[1];

        // Players
        let batLinks = $l('.cb-min-inf.cb-min-bat-rw .cb-text-link');
        if (batLinks.length > 0) payload.striker = $l(batLinks[0]).text().trim();
        if (batLinks.length > 1) payload.non_striker = $l(batLinks[1]).text().trim();
        payload.bowler = $l('.cb-min-bwl-rw .cb-text-link').first().text().trim() || null;

        // Radar
        let balls = [];
        $l('.cb-col-10.cb-font-12, .cb-ovr-bl').each((i, el) => {
            let b = $l(el).text().trim(); if (b.length <= 3) balls.push(b);
        });
        if (balls.length > 0) {
            payload.last_over = balls.slice(0, 6);
            payload.last_ball = payload.last_over[payload.last_over.length - 1];
        }
    }

    // ==========================================
    // MATCH STATE CALCULATION ENGINE
    // ==========================================
    let lowerStatus = (payload.status || "").toLowerCase();
    let isCompleted = lowerStatus.includes('won') || lowerStatus.includes('result') || lowerStatus.includes('tied');

    if (lowerStatus.includes('abandoned')) {
        payload.match_state = "abandoned"; payload.title = "MISSION ABORTED";
    } else if (lowerStatus.includes('delay') || lowerStatus.includes('rain') || lowerStatus.includes('stumps')) {
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

    // Final Cleanups
    if (!payload.live_score) payload.live_score = "Intel Processing...";
    if (!payload.venue) payload.venue = "Location Secure";
    if (!payload.toss) payload.toss = "Awaiting Coin Drop";

    return res.status(200).json({ success: true, match_info: payload });

  } catch (err) {
    return res.status(200).json({ success: false, error: err.message });
  }
};
