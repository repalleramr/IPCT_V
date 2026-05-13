const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async function (req, res) {
  // CORS & ANTI-CACHE ARMOR
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // 1. BULLETPROOF URL PARSER
  let targetTeams = "";
  try {
      if (req.query && req.query.teams) {
          targetTeams = req.query.teams;
      } else if (req.url && req.url.includes('teams=')) {
          targetTeams = decodeURIComponent(req.url.split('teams=')[1].split('&')[0]);
      }
      targetTeams = String(targetTeams).toLowerCase().replace(/\+/g, ' ').trim();
  } catch (e) {}

  if (!targetTeams || targetTeams === "undefined" || targetTeams === "null" || targetTeams === "vs") {
      return res.status(200).json({
          success: true,
          match_info: {
              title: "IPCT ERROR",
              live_score: "Uplink Failed",
              status: "No Teams Received from App",
              bowler: "N/A",
              last_balls: [],
              prediction: "Please re-select from Dropdown"
          },
          target: "https://www.cricbuzz.com"
      });
  }

  // IPCT Bidirectional Alias Dictionary
  const teamAliases = {
    "chennai": ["csk", "chennai"], "csk": ["csk", "chennai"],
    "delhi": ["dc", "delhi"], "dc": ["dc", "delhi"],
    "gujarat": ["gt", "gujarat"], "gt": ["gt", "gujarat"],
    "kolkata": ["kkr", "kolkata", "kol"], "kkr": ["kkr", "kolkata", "kol"],
    "lucknow": ["lsg", "lucknow"], "lsg": ["lsg", "lucknow"],
    "mumbai": ["mi", "mumbai"], "mi": ["mi", "mumbai"],
    "punjab": ["pbks", "punjab", "kings"], "pbks": ["pbks", "punjab", "kings"],
    "rajasthan": ["rr", "rajasthan"], "rr": ["rr", "rajasthan"],
    "royal": ["rcb", "royal", "bengaluru", "bangalore", "blr"], "rcb": ["rcb", "royal", "bengaluru", "bangalore", "blr"],
    "sunrisers": ["srh", "sunrisers", "hyderabad"], "srh": ["srh", "sunrisers", "hyderabad"]
  };

  try {
    const headers = { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };
    
    let team1 = targetTeams.split(' vs ')[0] ? targetTeams.split(' vs ')[0].trim().split(' ')[0] : "";
    let team2 = targetTeams.split(' vs ')[1] ? targetTeams.split(' vs ')[1].trim().split(' ')[0] : "";

    const t1A = teamAliases[team1] || [team1];
    const t2A = teamAliases[team2] || [team2];

    // --- PHASE 1: THE MULTI-NODE ARCHIVAL SCANNER ---
    const pagesToScan = [
        'https://www.cricbuzz.com/cricket-series/9241/indian-premier-league-2026/matches', // Active
        'https://www.cricbuzz.com/cricket-match/live-scores/recent-matches', // Recent Archive
        'https://www.cricbuzz.com/cricket-series/7607/indian-premier-league-2024/matches', // Deep Archive Testing
        'https://www.cricbuzz.com/' // Root Failsafe
    ];

    let activeMatchUrl = null;

    for (const url of pagesToScan) {
        if (activeMatchUrl) break; 
        try {
            const { data } = await axios.get(url, { headers });
            const $p = cheerio.load(data);
            
            $p('a').each((i, el) => {
                const href = $p(el).attr('href') || "";
                const text = $p(el).text().toLowerCase() + " " + href.toLowerCase();
                
                if (href.includes('cricket-score') || href.includes('match') || href.includes('live-cricket')) {
                    const matchT1 = t1A.some(a => a && text.includes(a));
                    const matchT2 = t2A.some(a => a && text.includes(a));
                    if (matchT1 && matchT2) {
                        activeMatchUrl = href.startsWith('http') ? href : 'https://www.cricbuzz.com' + href;
                        return false; 
                    }
                }
            });
        } catch (err) {}
    }

    if (!activeMatchUrl) {
      return res.status(200).json({
        success: true,
        match_info: {
          title: "IPCT STANDBY",
          live_score: "Intel Offline",
          status: "Match Not Found in Archive",
          bowler: "N/A",
          last_balls: [],
          prediction: `Scanned all nodes for: ${t1A[0]} & ${t2A[0]}`
        },
        target: pagesToScan[0]
      });
    }

    // --- PHASE 2: DEEP MATCH SCRAPE ---
    // Do not force /live-cricket-scores/ replacement. Let Cricbuzz route to the correct archive tab naturally.
    let commUrl = activeMatchUrl;

    const { data: matchHtml } = await axios.get(commUrl, { headers });
    const $m = cheerio.load(matchHtml);

    // 1. Fetch exact status text
    let statusText = $m('.cb-text-complete, .cb-status-msg, .cb-text-live, .cb-min-stts, .cb-text-preview, .cb-nav-subhdr').first().text().trim();
    if (!statusText) statusText = $m('.text-gray').first().text().trim() || "Status Unknown";

    // 2. Check if the match is completely over
    let isComplete = $m('.cb-text-complete').length > 0 || 
                     $m('.cb-status-msg').length > 0 || 
                     statusText.toLowerCase().includes('won by') || 
                     statusText.toLowerCase().includes('result') || 
                     statusText.toLowerCase().includes('beat') ||
                     statusText.toLowerCase().includes('tied');

    // 3. Extract the Live Score directly
    let scoreStr = "";
    let batScore = $m('.cb-min-bat-rw').first().text().trim(); 
    if (!batScore) batScore = $m('.ui-bat-team-scores').first().text().trim(); // Failsafe for alternative mobile view

    if (batScore) {
        scoreStr = batScore.replace(/\s+/g, ' '); // Clean up extra spaces
    } else if (isComplete) {
        scoreStr = "Match Ended";
    } else {
        scoreStr = "Pre-Match Intel";
    }

    // 4. Extract Bowler or Active Status
    let bowlerStr = "N/A";
    if (isComplete) {
        bowlerStr = "Match Concluded";
    } else if (batScore) {
        const bRow = $m('.cb-min-bwl-rw').first();
        if (bRow.length > 0) {
            const name = bRow.find('a').first().text().trim();
            const stats = bRow.text().replace(name, '').replace(/\s+/g, ' ').trim();
            bowlerStr = name ? `${name} (${stats})` : "Active Play";
        } else {
            bowlerStr = "Innings Break / Active";
        }
    } else {
        bowlerStr = "Toss Pending / Countdown Active";
    }

    // 5. Extract Recent Balls
    let ballHistory = [];
    $m('.cb-col-10.cb-font-12, .cb-col.cb-col-8.cb-mtch-blt, .cb-ovr-bl').each((i, el) => {
      if (i < 12) ballHistory.push($m(el).text().trim());
    });

    if (isComplete && ballHistory.length === 0) {
        ballHistory = ["E", "N", "D"];
    }

    // --- PHASE 3: ORACLE LOGIC & OUTPUT ---
    let predStr = "Waiting for Toss";
    if (isComplete) {
        predStr = "Mission Accomplished";
    } else if (batScore && ballHistory.length > 0) {
        let runs = 0, wkts = 0;
        ballHistory.slice(0, 6).forEach(b => {
          if (b === 'W') wkts++;
          else if (!isNaN(b)) runs += parseInt(b);
        });
        predStr = runs > 12 ? "AGGRESSIVE: Momentum with Bat." : (wkts > 0 ? "CAUTION: Wicket Pattern Detected." : "STABLE: Standard Play.");
    }

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      match_info: {
        title: isComplete ? "MISSION ACCOMPLISHED" : "IPCT TARGET LOCKED",
        live_score: scoreStr,
        status: statusText,
        bowler: bowlerStr,
        last_balls: ballHistory,
        prediction: predStr
      },
      target: commUrl
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
