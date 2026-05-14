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
    "chennai": ["csk", "chennai", "super kings"],
    "delhi": ["dc", "delhi", "capitals"],
    "gujarat": ["gt", "gujarat", "titans"],
    "kolkata": ["kkr", "kolkata", "knight riders"],
    "lucknow": ["lsg", "lucknow", "super giants"],
    "mumbai": ["mi", "mumbai", "indians"],
    "punjab": ["pbks", "punjab", "kings"],
    "rajasthan": ["rr", "rajasthan", "royals"],
    "royal": ["rcb", "bengaluru", "bangalore", "challengers"],
    "sunrisers": ["srh", "hyderabad", "sunrisers"]
  };

  let t1 = targetTeams.split(' vs ')[0]?.trim().split(' ')[0] || "";
  let t2 = targetTeams.split(' vs ')[1]?.trim().split(' ')[0] || "";
  const t1A = teamAliases[t1] || [t1];
  const t2A = teamAliases[t2] || [t2];

  let payload = {
        title: "IPL LIVE INTEL",
        status: null,
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
        source: "hybrid-espn-cricbuzz",
        source_url: null
  };

  try {
    const headers = { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'application/json, text/plain, */*'
    };

    let matchFound = false;

    // ==============================================================
    // ENGINE 1: ESPNCricinfo JSON API (Live & Recent 48hrs)
    // ==============================================================
    const espnEndpoints = [
        'https://hs-consumer-api.espncricinfo.com/v1/pages/matches/current?lang=en&latest=true',
        'https://hs-consumer-api.espncricinfo.com/v1/pages/matches/recent?lang=en&latest=true'
    ];

    for (let url of espnEndpoints) {
        try {
            let { data } = await axios.get(url, { headers, timeout: 3000 });
            if (data && data.matches) {
                for (let m of data.matches) {
                    let tNames = m.teams.map(t => (t.team.longName + " " + t.team.abbreviation).toLowerCase());
                    let hasT1 = tNames.some(name => t1A.some(a => name.includes(a)));
                    let hasT2 = tNames.some(name => t2A.some(a => name.includes(a)));
                    
                    if (hasT1 && hasT2) {
                        matchFound = true;
                        payload.source = "espn-internal-api";
                        payload.source_url = `https://www.espncricinfo.com/series/${m.series.objectId}/match/${m.objectId}/live-cricket-score`;
                        
                        payload.status = m.statusText || m.status;
                        if (m.tossResults && m.tossResults.text) payload.toss = m.tossResults.text;
                        if (m.ground && m.ground.name) payload.venue = m.ground.name;

                        let stateMap = { 'PRE': 'pre-match', 'LIVE': 'live', 'POST': 'completed' };
                        payload.match_state = stateMap[m.state] || 'standby';

                        let scores = [];
                        m.teams.forEach(t => {
                            if (t.score) {
                                let s = `${t.team.abbreviation} ${t.score}`;
                                if (t.scoreInfo) s += ` (${t.scoreInfo})`;
                                scores.push(s);
                            }
                        });
                        if (scores.length > 0) payload.live_score = scores.join(' v ');
                        break;
                    }
                }
            }
        } catch(e) {}
        if (matchFound) break;
    }

    // ==============================================================
    // ENGINE 2: CRICBUZZ DEEP ARCHIVE (For older completed matches)
    // ==============================================================
    if (!matchFound) {
        const cbHeaders = { 'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36' };
        const directories = [
            'https://m.cricbuzz.com/cricket-match/live-scores',
            'https://m.cricbuzz.com/cricket-match/live-scores/recent-matches',
            'https://m.cricbuzz.com/cricket-series/9241/indian-premier-league-2026/matches'
        ];

        let cbMatchUrl = null;
        for (const dir of directories) {
            try {
                const { data: dirData } = await axios.get(dir, { headers: cbHeaders, timeout: 4000 });
                const $d = cheerio.load(dirData);
                $d('a').each((i, el) => {
                    const href = $d(el).attr('href') || "";
                    const text = ($d(el).text() + " " + href).toLowerCase();
                    if (href.includes('/live-cricket-scores/') || href.includes('/cricket-scores/')) {
                        if (t1A.some(a => text.includes(a)) && t2A.some(a => text.includes(a))) {
                            cbMatchUrl = href.startsWith('http') ? href : 'https://m.cricbuzz.com' + href;
                            return false; 
                        }
                    }
                });
                if (cbMatchUrl) break; 
            } catch(e) {}
        }

        if (cbMatchUrl) {
            matchFound = true;
            payload.source = "cricbuzz-mobile";
            payload.source_url = cbMatchUrl.replace('/live-cricket-scores/', '/live-cricket-scorecard/').replace('/cricket-scores/', '/live-cricket-scorecard/');

            const { data: mHtml } = await axios.get(payload.source_url, { headers: cbHeaders, timeout: 5000 });
            const $m = cheerio.load(mHtml);

            let pageTitle = $m('title').text() || "";
            let rawText = $m('body').text().replace(/\s+/g, ' ');

            // 1. EXTRACT RESULT / STATUS (Rip directly from page title)
            // Example: "KKR vs RCB - Kolkata won by 4 wickets - Live Cricket Score"
            pageTitle.split('-').forEach(part => {
                if (part.toLowerCase().includes('won by') || part.toLowerCase().includes('tied')) {
                    payload.status = part.trim();
                }
            });
            if (!payload.status) {
                payload.status = $m('.cb-text-complete, .ui-match-status, .cb-status-msg').first().text().trim();
            }

            // 2. EXTRACT TOSS & VENUE (Deep regex search)
            let tossMatch = rawText.match(/Toss\s*:\s*(.*?)(?=\s+Venue|\s+Time|\s+Umpires|\s+Squad)/i);
            if (tossMatch) payload.toss = tossMatch[1].trim();

            let venueMatch = rawText.match(/Venue\s*:\s*(.*?)(?=\s+Umpires|\s+Toss|\s+Match)/i);
            if (venueMatch) payload.venue = venueMatch[1].trim();

            // Failsafe for Toss/Venue
            $m('span, div').each((i, el) => {
                let text = $m(el).text().trim().replace(/\s+/g, ' ');
                if (!payload.venue && text.startsWith('Venue:')) payload.venue = text.split('Venue:')[1].split(',')[0].trim();
                if (!payload.toss && text.startsWith('Toss:')) payload.toss = text.split('Toss:')[1].trim();
            });

            // 3. EXTRACT LIVE SCORES (If match is not over)
            let teamScores = [];
            $m('.ui-bat-team-scores, .cb-min-bat-rw').each((i, el) => teamScores.push($m(el).text().trim()));
            if (teamScores.length > 0) payload.live_score = teamScores.join(' v ');
        }
    }

    if (!matchFound) throw new Error(`Target ${t1} vs ${t2} completely missing from global matrix.`);

    // ==============================================================
    // MATCH STATE ENGINE (Final Formatting)
    // ==============================================================
    let lowerStatus = (payload.status || "").toLowerCase();
    let isCompleted = lowerStatus.includes('won by') || lowerStatus.includes('result') || lowerStatus.includes('tied');

    if (lowerStatus.includes('abandoned')) {
        payload.match_state = "abandoned"; 
        payload.title = "MISSION ABORTED";
        payload.live_score = "Match Abandoned";
    } else if (lowerStatus.includes('delay') || lowerStatus.includes('rain') || lowerStatus.includes('stumps')) {
        payload.match_state = "delay"; 
        payload.title = "WEATHER PROTOCOL";
    } else if (isCompleted) {
        payload.match_state = "completed"; 
        payload.title = "MISSION ACCOMPLISHED";
        payload.result = payload.status; 
        payload.live_score = "Match Ended";  // Forcing Score String here!
        payload.last_over = ["E", "N", "D"];
        payload.striker = null; 
        payload.bowler = "Mission Concluded";
    } else if (lowerStatus.includes('toss')) {
        payload.match_state = "pre-match"; 
        if (!payload.toss) payload.toss = payload.status;
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

    // Failsafe Fallbacks
    if (!payload.live_score) payload.live_score = "Intel Unavailable";
    if (!payload.venue) payload.venue = "Location Secure";
    if (!payload.toss) payload.toss = "Awaiting Coin Drop";
    if (!payload.status) payload.status = "Uplink Established";

    return res.status(200).json({ success: true, match_info: payload });

  } catch (err) {
    return res.status(200).json({ success: false, error: err.message });
  }
};
