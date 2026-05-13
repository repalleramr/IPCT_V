const axios = require('axios');

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
        source: "espn-api-core",
        source_url: null
  };

  try {
    // We disguise the request and ask strictly for JSON
    const headers = { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'application/json'
    };
    
    // 1. INFILTRATE ESPN'S GLOBAL JSON MATRIX
    const url = 'https://hs-consumer-api.espncricinfo.com/v1/pages/matches/current?lang=en&latest=true';
    const { data } = await axios.get(url, { headers, timeout: 6000 });
    
    let matchData = null;
    
    if (data && data.matches) {
        for (let m of data.matches) {
            let tNames = m.teams.map(t => (t.team.longName + " " + t.team.abbreviation).toLowerCase());
            let hasT1 = tNames.some(name => t1A.some(a => name.includes(a)));
            let hasT2 = tNames.some(name => t2A.some(a => name.includes(a)));
            
            if (hasT1 && hasT2) {
                matchData = m;
                break;
            }
        }
    }

    if (!matchData) throw new Error("Target not found in ESPN JSON Matrix.");

    // 2. PARSE THE RAW JSON DATA
    payload.source_url = `https://www.espncricinfo.com/series/${matchData.series.objectId}/match/${matchData.objectId}/live-cricket-score`;
    
    payload.status = matchData.statusText || matchData.status;
    if (matchData.tossResults && matchData.tossResults.text) payload.toss = matchData.tossResults.text;
    if (matchData.ground && matchData.ground.name) payload.venue = matchData.ground.name;

    // Determine Match State
    let stateMap = { 'PRE': 'pre-match', 'LIVE': 'live', 'POST': 'completed' };
    payload.match_state = stateMap[matchData.state] || 'standby';

    if (payload.status && payload.status.toLowerCase().includes('abandoned')) payload.match_state = 'abandoned';
    if (payload.status && payload.status.toLowerCase().includes('delay')) payload.match_state = 'delay';

    // Extract Scores from Arrays
    let scores = [];
    matchData.teams.forEach(t => {
        if (t.score) {
            let s = `${t.team.abbreviation} ${t.score}`;
            if (t.scoreInfo) s += ` (${t.scoreInfo})`;
            scores.push(s);
        }
    });

    if (scores.length > 0) {
        payload.live_score = scores.join(' v ');
    } else if (payload.match_state === 'pre-match') {
        payload.live_score = "Pre-Match Intel";
    } else {
        payload.live_score = "Match Ended";
    }

    // 3. DEEP DIVE FOR LIVE DATA (Balls, Run Rates, Players)
    if (payload.match_state === 'live' || payload.match_state === 'completed') {
        try {
            let detailsUrl = `https://hs-consumer-api.espncricinfo.com/v1/pages/match/details?lang=en&seriesId=${matchData.series.objectId}&matchId=${matchData.objectId}&latest=true`;
            let { data: dData } = await axios.get(detailsUrl, { headers, timeout: 5000 });
            
            // Build the Ball Radar
            if (dData && dData.recentBallCommentary) {
                let balls = dData.recentBallCommentary.ballComments;
                let overHistory = [];
                for (let i = 0; i < Math.min(balls.length, 6); i++) {
                    let b = balls[i];
                    if (b.isWicket) overHistory.unshift("W");
                    else if (b.isFour) overHistory.unshift("4");
                    else if (b.isSix) overHistory.unshift("6");
                    else overHistory.unshift(b.totalRuns.toString());
                }
                if (overHistory.length > 0) payload.last_over = overHistory;
            }

            // Extrapolate Run Rates and Strikers
            if (dData.supportInfo && dData.supportInfo.liveInning) {
                let li = dData.supportInfo.liveInning;
                if (li.currentRunRate) payload.current_rr = li.currentRunRate.toString();
                if (li.requiredRunRate) payload.required_rr = li.requiredRunRate.toString();
                if (li.target) payload.target = li.target.toString();

                if (li.batsmen && li.batsmen.length > 0) {
                    payload.striker = li.batsmen[0].player.shortName;
                    if (li.batsmen.length > 1) payload.non_striker = li.batsmen[1].player.shortName;
                }
                if (li.bowlers && li.bowlers.length > 0) {
                    payload.bowler = li.bowlers[0].player.shortName;
                }
            }
        } catch(e) { /* Deep dive failed silently, standard payload continues */ }
    }

    // Wrap-up states
    if (payload.match_state === 'completed') {
        payload.title = "MISSION ACCOMPLISHED";
        payload.result = payload.status;
        payload.last_over = ["E", "N", "D"];
        payload.striker = null;
        payload.bowler = "Mission Concluded";
    } else if (payload.match_state === 'abandoned') {
        payload.title = "MISSION ABORTED";
    }

    // Countdown Time Engine
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

    return res.status(200).json({ success: true, match_info: payload });

  } catch (err) {
    return res.status(200).json({ success: false, error: err.message });
  }
};
