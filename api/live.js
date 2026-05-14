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

  // 1. STRICT DATE LOCK PARSER
  let targetMonth = "";
  let targetDay = "";
  if (rawDateStr) {
      let cleanStr = rawDateStr.split('(')[0].trim().toLowerCase(); 
      let parts = cleanStr.split(' ');
      if (parts.length >= 2) {
          targetMonth = parts[0].substring(0, 3); // e.g., "may"
          targetDay = parts[1].replace(/\D/g, ''); // e.g., "14"
      }
  }

  // 2. INTELLIGENT ALIAS ENGINE
  const teamAliases = {
    "chennai": ["csk", "chennai", "super kings"],
    "delhi": ["dc", "delhi", "capitals"],
    "gujarat": ["gt", "gujarat", "titans"],
    "kolkata": ["kkr", "kolkata", "knight riders"],
    "lucknow": ["lsg", "lucknow", "super giants"],
    "mumbai": ["mi", "mumbai", "indians"],
    "punjab": ["pbks", "punjab", "kings"],
    "rajasthan": ["rr", "rajasthan", "royals"],
    "royal": ["rcb", "bengaluru", "bangalore", "challengers", "royal challengers"],
    "sunrisers": ["srh", "hyderabad", "sunrisers"]
  };

  let t1 = targetTeams.split(' vs ')[0]?.trim().split(' ')[0] || "";
  let t2 = targetTeams.split(' vs ')[1]?.trim().split(' ')[0] || "";
  const t1A = [...(teamAliases[t1] || []), t1];
  const t2A = [...(teamAliases[t2] || []), t2];

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

  function isIntelSufficient() {
      let hasStatus = payload.status && payload.status.length > 3;
      let hasVenue = payload.venue && payload.venue.length > 3;
      let hasToss = payload.toss && payload.toss.length > 3;
      return hasStatus && hasVenue && hasToss;
  }

  try {
    // ==============================================================
    // SELLER 1: ESPN JSON API (Date Locked)
    // ==============================================================
    if (!isIntelSufficient()) {
        try {
            let espnData = {};
            const espnEndpoints = [
                'https://hs-consumer-api.espncricinfo.com/v1/pages/matches/current?lang=en&latest=true',
                'https://hs-consumer-api.espncricinfo.com/v1/pages/matches/recent?lang=en&latest=true',
                'https://hs-consumer-api.espncricinfo.com/v1/pages/matches/schedule?lang=en&latest=true'
            ];
            
            let matchFound = false;
            for (let url of espnEndpoints) {
                let { data } = await axios.get(url, { headers, timeout: 3000 });
                if (data && data.matches) {
                    for (let m of data.matches) {
                        let tNames = m.teams.map(t => (t.team.longName + " " + t.team.abbreviation).toLowerCase());
                        
                        // Strict Date Lock Verification
                        if (targetMonth && targetDay) {
                            let mDate = new Date(m.startTime || m.startDate || "");
                            let mMonth = mDate.toLocaleString('en-US', { month: 'short' }).toLowerCase();
                            let mDay = mDate.getDate().toString();
                            if (mMonth !== targetMonth || mDay !== targetDay) continue; 
                        }

                        if (tNames.some(name => t1A.some(a => name.includes(a))) && tNames.some(name => t2A.some(a => name.includes(a)))) {
                            espnData.status = m.statusText || m.status;
                            if (m.tossResults && m.tossResults.text) espnData.toss = m.tossResults.text;
                            if (m.ground && m.ground.name) espnData.venue = m.ground.name;
                            espnData.source = "seller-1-espn";
                            espnData.source_url = `https://www.espncricinfo.com/series/${m.series.objectId}/match/${m.objectId}/live-cricket-score`;
                            
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
    // SELLER 2: CREX (Date Locked & Title-Only Regex)
    // ==============================================================
    if (!isIntelSufficient()) {
        try {
            let crexData = {};
            let res = await axios.get('https://crex.com/series/indian-premier-league-2026-1PW/matches', { headers, timeout: 3500 });
            let $cx = cheerio.load(res.data);
            let bestCxUrl = null;
            
            $cx('a').each((i, el) => {
                let href = $cx(el).attr('href') || "";
                let txt = ($cx(el).text() + " " + href).toLowerCase(); 
                let parentTxt = $cx(el).parent().parent().text().toLowerCase();
                let fullTxt = txt + " " + parentTxt;

                if (href.includes('cricket-live-score') || href.includes('match-details')) {
                    if (t1A.some(a => fullTxt.includes(a)) && t2A.some(a => fullTxt.includes(a))) {
                        let isDateMatch = true;
                        if (targetMonth && targetDay) {
                            if (!fullTxt.includes(targetMonth) || !fullTxt.includes(targetDay)) isDateMatch = false;
                        }
                        if (isDateMatch || fullTxt.includes('today')) {
                            bestCxUrl = href.startsWith('http') ? href : 'https://crex.com' + href;
                            return false; 
                        }
                    }
                }
            });

            if (bestCxUrl) {
                crexData.source_url = bestCxUrl;
                crexData.source = "seller-2-crex";
                
                let mRes = await axios.get(bestCxUrl, { headers, timeout: 4000 });
                let $m = cheerio.load(mRes.data);
                
                // NO MORE GLOBAL BODY SCANNING
                let pageTitle = $m('title').text() || "";
                let titleWin = pageTitle.match(/([a-zA-Z\s\-]+won by\s\d+\s(?:runs|wickets|run|wicket))/i);
                if (titleWin) crexData.status = titleWin[1].trim();
                else crexData.status = $m('.match-info-status, .status, .match-status').first().text().trim();

                $m('div, span').each((i, el) => {
                    let text = $m(el).text().trim().replace(/\s+/g, ' ');
                    if (!crexData.venue && text.startsWith('Venue:')) crexData.venue = text.split('Venue:')[1].split(/(?=Toss|Umpires|Match)/)[0].trim();
                    if (!crexData.toss && text.startsWith('Toss:')) crexData.toss = text.split('Toss:')[1].split(/(?=Time|Venue|Umpires)/)[0].trim();
                });

                let scoreMatch = $m('body').text().replace(/\s+/g, ' ').match(/([A-Z-]+\s*\d+\/\d+\s*\([\d\.]+\))/g);
                if (scoreMatch && scoreMatch.length > 0) crexData.live_score = scoreMatch.join(' v ');

                mergeIntel(crexData);
            }
        } catch (e) {}
    }

    // ==============================================================
    // SELLER 3: CRICBUZZ (Deep Archive & Title-Only Regex)
    // ==============================================================
    if (!isIntelSufficient()) {
        try {
            let cbData = {};
            const directories = [
                'https://m.cricbuzz.com/cricket-series/9241/indian-premier-league-2026/matches',
                'https://m.cricbuzz.com/cricket-match/live-scores'
            ];

            let bestCbUrl = null;

            for (const dir of directories) {
                const { data: dirData } = await axios.get(dir, { headers, timeout: 3000 });
                const $d = cheerio.load(dirData);
                
                $d('a').each((i, el) => {
                    const href = $d(el).attr('href') || "";
                    const txt = $d(el).text().toLowerCase();
                    const parentTxt = $d(el).parent().parent().parent().text().toLowerCase();
                    const fullTxt = txt + " " + parentTxt;

                    if (href.includes('/live-cricket-scores/') || href.includes('/cricket-scores/')) {
                        if (t1A.some(a => fullTxt.includes(a)) && t2A.some(a => fullTxt.includes(a))) {
                            let isDateMatch = true;
                            if (targetMonth && targetDay) {
                                if (!fullTxt.includes(targetMonth) || !fullTxt.includes(targetDay)) isDateMatch = false;
                            }
                            if (isDateMatch || fullTxt.includes('today')) {
                                bestCbUrl = href.startsWith('http') ? href : 'https://m.cricbuzz.com' + href;
                                return false; 
                            }
                        }
                    }
                });
                if (bestCbUrl) break; 
            }

            if (bestCbUrl) {
                let scorecardUrl = bestCbUrl.replace('/live-cricket-scores/', '/live-cricket-scorecard/').replace('/cricket-scores/', '/live-cricket-scorecard/');
                let factsUrl = bestCbUrl.replace('/live-cricket-scores/', '/cricket-match-facts/').replace('/cricket-scores/', '/cricket-match-facts/');
                
                cbData.source = "seller-3-cricbuzz";
                cbData.source_url = scorecardUrl;

                const [scRes, factsRes] = await Promise.allSettled([
                    axios.get(scorecardUrl, { headers, timeout: 4000 }),
                    axios.get(factsUrl, { headers, timeout: 4000 })
                ]);

                // 1. Facts Tab for Venue/Toss/Result
                if (factsRes.status === 'fulfilled') {
                    const $f = cheerio.load(factsRes.value.data);
                    $f('div, span').each((i, el) => {
                        let text = $f(el).text().trim().replace(/\s+/g, ' ');
                        if (!cbData.venue && text.match(/^Venue\s*:/i)) cbData.venue = text.split(/Venue\s*:/i)[1].split(/•|Date|{/)[0].trim();
                        if (!cbData.toss && text.match(/^Toss\s*:/i)) cbData.toss = text.split(/Toss\s*:/i)[1].split(/•|Date|Time|{/)[0].trim();
                        if (!cbData.status && text.match(/^Result\s*:/i)) cbData.status = text.split(/Result\s*:/i)[1].trim();
                    });
                }

                // 2. Scorecard Tab for Score and Backup Status
                if (scRes.status === 'fulfilled') {
                    const $m = cheerio.load(scRes.value.data);
                    
                    if (!cbData.status) {
                        // NO MORE GLOBAL BODY TEXT SCANNING. ONLY CHECK THE PAGE TITLE!
                        let pageTitle = $m('title').text() || "";
                        let titleStatus = "";
                        pageTitle.split('|')[0].split('-').forEach(part => {
                            if (part.toLowerCase().includes('won by') || part.toLowerCase().includes('tied')) {
                                // Cleans rogue numbers from start of title like "4Royal" or "6Punjab"
                                titleStatus = part.replace(/^[0-9]+/, '').trim();
                            }
                        });
                        cbData.status = titleStatus || $m('.cb-text-complete, .ui-match-status, .cb-status-msg').first().text().trim();
                    }

                    let teamScores = [];
                    $m('.ui-bat-team-scores, .cb-min-bat-rw').each((i, el) => teamScores.push($m(el).text().trim()));
                    if (teamScores.length > 0) cbData.live_score = teamScores.join(' v ');
                }

                mergeIntel(cbData);
            }
        } catch(e) {}
    }

    // ==============================================================
    // SELLER 4: RSS XML FEEDS (Date Locked Failsafe)
    // ==============================================================
    // Only runs if we never found a valid Match URL above
    if (!payload.source_url && (!payload.status || !payload.live_score)) {
        try {
            let xmlData = {};
            const { data: xmlBody } = await axios.get('https://www.espncricinfo.com/rss/livescores.xml', { timeout: 3000 });
            const $x = cheerio.load(xmlBody, { xmlMode: true });
            $x('item').each((i, el) => {
                const title = $x(el).find('title').text().toLowerCase();
                const desc = $x(el).find('description').text().toLowerCase();
                
                // XML Date Lock
                if (targetMonth && targetDay && !title.includes(targetMonth) && !desc.includes(targetMonth)) return true;

                if (t1A.some(a => title.includes(a)) && t2A.some(a => title.includes(a))) {
                    if (!payload.status) xmlData.status = $x(el).find('description').text().trim();
                    if (!payload.live_score) {
                        let scoreMatch = $x(el).find('title').text().split(' vs ')[0].trim();
                        if (scoreMatch.match(/\d+\/\d+/)) xmlData.live_score = scoreMatch;
                    }
                    xmlData.source = "seller-4-xml";
                    return false; 
                }
            });
            mergeIntel(xmlData);
        } catch(e) {}
    }

    // ==============================================================
    // FIREWALL & MATCH STATE ENGINE 
    // ==============================================================
    let lowerStatus = (payload.status || "").toLowerCase();
    
    // FIREWALL: Verify the winning team name is actually one of the teams playing
    let isFakeNewsResult = false;
    if (lowerStatus.includes('won by')) {
        let t1Win = t1A.some(alias => lowerStatus.includes(alias));
        let t2Win = t2A.some(alias => lowerStatus.includes(alias));
        if (!t1Win && !t2Win) {
            isFakeNewsResult = true; // The result doesn't belong to either team!
        }
    }

    // If it's a fake news footer, wipe it.
    if (isFakeNewsResult) {
        payload.status = "Pre-Match Standby";
        lowerStatus = "pre-match standby";
    }

    // Clean rogue numbers from the start of the status string (e.g., "6Punjab")
    if (payload.status && payload.status.match(/^[0-9]+/)) {
        payload.status = payload.status.replace(/^[0-9]+/, '').trim();
    }

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
                
                payload.live_score = "Awaiting Deployment";
                if (!payload.status || payload.status === "Intel Gathering...") {
                    payload.status = "Pre-Match Standby";
                }
                payload.result = null; // Clear any false results
            }
        } catch(e) {}
    }

    // Post-Cascade Fallbacks 
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
