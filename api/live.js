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

  // 1. MASTER LEDGER (MAY 11 - MAY 31)
  const MASTER_LEDGER = {
      "may 11": { id: "may 11", expected: ["punjab", "delhi", "pbks", "dc"] },
      "may 12": { id: "may 12", expected: ["gujarat", "sunrisers", "gt", "srh"] },
      "may 13": { id: "may 13", expected: ["bengaluru", "kolkata", "rcb", "kkr"] },
      "may 14": { id: "may 14", expected: ["punjab", "mumbai", "pbks", "mi"] },
      "may 15": { id: "may 15", expected: ["lucknow", "chennai", "lsg", "csk"] },
      "may 16": { id: "may 16", expected: ["kolkata", "gujarat", "kkr", "gt"] },
      "may 17 3:30": { id: "may 17", expected: ["punjab", "bengaluru", "pbks", "rcb"] },
      "may 17 7:30": { id: "may 17", expected: ["delhi", "rajasthan", "dc", "rr"] },
      "may 18": { id: "may 18", expected: ["chennai", "sunrisers", "csk", "srh"] },
      "may 19": { id: "may 19", expected: ["rajasthan", "lucknow", "rr", "lsg"] },
      "may 20": { id: "may 20", expected: ["kolkata", "mumbai", "kkr", "mi"] },
      "may 21": { id: "may 21", expected: ["gujarat", "chennai", "gt", "csk"] },
      "may 22": { id: "may 22", expected: ["sunrisers", "bengaluru", "srh", "rcb"] },
      "may 23": { id: "may 23", expected: ["lucknow", "punjab", "lsg", "pbks"] },
      "may 24 3:30": { id: "may 24", expected: ["mumbai", "rajasthan", "mi", "rr"] },
      "may 24 7:30": { id: "may 24", expected: ["kolkata", "delhi", "kkr", "dc"] },
      "may 26": { id: "may 26", expected: ["qualifier 1", "qualifier"], isPlayoff: true },
      "may 27": { id: "may 27", expected: ["eliminator"], isPlayoff: true },
      "may 29": { id: "may 29", expected: ["qualifier 2", "qualifier"], isPlayoff: true },
      "may 31": { id: "may 31", expected: ["final"], isPlayoff: true }
  };

  let requestTime = rawDateStr.toLowerCase();
  let ledgerKey = "";
  Object.keys(MASTER_LEDGER).forEach(key => {
      let monthDay = key.split(' ')[0] + " " + key.split(' ')[1]; 
      if (requestTime.includes(monthDay)) {
          if (key.includes("3:30") && requestTime.includes("3:30")) ledgerKey = key;
          else if (key.includes("7:30") && requestTime.includes("7:30")) ledgerKey = key;
          else if (!key.includes(":")) ledgerKey = key;
      }
  });

  let currentMission = MASTER_LEDGER[ledgerKey] || { id: "", expected: [] };

  // 2. ALIAS ENGINE
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
    "sunrisers": ["srh", "hyderabad", "sunrisers"],
    "tbd": ["tbd"]
  };

  let t1 = targetTeams.split(' vs ')[0]?.trim().split(' ')[0] || "tbd";
  let t2 = targetTeams.split(' vs ')[1]?.trim().split(' ')[0] || "tbd";
  const t1A = [...(teamAliases[t1] || []), t1];
  const t2A = [...(teamAliases[t2] || []), t2];

  let payload = {
        title: "IPL LIVE INTEL", status: null, match_state: "standby",
        live_score: null, overs: null, target: null, required_rr: null,
        current_rr: null, striker: null, non_striker: null, bowler: null,
        toss: null, result: null, venue: null, last_ball: null,
        last_over: [], prediction: "Tracking...", countdown: null,
        source: "awaiting-seller", source_url: null
  };

  const headers = { 'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36' };

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
      return (payload.status && payload.status.length > 3) && 
             (payload.venue && payload.venue.length > 3) && 
             (payload.toss && payload.toss.length > 3);
  }

  // BUG FIX: Removed Date String requirement from Team Matcher!
  function matchesTeams(fullTxt) {
      if (!fullTxt) return false;
      let t1Match = t1 !== "tbd" && t1A.some(a => fullTxt.includes(a));
      let t2Match = t2 !== "tbd" && t2A.some(a => fullTxt.includes(a));
      
      if (t1Match && t2Match) return true;
      if (currentMission.isPlayoff && currentMission.expected.some(e => fullTxt.includes(e))) return true;
      return false;
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
                'https://hs-consumer-api.espncricinfo.com/v1/pages/matches/recent?lang=en&latest=true',
                'https://hs-consumer-api.espncricinfo.com/v1/pages/matches/schedule?lang=en&latest=true'
            ];
            
            let matchFound = false;
            for (let url of espnEndpoints) {
                let { data } = await axios.get(url, { headers, timeout: 3000 });
                if (data && data.matches) {
                    for (let m of data.matches) {
                        // ESPN provides internal dates, we use this to lock the match!
                        if (currentMission.id) {
                            let mDate = new Date(m.startTime || m.startDate || "");
                            let mMonth = mDate.toLocaleString('en-US', { month: 'short' }).toLowerCase();
                            let mDay = mDate.getDate().toString();
                            let dateStr = `${mMonth} ${mDay}`;
                            if (dateStr !== currentMission.id) continue; 
                        }

                        let tNames = m.teams.map(t => (t.team.longName + " " + t.team.abbreviation).toLowerCase());
                        let fullTxt = tNames.join(" ") + " " + (m.title || "").toLowerCase();

                        // Now we only check if teams match! No date string needed in title.
                        if (matchesTeams(fullTxt)) {
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
    // SELLER 2: CREX HTML 
    // ==============================================================
    if (!isIntelSufficient()) {
        try {
            let crexData = {};
            let res = await axios.get('https://crex.com/series/indian-premier-league-2026-1PW/matches', { headers, timeout: 3500 });
            let $cx = cheerio.load(res.data);
            let bestCxUrl = null;
            let backupCxUrl = null;
            
            $cx('a').each((i, el) => {
                let href = $cx(el).attr('href') || "";
                let txt = ($cx(el).text() + " " + href).toLowerCase(); 
                let parentTxt = $cx(el).parent().parent().text().toLowerCase();
                let fullTxt = txt + " " + parentTxt;

                if (href.includes('cricket-live-score') || href.includes('match-details')) {
                    if (matchesTeams(fullTxt)) {
                        let fullUrl = href.startsWith('http') ? href : 'https://crex.com' + href;
                        if (currentMission.id && fullTxt.includes(currentMission.id)) bestCxUrl = fullUrl;
                        else if (!bestCxUrl) backupCxUrl = fullUrl; // Saves as backup if date is missing
                    }
                }
            });

            let cxMatchUrl = bestCxUrl || backupCxUrl;

            if (cxMatchUrl) {
                crexData.source_url = cxMatchUrl;
                crexData.source = "seller-2-crex";
                
                let mRes = await axios.get(cxMatchUrl, { headers, timeout: 4000 });
                let $m = cheerio.load(mRes.data);
                
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
    // SELLER 3: CRICBUZZ MOBILE
    // ==============================================================
    if (!isIntelSufficient()) {
        try {
            let cbData = {};
            const directories = [
                'https://m.cricbuzz.com/cricket-series/9241/indian-premier-league-2026/matches',
                'https://m.cricbuzz.com/cricket-match/live-scores'
            ];

            let bestCbUrl = null;
            let backupCbUrl = null;

            for (const dir of directories) {
                const { data: dirData } = await axios.get(dir, { headers, timeout: 3000 });
                const $d = cheerio.load(dirData);
                
                $d('a').each((i, el) => {
                    const href = $d(el).attr('href') || "";
                    const txt = $d(el).text().toLowerCase();
                    const parentTxt = $d(el).parent().parent().parent().text().toLowerCase();
                    const fullTxt = txt + " " + parentTxt;

                    if (href.includes('/live-cricket-scores/') || href.includes('/cricket-scores/')) {
                        if (matchesTeams(fullTxt)) {
                            let fullUrl = href.startsWith('http') ? href : 'https://m.cricbuzz.com' + href;
                            if (currentMission.id && fullTxt.includes(currentMission.id)) bestCbUrl = fullUrl;
                            else if (!bestCbUrl) backupCbUrl = fullUrl; 
                        }
                    }
                });
                if (bestCbUrl) break; 
            }

            let cbMatchUrl = bestCbUrl || backupCbUrl;

            if (cbMatchUrl) {
                let scorecardUrl = cbMatchUrl.replace('/live-cricket-scores/', '/live-cricket-scorecard/').replace('/cricket-scores/', '/live-cricket-scorecard/');
                let factsUrl = cbMatchUrl.replace('/live-cricket-scores/', '/cricket-match-facts/').replace('/cricket-scores/', '/cricket-match-facts/');
                
                cbData.source = "seller-3-cricbuzz-ledger";
                cbData.source_url = scorecardUrl;

                const [scRes, factsRes] = await Promise.allSettled([
                    axios.get(scorecardUrl, { headers, timeout: 4000 }),
                    axios.get(factsUrl, { headers, timeout: 4000 })
                ]);

                if (factsRes.status === 'fulfilled') {
                    const $f = cheerio.load(factsRes.value.data);
                    $f('div, span').each((i, el) => {
                        let text = $f(el).text().trim().replace(/\s+/g, ' ');
                        if (!cbData.venue && text.match(/^Venue\s*:/i)) cbData.venue = text.split(/Venue\s*:/i)[1].split(/•|Date|{/)[0].trim();
                        if (!cbData.toss && text.match(/^Toss\s*:/i)) cbData.toss = text.split(/Toss\s*:/i)[1].split(/•|Date|Time|{/)[0].trim();
                        if (!cbData.status && text.match(/^Result\s*:/i)) cbData.status = text.split(/Result\s*:/i)[1].trim();
                    });
                }

                if (scRes.status === 'fulfilled') {
                    const $m = cheerio.load(scRes.value.data);
                    
                    if (!cbData.status) {
                        let pageTitle = $m('title').text() || "";
                        let titleStatus = "";
                        pageTitle.split('|')[0].split('-').forEach(part => {
                            if (part.toLowerCase().includes('won by') || part.toLowerCase().includes('tied')) {
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
    // SELLER 4: RSS XML FEEDS 
    // ==============================================================
    if (!payload.source_url && (!payload.status || !payload.live_score)) {
        try {
            let xmlData = {};
            const { data: xmlBody } = await axios.get('https://www.espncricinfo.com/rss/livescores.xml', { timeout: 3000 });
            const $x = cheerio.load(xmlBody, { xmlMode: true });
            $x('item').each((i, el) => {
                const title = $x(el).find('title').text().toLowerCase();
                const desc = $x(el).find('description').text().toLowerCase();
                
                // NO DATE REQUIREMENT FOR XML (Just Team Names)
                if (matchesTeams(title + " " + desc)) {
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
    // FINAL FIREWALL & MATCH STATE ENGINE 
    // ==============================================================
    let lowerStatus = (payload.status || "").toLowerCase();
    
    // News Footer Protection
    let isFakeNewsResult = false;
    if (lowerStatus.includes('won by')) {
        if (!matchesTeams(lowerStatus)) isFakeNewsResult = true; 
    }

    if (isFakeNewsResult) {
        payload.status = "Pre-Match Standby";
        lowerStatus = "pre-match standby";
    }

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

    // ==============================================================
    // VERCEL NATIVE TIMEZONE COUNTDOWN ENGINE
    // ==============================================================
    if (rawDateStr && (payload.match_state === "standby" || payload.match_state === "pre-match" || payload.match_state === "delay")) {
        try {
            let monthStr = rawDateStr.split(' ')[0].trim(); 
            let dayStr = parseInt(rawDateStr.split(' ')[1]).toString(); 
            let timeMatch = rawDateStr.match(/\((.*?)\)/);
            if (timeMatch) {
                let timeStr = timeMatch[1]; 
                let isPM = timeStr.toUpperCase().includes("PM");
                let timeParts = timeStr.replace(/[a-zA-Z\s]/g, '').split(':');
                let hours = parseInt(timeParts[0]);
                if (isPM && hours !== 12) hours += 12;
                if (!isPM && hours === 12) hours = 0;
                let mins = parseInt(timeParts[1] || 0);
                
                let targetDate = new Date(`${monthStr} ${dayStr}, 2026 ${hours}:${mins}:00 GMT+0530`);
                let now = new Date(); 
                let diffMs = targetDate.getTime() - now.getTime();
                
                if (diffMs > 0 && diffMs < 86400000) { 
                    let hrs = Math.floor((diffMs % 86400000) / 3600000);
                    let m = Math.floor(((diffMs % 3600000) / 60000));
                    payload.countdown = `T-MINUS ${hrs}h ${m}m TO OPERATION`;
                    payload.match_state = "countdown";
                    
                    payload.live_score = "Awaiting Deployment";
                    if (!payload.status || payload.status === "Intel Gathering...") payload.status = "Pre-Match Standby";
                    payload.result = null; 
                }
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
