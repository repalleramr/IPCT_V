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
        source: "mobile-ghost-protocol",
        source_url: null
  };

  try {
    const headers = { 
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml'
    };

    // ==============================================================
    // STEP 1: LOCATE TARGET VIA MOBILE LITE DIRECTORIES
    // ==============================================================
    const directories = [
        'https://m.cricbuzz.com/cricket-match/live-scores',
        'https://m.cricbuzz.com/cricket-match/live-scores/recent-matches',
        'https://www.espncricinfo.com/rss/livescores.xml' // Failsafe XML
    ];

    let matchUrl = null;
    let xmlStatus = null;

    for (const dir of directories) {
        try {
            const { data: dirData } = await axios.get(dir, { headers, timeout: 5000 });
            
            if (dir.includes('xml')) {
                const $x = cheerio.load(dirData, { xmlMode: true });
                $x('item').each((i, el) => {
                    const title = $x(el).find('title').text().toLowerCase();
                    if (t1A.some(a => title.includes(a)) && t2A.some(a => title.includes(a))) {
                        xmlStatus = $x(el).find('description').text().trim();
                    }
                });
            } else {
                const $d = cheerio.load(dirData);
                $d('a').each((i, el) => {
                    const href = $d(el).attr('href') || "";
                    const text = ($d(el).text() + " " + href).toLowerCase();
                    if (href.includes('/live-cricket-scores/') || href.includes('/cricket-scores/')) {
                        if (t1A.some(a => text.includes(a)) && t2A.some(a => text.includes(a))) {
                            matchUrl = href.startsWith('http') ? href : 'https://m.cricbuzz.com' + href;
                            return false; 
                        }
                    }
                });
            }
            if (matchUrl) break; 
        } catch(e) {}
    }

    if (!matchUrl && !xmlStatus) throw new Error(`Target ${t1} vs ${t2} completely missing from global matrix.`);
    
    // ==============================================================
    // STEP 2: INFILTRATE MATCH PAGE (MOBILE HTML IS UNBLOCKED)
    // ==============================================================
    if (matchUrl) {
        // Force the URL to the scorecard view to guarantee all data is present
        let stableUrl = matchUrl.replace('/live-cricket-scores/', '/live-cricket-scorecard/').replace('/cricket-scores/', '/live-cricket-scorecard/');
        payload.source_url = stableUrl;

        const { data: mHtml } = await axios.get(stableUrl, { headers, timeout: 6000 });
        const $m = cheerio.load(mHtml);
        
        // 1. Convert entire page to a clean text string for Regex Hunting
        let rawText = $m('body').text().replace(/\s+/g, ' ');
        let pageTitle = $m('title').text() || "";

        // 2. Global Regex Hunter (Finds Venue and Toss no matter where it is)
        let vMatch = rawText.match(/(?:Venue|Stadium|Location)[\s:]+([a-zA-Z0-9\s,]+)(?:Umpires|Referee|Toss|Match)/i);
        if (vMatch) payload.venue = vMatch[1].split(',')[0].trim();
        
        let tMatch = rawText.match(/Toss[\s:]+([a-zA-Z0-9\s,]+)(?:Time|Venue|Squad|Umpires)/i);
        if (tMatch) payload.toss = tMatch[1].split(/(?=Time|Venue)/)[0].trim();

        // 3. Extract Status
        let cbStatus = $m('.cb-text-complete, .ui-match-status, .cb-status-msg').first().text().trim();
        if (cbStatus) payload.status = cbStatus;
        else if (xmlStatus) payload.status = xmlStatus;

        // 4. Extract Score
        let scoreHeader = $m('.ui-bat-team-scores, .cb-min-bat-rw').first().text().trim();
        if (scoreHeader) {
            payload.live_score = scoreHeader;
        } else {
            // Failsafe: Rip from title tag
            let titleScore = pageTitle.split(',')[0].split('|')[0].trim();
            if (titleScore.match(/\d+\/\d+/)) payload.live_score = titleScore;
        }

        // 5. Extract Deep Stats (Run Rates)
        let crrMatch = rawText.match(/CRR[\s:]*([\d\.]+)/);
        let rrrMatch = rawText.match(/REQ[\s:]*([\d\.]+)/);
        if (crrMatch) payload.current_rr = crrMatch[1];
        if (rrrMatch) payload.required_rr = rrrMatch[1];
        let tgtMatch = rawText.match(/Target[\s:]*(\d+)/i);
        if (tgtMatch) payload.target = tgtMatch[1];

        // 6. Players
        let batLinks = $m('.cb-live-bat-table a, .cb-text-link');
        if (batLinks.length > 0) payload.striker = $m(batLinks[0]).text().trim();
        if (batLinks.length > 1) payload.non_striker = $m(batLinks[1]).text().trim();
        let bwlLinks = $m('.cb-live-bwl-table a');
        if (bwlLinks.length > 0) payload.bowler = $m(bwlLinks[0]).text().trim();

        // 7. Radar (Last Over)
        let balls = [];
        $m('.cb-ovr-flo span, .cb-text-gray span').each((i, el) => {
            let b = $m(el).text().trim(); 
            if (b.length > 0 && b.length <= 3 && b.match(/[0-9W]/)) balls.push(b);
        });
        if (balls.length > 0) {
            payload.last_over = balls.slice(-6); // Grab the most recent 6
            payload.last_ball = payload.last_over[payload.last_over.length - 1];
        }
    } else if (xmlStatus) {
        payload.status = xmlStatus;
        payload.live_score = "XML Feed Active";
    }

    // ==============================================================
    // MATCH STATE CALCULATION ENGINE
    // ==============================================================
    let lowerStatus = (payload.status || "").toLowerCase();
    let lowerTitle = (payload.title || "").toLowerCase();

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

    if (!payload.live_score) payload.live_score = "Intel Processing...";
    if (!payload.venue) payload.venue = "Location Secure";
    if (!payload.toss) payload.toss = "Awaiting Coin Drop";
    if (!payload.status) payload.status = "Uplink Established";

    return res.status(200).json({ success: true, match_info: payload });

  } catch (err) {
    return res.status(200).json({ success: false, error: err.message });
  }
};
