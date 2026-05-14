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

  // The Master Payload (Starts Empty)
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
        last_over: [],
        prediction: "Tracking...",
        countdown: null,
        source: "multi-node-cascade",
        source_url: "multiple-encrypted-nodes"
  };

  const headers = { 
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      'Accept': 'application/json, text/plain, */*'
  };

  // Helper Function: Merges new intel into the master payload ONLY if it's missing
  function mergeIntel(newData) {
      if (!payload.live_score && newData.live_score) payload.live_score = newData.live_score;
      if (!payload.status && newData.status) payload.status = newData.status;
      if (!payload.venue && newData.venue) payload.venue = newData.venue;
      if (!payload.toss && newData.toss) payload.toss = newData.toss;
      if (!payload.target && newData.target) payload.target = newData.target;
      if (!payload.current_rr && newData.current_rr) payload.current_rr = newData.current_rr;
      if (!payload.required_rr && newData.required_rr) payload.required_rr = newData.required_rr;
      if (!payload.striker && newData.striker) payload.striker = newData.striker;
      if (!payload.non_striker && newData.non_striker) payload.non_striker = newData.non_striker;
      if (!payload.bowler && newData.bowler) payload.bowler = newData.bowler;
      if (payload.last_over.length === 0 && newData.last_over && newData.last_over.length > 0) payload.last_over = newData.last_over;
  }

  try {
    // ==============================================================
    // CASCADE 1: ESPN JSON API (Lightning Fast, Highly Structured)
    // ==============================================================
    try {
        let espnData = {};
        const espnEndpoints = [
            'https://hs-consumer-api.espncricinfo.com/v1/pages/matches/current?lang=en&latest=true',
            'https://hs-consumer-api.espncricinfo.com/v1/pages/matches/recent?lang=en&latest=true'
        ];
        
        let matchFound = false;
        for (let url of espnEndpoints) {
            let { data } = await axios.get(url, { headers, timeout: 3000 });
            if (data && data.matches) {
                for (let m of data.matches) {
                    let tNames = m.teams.map(t => (t.team.longName + " " + t.team.abbreviation).toLowerCase());
                    if (tNames.some(name => t1A.some(a => name.includes(a))) && tNames.some(name => t2A.some(a => name.includes(a)))) {
                        espnData.status = m.statusText || m.status;
                        if (m.tossResults && m.tossResults.text) espnData.toss = m.tossResults.text;
                        if (m.ground && m.ground.name) espnData.venue = m.ground.name;
                        
                        let scores = [];
                        m.teams.forEach(t => {
                            if (t.score) {
                                let s = `${t.team.abbreviation} ${t.score}`;
                                if (t.scoreInfo) s += ` (${t.scoreInfo})`;
                                scores.push(s);
                            }
                        });
                        if (scores.length > 0) espnData.live_score = scores.join(' v ');
                        
                        // Check Details API if match is active/recent
                        try {
                            let detailsUrl = `https://hs-consumer-api.espncricinfo.com/v1/pages/match/details?lang=en&seriesId=${m.series.objectId}&matchId=${m.objectId}&latest=true`;
                            let { data: dData } = await axios.get(detailsUrl, { headers, timeout: 2000 });
                            if (dData.supportInfo && dData.supportInfo.liveInning) {
                                let li = dData.supportInfo.liveInning;
                                if (li.target) espnData.target = li.target.toString();
                            }
                        } catch(e) {}
                        
                        matchFound = true;
                        break;
                    }
                }
            }
            if (matchFound) break;
        }
        mergeIntel(espnData);
    } catch(e) { console.log("Cascade 1 Failed or Blocked."); }

    // ==============================================================
    // CASCADE 2: CRICBUZZ MOBILE (Fills in missing Venue, Toss, Score)
    // ==============================================================
    // We only fire this if critical intel is still missing
    if (!payload.live_score || !payload.venue || !payload.toss || !payload.status) {
        try {
            let cbData = {};
            const directories = [
                'https://m.cricbuzz.com/cricket-match/live-scores',
                'https://m.cricbuzz.com/cricket-match/live-scores/recent-matches',
                'https://m.cricbuzz.com/cricket-series/9241/indian-premier-league-2026/matches'
            ];

            let cbMatchUrl = null;
            for (const dir of directories) {
                const { data: dirData } = await axios.get(dir, { headers, timeout: 3000 });
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
            }

            if (cbMatchUrl) {
                let safeUrl = cbMatchUrl.replace('/live-cricket-scores/', '/live-cricket-scorecard/').replace('/cricket-scores/', '/live-cricket-scorecard/');
                const { data: mHtml } = await axios.get(safeUrl, { headers, timeout: 4000 });
                const $m = cheerio.load(mHtml);

                let rawBodyText = $m('body').text().replace(/\s+/g, ' ');

                // Missing Status/Result?
                if (!payload.status) {
                    let winMatch = rawBodyText.match(/([a-zA-Z0-9\s]+won by\s\d+\s(?:runs|wickets|run|wicket))/i);
                    if (winMatch) cbData.status = winMatch[1].trim();
                    else cbData.status = $m('.cb-text-complete, .ui-match-status, .cb-status-msg').first().text().trim();
                }

                // Missing Venue or Toss?
                if (!payload.venue || !payload.toss) {
                    $m('div, span').each((i, el) => {
                        let text = $m(el).text().trim().replace(/\s+/g, ' ');
                        if (!cbData.venue && text.startsWith('Venue:')) cbData.venue = text.split('Venue:')[1].split(/•|Date &|{/)[0].trim();
                        if (!cbData.toss && text.startsWith('Toss:')) cbData.toss = text.split('Toss:')[1].trim();
                    });
                }

                // Missing Score?
                if (!payload.live_score) {
                    let teamScores = [];
                    $m('.ui-bat-team-scores, .cb-min-bat-rw').each((i, el) => teamScores.push($m(el).text().trim()));
                    if (teamScores.length > 0) cbData.live_score = teamScores.join(' v ');
                }

                mergeIntel(cbData);
            }
        } catch(e) { console.log("Cascade 2 Failed or Blocked."); }
    }

    // ==============================================================
    // CASCADE 3: RSS XML FEEDS (The Ultimate Unblockable Failsafe)
    // ==============================================================
    if (!payload.status || !payload.live_score) {
        try {
            let xmlData = {};
            const { data: xmlBody } = await axios.get('https://www.espncricinfo.com/rss/livescores.xml', { timeout: 3000 });
            const $x = cheerio.load(xmlBody, { xmlMode: true });
            $x('item').each((i, el) => {
                const title = $x(el).find('title').text().toLowerCase();
                if (t1A.some(a => title.includes(a)) && t2A.some(a => title.includes(a))) {
                    if (!payload.status) xmlData.status = $x(el).find('description').text().trim();
                    if (!payload.live_score) {
                        let scoreMatch = $x(el).find('title').text().split(' vs ')[0].trim();
                        if (scoreMatch.match(/\d+\/\d+/)) xmlData.live_score = scoreMatch;
                    }
                    return false; 
                }
            });
            mergeIntel(xmlData);
        } catch(e) { console.log("Cascade 3 Failed."); }
    }

    // ==============================================================
    // MATCH STATE ENGINE (Final Formatting)
    // ==============================================================
    let lowerStatus = (payload.status || "").toLowerCase();

    // Forced match completion check based on the status we scraped
    let isCompleted = lowerStatus.includes('won by') || lowerStatus.includes('result') || lowerStatus.includes('tied');

    if (lowerStatus.includes('abandoned')) {
        payload.match_state = "abandoned"; payload.title = "MISSION ABORTED";
    } else if (lowerStatus.includes('delay') || lowerStatus.includes('rain') || lowerStatus.includes('stumps')) {
        payload.match_state = "delay"; payload.title = "WEATHER PROTOCOL";
    } else if (isCompleted) {
        payload.match_state = "completed"; 
        payload.title = "MISSION ACCOMPLISHED";
        payload.result = payload.status; 
        payload.live_score = "Match Ended"; 
        payload.last_over = ["E", "N", "D"];
        payload.striker = null; payload.bowler = "Mission Concluded";
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

    // Post-Cascade Fallbacks (If all 3 nodes failed to find a specific piece)
    if (!payload.live_score) payload.live_score = "Intel Unavailable";
    if (!payload.venue) payload.venue = "Location Secure";
    if (!payload.toss) payload.toss = "Awaiting Coin Drop";
    if (!payload.status) payload.status = "Uplink Established";
    if (payload.last_over.length === 0) payload.last_over = ["-", "-", "-", "-", "-", "-"];

    return res.status(200).json({ success: true, match_info: payload });

  } catch (err) {
    return res.status(200).json({ success: false, error: err.message });
  }
};
