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
        last_over: [],
        prediction: "Tracking...",
        countdown: null,
        source: "awaiting-seller",
        source_url: null
  };

  const headers = { 
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      'Accept': 'application/json, text/plain, */*'
  };

  // Helper: Safely merges data
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
      if (newData.source) payload.source = newData.source;
      if (newData.source_url) payload.source_url = newData.source_url;
  }

  // Helper: Checks if the current Seller gave us everything we need
  function isIntelSufficient() {
      let hasStatus = payload.status && payload.status.length > 3;
      let hasVenue = payload.venue && payload.venue.length > 3;
      return hasStatus && hasVenue;
  }

  try {
    // ==============================================================
    // SELLER 1: ESPN JSON API
    // ==============================================================
    if (!isIntelSufficient()) {
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
                            espnData.source = "seller-1-espn";
                            
                            let scores = [];
                            m.teams.forEach(t => {
                                if (t.score) {
                                    let s = `${t.team.abbreviation} ${t.score}`;
                                    if (t.scoreInfo) s += ` (${t.scoreInfo})`;
                                    scores.push(s);
                                }
                            });
                            if (scores.length > 0) espnData.live_score = scores.join(' v ');
                            matchFound = true;
                            break;
                        }
                    }
                }
                if (matchFound) break;
            }
            mergeIntel(espnData);
        } catch(e) {}
    }

    // ==============================================================
    // SELLER 2: CREX DIRECT HTML (If ESPN failed)
    // ==============================================================
    if (!isIntelSufficient()) {
        try {
            let crexData = {};
            let res = await axios.get('https://crex.com/series/indian-premier-league-2026-1PW/matches', { headers, timeout: 3500 });
            let $cx = cheerio.load(res.data);
            let cxMatchUrl = null;
            
            $cx('a').each((i, el) => {
                let href = $cx(el).attr('href') || "";
                let txt = ($cx(el).text() + " " + href).toLowerCase();
                if (href.includes('cricket-live-score') || href.includes('match-details')) {
                    if (t1A.some(a => txt.includes(a)) && t2A.some(a => txt.includes(a))) {
                        cxMatchUrl = href.startsWith('http') ? href : 'https://crex.com' + href;
                        return false;
                    }
                }
            });

            if (cxMatchUrl) {
                crexData.source_url = cxMatchUrl;
                crexData.source = "seller-2-crex";
                
                let mRes = await axios.get(cxMatchUrl, { headers, timeout: 4000 });
                let $m = cheerio.load(mRes.data);
                let rawText = $m('body').text().replace(/\s+/g, ' ');

                let winMatch = rawText.match(/([a-zA-Z0-9\s]+won by\s\d+\s(?:runs|wickets|run|wicket))/i);
                if (winMatch) crexData.status = winMatch[1].trim();

                let venueMatch = rawText.match(/Venue\s*:\s*(.*?)(?=\s+Toss|\s+Umpires|\s+Match)/i);
                if (venueMatch) crexData.venue = venueMatch[1].trim();

                let tossMatch = rawText.match(/Toss\s*:\s*(.*?)(?=\s+Time|\s+Venue|\s+Umpires)/i);
                if (tossMatch) crexData.toss = tossMatch[1].trim();

                let scoreMatch = rawText.match(/([A-Z-]+\s*\d+\/\d+\s*\([\d\.]+\))/g);
                if (scoreMatch && scoreMatch.length > 0) crexData.live_score = scoreMatch.join(' v ');

                mergeIntel(crexData);
            }
        } catch (e) {}
    }

    // ==============================================================
    // SELLER 3: CRICBUZZ MOBILE (If CREX also failed)
    // ==============================================================
    if (!isIntelSufficient()) {
        try {
            let cbData = {};
            const directories = [
                'https://m.cricbuzz.com/cricket-match/live-scores',
                'https://m.cricbuzz.com/cricket-match/live-scores/recent-matches'
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
                cbData.source = "seller-3-cricbuzz";
                cbData.source_url = safeUrl;

                const { data: mHtml } = await axios.get(safeUrl, { headers, timeout: 4000 });
                const $m = cheerio.load(mHtml);
                let rawBodyText = $m('body').text().replace(/\s+/g, ' ');

                let winMatch = rawBodyText.match(/([a-zA-Z0-9\s]+won by\s\d+\s(?:runs|wickets|run|wicket))/i);
                if (winMatch) cbData.status = winMatch[1].trim();
                else cbData.status = $m('.cb-text-complete, .ui-match-status, .cb-status-msg').first().text().trim();

                $m('div, span').each((i, el) => {
                    let text = $m(el).text().trim().replace(/\s+/g, ' ');
                    if (!cbData.venue && text.startsWith('Venue:')) cbData.venue = text.split('Venue:')[1].split(/•|Date &|{/)[0].trim();
                    if (!cbData.toss && text.startsWith('Toss:')) cbData.toss = text.split('Toss:')[1].trim();
                });

                let teamScores = [];
                $m('.ui-bat-team-scores, .cb-min-bat-rw').each((i, el) => teamScores.push($m(el).text().trim()));
                if (teamScores.length > 0) cbData.live_score = teamScores.join(' v ');

                mergeIntel(cbData);
            }
        } catch(e) {}
    }

    // ==============================================================
    // SELLER 4: RSS XML FEEDS (Last Resort)
    // ==============================================================
    if (!payload.status) {
        try {
            let xmlData = {};
            const { data: xmlBody } = await axios.get('https://www.espncricinfo.com/rss/livescores.xml', { timeout: 3000 });
            const $x = cheerio.load(xmlBody, { xmlMode: true });
            $x('item').each((i, el) => {
                const title = $x(el).find('title').text().toLowerCase();
                if (t1A.some(a => title.includes(a)) && t2A.some(a => title.includes(a))) {
                    xmlData.status = $x(el).find('description').text().trim();
                    xmlData.source = "seller-4-xml";
                    return false; 
                }
            });
            mergeIntel(xmlData);
        } catch(e) {}
    }

    // ==============================================================
    // MATCH STATE ENGINE 
    // ==============================================================
    let lowerStatus = (payload.status || "").toLowerCase();
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

    // Countdown Timer
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

    // Fallbacks 
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
