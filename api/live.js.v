const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async function (req, res) {
  // --- AGGRESSIVE ANTI-CACHING ARMOR ---
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.method === 'OPTIONS') return res.status(200).end();

  let targetUrl = req.query.url || "";
  let targetTeams = (req.query.teams || "").toLowerCase().trim();
  let rawDateStr = req.query.time || "";
  
  // ==========================================
  // TELEMETRY BRIDGE (LEDGER DATA)
  // ==========================================
  let e1 = parseFloat(req.query.e1) || 0; // Exposure Team 1
  let e2 = parseFloat(req.query.e2) || 0; // Exposure Team 2
  let t1Name = (req.query.t1 || "Team A").toUpperCase().trim();
  let t2Name = (req.query.t2 || "Team B").toUpperCase().trim();
  let userPosition = (req.query.position || "NONE").toUpperCase().trim();

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 13; SM-G991U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
  };

  let payload = {
    title: "TARGET UNKNOWN", status: "Scanning Fields...", match_state: "standby", winner: "PENDING",
    live_score: "NO SCORE", current_rr: "NO CRR", required_rr: "NO REQ",
    striker: "NO STRIKER", non_striker: "NO NON-STRIKER", bowler: "NO BOWLER",
    toss: "NO TOSS DATA", venue: "VENUE HIDDEN", last_over: ["-", "-", "-", "-", "-", "-"],
    prediction: "AI OFFLINE", match_prediction: "", ledger_analysis: "AWAITING TELEMETRY", source_url: "Hunting...", fetch_code: "OH"
  };

  let pageTitle = ""; let bodyText = ""; let espnMatchData = null; let $ = null;

  const teamAliases = {
    "chennai": ["csk", "chennai", "super kings"], "lucknow": ["lsg", "lucknow", "super giants"],
    "mumbai": ["mi", "mumbai", "indians"], "punjab": ["pbks", "punjab", "kings"],
    "delhi": ["dc", "delhi", "capitals"], "gujarat": ["gt", "gujarat", "titans"],
    "kolkata": ["kkr", "kolkata", "knight riders"], "rajasthan": ["rr", "rajasthan", "royals"],
    "royal": ["rcb", "bengaluru", "bangalore", "challengers"], "sunrisers": ["srh", "hyderabad", "sunrisers"]
  };

  const venueProfiles = {
    "chennai": { type: "Spin/Slow", par: 165 }, "chidambaram": { type: "Spin/Slow", par: 165 },
    "lucknow": { type: "Sluggish/Grip", par: 160 }, "ekana": { type: "Sluggish/Grip", par: 160 },
    "mumbai": { type: "Batting Paradise", par: 195 }, "wankhede": { type: "Batting Paradise", par: 195 },
    "ahmedabad": { type: "Balanced/Pace", par: 180 }, "modi": { type: "Balanced/Pace", par: 180 },
    "bengaluru": { type: "Flat/Small Boundaries", par: 200 }, "bangalore": { type: "Flat/Small Boundaries", par: 200 },
    "chinnaswamy": { type: "Flat/Small Boundaries", par: 200 },
    "kolkata": { type: "Pace/Bounce", par: 185 }, "eden": { type: "Pace/Bounce", par: 185 },
    "jaipur": { type: "Balanced/Large", par: 175 }, "mansingh": { type: "Balanced/Large", par: 175 },
    "delhi": { type: "Flat Deck", par: 195 }, "jaitley": { type: "Flat Deck", par: 195 },
    "hyderabad": { type: "Flat/True Bounce", par: 195 }, "rajiv": { type: "Flat/True Bounce", par: 195 },
    "punjab": { type: "Pace/Bounce", par: 175 }, "mullanpur": { type: "Pace/Bounce", par: 175 },
    "mohali": { type: "Pace/Bounce", par: 175 }
  };

  const homeVenues = {
    "csk": "M.A. Chidambaram Stadium, Chennai", "lsg": "Ekana Cricket Stadium, Lucknow",
    "mi": "Wankhede Stadium, Mumbai", "pbks": "Mullanpur / Mohali",
    "dc": "Arun Jaitley Stadium, Delhi", "gt": "Narendra Modi Stadium, Ahmedabad",
    "kkr": "Eden Gardens, Kolkata", "rr": "Sawai Mansingh Stadium, Jaipur",
    "rcb": "M. Chinnaswamy Stadium, Bengaluru", "srh": "Rajiv Gandhi Intl Stadium, Hyderabad"
  };

  function escapeRegExp(str) { return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function extractCrexTrueOdds(text) {
    if (!text || typeof text !== "string") return null;
    const flat = text.replace(/\s+/g, " ").replace(/[()\[\]]/g, " ");
    const teamMap = {
      "csk": ["csk", "chennai super kings", "chennai", "super kings"],
      "lsg": ["lsg", "lucknow super giants", "lucknow", "super giants"],
      "mi": ["mi", "mumbai indians", "mumbai", "indians"],
      "pbks": ["pbks", "punjab kings", "punjab", "kings"],
      "dc": ["dc", "delhi capitals", "delhi", "capitals"],
      "gt": ["gt", "gujarat titans", "gujarat", "titans"],
      "kkr": ["kkr", "kolkata knight riders", "kolkata", "knight riders"],
      "rr": ["rr", "rajasthan royals", "rajasthan", "royals"],
      "rcb": ["rcb", "royal challengers bengaluru", "royal challengers bangalore", "royal", "bengaluru", "bangalore", "challengers"],
      "srh": ["srh", "sunrisers hyderabad", "sunrisers", "hyderabad"]
    };

    for (const code of Object.keys(teamMap)) {
      const re = new RegExp(`\\b${code.toUpperCase()}\\b[^0-9]{0,40}(\\d{1,3})[\\s\\-]+(\\d{1,3})\\b`, "i");
      const m = flat.match(re);
      if (m) {
        const a = parseInt(m[1], 10); const b = parseInt(m[2], 10);
        if (a > 0 && b > 0 && a <= 150 && b <= 150 && Math.abs(a - b) <= 4) {
          return { team: code.toUpperCase(), back: Math.min(a, b), lay: Math.max(a, b), raw: m[0] };
        }
      }
    }
    for (const [code, aliases] of Object.entries(teamMap)) {
      for (const alias of aliases) {
        const re = new RegExp(`\\b${escapeRegExp(alias)}\\b[^0-9]{0,40}(\\d{1,3})[\\s\\-]+(\\d{1,3})\\b`, "i");
        const m = flat.match(re);
        if (m) {
          const a = parseInt(m[1], 10); const b = parseInt(m[2], 10);
          if (a > 0 && b > 0 && a <= 150 && b <= 150 && Math.abs(a - b) <= 4) {
            return { team: code.toUpperCase(), back: Math.min(a, b), lay: Math.max(a, b), raw: m[0] };
          }
        }
      }
    }
    return null;
  }

  let t1 = targetTeams.split(' vs ')[0]?.trim().split(' ')[0] || "unknown";
  let t2 = targetTeams.split(' vs ')[1]?.trim().split(' ')[0] || "unknown";
  const t1A = teamAliases[t1] || [t1]; const t2A = teamAliases[t2] || [t2];

  function matchesTeams(txt) {
    if (!txt) return false;
    return t1A.some(a => txt.includes(a)) && t2A.some(a => txt.includes(a));
  }

  // =========================================================================
  // CORE SCRAPER ENGINE (PRESERVED EXACTLY AS VERIFIED)
  // =========================================================================
  try {
    let htmlAcquired = false; let timestampBuster = Date.now();

    if (!htmlAcquired) {
      try {
        let crexUrl = (targetUrl.includes('crex.com') || targetUrl.includes('crex.live')) ? targetUrl : "";
        if (!crexUrl && targetTeams) {
          const cxRes = await axios.get(`https://crex.com/fixtures/match-list?_t=${timestampBuster}`, { headers, timeout: 2500 });
          const $temp = cheerio.load(cxRes.data);
          $temp('a').each((i, el) => {
            let txt = $temp(el).text().toLowerCase(); let href = $temp(el).attr('href') || ""; let strictTeamCheck = txt + " " + href;
            if ((txt.includes('ipl') || txt.includes('indian premier league')) && (href.includes('score') || href.includes('match-updates')) && matchesTeams(strictTeamCheck)) {
              crexUrl = href.startsWith('http') ? href : 'https://crex.com' + href;
            }
          });
        }
        if (crexUrl) {
          let fetchUrl = crexUrl.includes('?') ? `${crexUrl}&_t=${timestampBuster}` : `${crexUrl}?_t=${timestampBuster}`;
          const cRes = await axios.get(fetchUrl, { headers, timeout: 3000 });
          $ = cheerio.load(cRes.data); $('script, style, noscript').remove();
          pageTitle = $('title').text() || ""; 
          let rawHtml = $('body').html() || "";
          rawHtml = rawHtml.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&');
          bodyText = rawHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          payload.source_url = "CREX (Tier 1 Speed)"; htmlAcquired = true;
        }
      } catch (e) { }
    }

    if (!htmlAcquired) {
      try {
        let cbUrl = targetUrl.includes('cricbuzz') ? targetUrl.replace('www.cricbuzz.com', 'm.cricbuzz.com') : "";
        if (!cbUrl && targetTeams) {
          const searchDirs = [
            `https://m.cricbuzz.com/cricket-match/live-scores?_t=${timestampBuster}`,
            `https://m.cricbuzz.com/cricket-match/live-scores/upcoming?_t=${timestampBuster}`
          ];
          for (let dir of searchDirs) {
            const res = await axios.get(dir, { headers, timeout: 2500 });
            const $temp = cheerio.load(res.data);
            $temp('a').each((i, el) => {
              let txt = $temp(el).text().toLowerCase(); let href = $temp(el).attr('href') || ""; let parentTxt = $temp(el).parent().parent().text().toLowerCase();
              if ((href.includes('indian-premier-league') || parentTxt.includes('ipl')) && href.match(/\/\d{4,}\//) && matchesTeams(txt + " " + href) && href.includes('scores')) cbUrl = 'https://m.cricbuzz.com' + href;
            });
            if (cbUrl) break;
          }
        }
        if (cbUrl) {
          cbUrl = cbUrl.replace('www.', 'm.').replace('/live-cricket-scorecard/', '/cricket-scores/');
          let fetchUrl = cbUrl.includes('?') ? `${cbUrl}&_t=${timestampBuster}` : `${cbUrl}?_t=${timestampBuster}`;
          const cbRes = await axios.get(fetchUrl, { headers, timeout: 3500 });
          $ = cheerio.load(cbRes.data); $('script, style, noscript').remove();
          pageTitle = $('title').text() || ""; 
          let rawHtml = $('body').html() || "";
          rawHtml = rawHtml.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&');
          bodyText = rawHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          payload.source_url = "CRICBUZZ (Tier 2 Failsafe)"; htmlAcquired = true;
        }
      } catch (e) { }
    }

    if (!htmlAcquired) {
      try {
        const espnRes = await axios.get(`https://hs-consumer-api.espncricinfo.com/v1/pages/matches/current?_t=${timestampBuster}`, { headers, timeout: 3000 });
        espnMatchData = espnRes.data.matches.find(m => {
          let isIPL = (m.series?.name?.toLowerCase().includes('ipl') || m.title.toLowerCase().includes('ipl'));
          return isIPL && matchesTeams(m.title.toLowerCase() + " " + m.teams.map(t => t.team.abbreviation).join(" ").toLowerCase());
        });
        if (espnMatchData) {
          pageTitle = espnMatchData.title; bodyText = espnMatchData.statusText + " " + (espnMatchData.tossResults?.text || "");
          payload.source_url = "ESPN (Tier 3 Failsafe)"; htmlAcquired = true;
        }
      } catch (e) { }
    }

    payload.fetch_code = htmlAcquired ? "UREKHA" : "OH";

    if (!htmlAcquired) {
      payload.status = "UPLINK FAILED: ALL TARGETS BLOCKED"; payload.title = "UPLINK FAILED";
      return res.status(200).json({ success: true, match_info: payload });
    }

    try {
      let finalTitle = "";
      let vsMatch = pageTitle.match(/([a-zA-Z0-9\s]+?\s+(?:vs|v)\s+[a-zA-Z0-9\s]+)/i);
      if (!vsMatch) vsMatch = bodyText.match(/([a-zA-Z0-9\s]+?\s+(?:vs|v)\s+[a-zA-Z0-9\s]+)/i);

      if (vsMatch) finalTitle = vsMatch[1];
      else if (targetTeams) finalTitle = targetTeams;
      else if (pageTitle && pageTitle.length > 5) finalTitle = pageTitle.split(/[,|]/)[0];

      if (finalTitle) payload.title = finalTitle.replace(/live score/i, '').replace(/live/i, '').replace(/cricket/i, '').trim().toUpperCase();
      else payload.title = "LIVE MATCH ACTIVE";

      let venueMatch = bodyText.match(/Venue\s*:\s*([^•|{]+)/i) || (espnMatchData && espnMatchData.ground ? [null, espnMatchData.ground.name] : null);
      if (venueMatch) {
        payload.venue = venueMatch[1].trim();
      } else {
        let homeCode = t1A[0];
        if (homeVenues[homeCode]) {
          payload.venue = homeVenues[homeCode];
        }
      }

      let statusText = $ ? $('.cb-status-msg, .match-status, .info-status, .cb-text-complete').first().text().trim() : "";
      let titleWin = pageTitle.match(/([a-zA-Z\s\-]+won by\s\d+\s(?:runs|wickets|run|wicket))/i);
      if (!statusText && titleWin) statusText = titleWin[1].trim();
      else if (espnMatchData) statusText = espnMatchData.statusText;
      if (statusText) payload.status = statusText;

      let statusLower = (statusText || "").toLowerCase();
      let isLiveScoreFormat = bodyText.match(/[A-Z]{2,4}\s\d+[\/\-]\d+/);

      if (statusLower.includes('won by') || statusLower.includes('tied') || statusLower.includes('abandoned')) {
        payload.match_state = "completed";
        if (statusLower.includes('won by')) {
          let winMatch = statusText.match(/^(.*?)\s+won by/i);
          if (winMatch) { payload.winner = winMatch[1].trim(); }
        } else if (statusLower.includes('tied')) { payload.winner = "TIED"; } 
        else { payload.winner = "NO RESULT"; }
      } else if (isLiveScoreFormat && (bodyText.includes('CRR:') || bodyText.includes('REQ:') || bodyText.match(/Players Entering/i) || (espnMatchData && espnMatchData.status === "Live"))) {
        payload.match_state = "live";
      } else {
        payload.match_state = "future";
      }
    } catch (e) { payload.match_state = "standby"; }

    try {
      let tossResult = "";
      if ($) tossResult = $('.cb-toss-sts, .toss-result, .match-info-toss, .toss, .toss-text, .match-detail-toss').first().text().trim();
      if (!tossResult) {
        let tossMatch = bodyText.match(/([A-Za-z\s\.\-]+(?:won the toss|opt(?:ed|s)? to|elect(?:ed|s)? to|chose to|decided to)\s(?:bat|bowl|field)(?:\sfirst)?)/i);
        if (!tossMatch) tossMatch = bodyText.match(/Toss\s*:\s*([^•|{\(]+)/i);
        if (tossMatch) tossResult = tossMatch[1].trim();
      }
      if (!tossResult && espnMatchData && espnMatchData.tossResults) tossResult = espnMatchData.tossResults.text;
      if (tossResult && tossResult.length > 5 && tossResult.length < 100) payload.toss = tossResult;
      else payload.toss = "Tracking Toss Data...";
    } catch (e) { payload.toss = "Toss Error"; }

    let isRealMarket = false;
    let favTeam = ""; let favPaise = 0; let layPaise = 0; let displayOdds = "N/A";
    let isWeatherInterrupted = false;
    let isChase = false;

    if (payload.match_state === "live") {
      try {
        if (payload.status === "Scanning Fields..." || payload.status === "") {
          if (bodyText.match(/innings break/i)) payload.status = "Innings Break";
          else if (bodyText.match(/strategic timeout/i)) payload.status = "Strategic Timeout";
          else if (bodyText.match(/rain stop/i) || bodyText.match(/delay/i)) payload.status = "Weather/Delay Protocol";
          else if (bodyText.match(/Players Entering/i)) payload.status = "Players Entering";
          else payload.status = "Live Match Active";
        }
      } catch (e) { payload.status = "Status Error"; }

      try {
        let scoreRegex = /([A-Z]{2,4}\s\d+[\/\-]\d+\s*\(?\d+\.\d+\)?)/;
        let scoreMatch = pageTitle.match(scoreRegex);
        if (!scoreMatch) scoreMatch = bodyText.match(scoreRegex);

        if (scoreMatch) {
          let rawScore = scoreMatch[1];
          let parts = rawScore.match(/([A-Z]{2,4})\s*(\d+)[\/\-](\d+)\s*\(?([\d\.]+)\)?/);
          if (parts) payload.live_score = `${parts[1]} ${parts[2]}/${parts[3]} (${parts[4]})`;
          else payload.live_score = rawScore.replace('-', '/');
        } else if (espnMatchData) {
          payload.live_score = `${espnMatchData.teams[0].score || ''} vs ${espnMatchData.teams[1].score || ''}`;
        }
      } catch (e) { payload.live_score = "Score Error"; }

      try {
        let crrMatch = bodyText.match(/CRR:\s*([\d\.]+)/i);
        if (crrMatch) payload.current_rr = crrMatch[1];
        let reqMatch = bodyText.match(/(?:REQ|RRR|Req RR)\s*[:-]?\s*([\d\.]+)/i);
        if (reqMatch) payload.required_rr = reqMatch[1];
        else {
          if (espnMatchData && espnMatchData.liveInning && espnMatchData.liveInning.requiredRunRate) payload.required_rr = espnMatchData.liveInning.requiredRunRate.toString();
          else payload.required_rr = "1st Innings";
        }
      } catch (e) { payload.current_rr = "Error"; payload.required_rr = "Error"; }

      try {
        let b1Full = ""; let b2Full = "";
        let titleBatterRegex = /\(([A-Za-z\s\.\-']+?\s*\d{1,3}\s*\(\s*\d{1,3}\s*\))(?:\s*,\s*([A-Za-z\s\.\-']+?\s*\d{1,3}\s*\(\s*\d{1,3}\s*\)))?\)/;
        let titleMatch = pageTitle.match(titleBatterRegex);

        if (titleMatch && titleMatch[1]) {
          b1Full = titleMatch[1].trim(); b2Full = titleMatch[2] ? titleMatch[2].trim() : "";
        } else {
          let safeText = bodyText.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([a-zA-Z])(\d)/g, '$1 $2');
          let batIdx = safeText.lastIndexOf("Batter");
          if (batIdx === -1) batIdx = safeText.search(/Batsman/i);
          let searchArea = batIdx !== -1 ? safeText.substring(batIdx, batIdx + 300) : safeText;

          let batterRegex = /([A-Z][a-zA-Z\s\.\-']{2,25}?)\s+(\d{1,3})\s*\(\s*(\d{1,3})\s*\)/g;
          let matches = [...searchArea.matchAll(batterRegex)];
          let validBatters = [];

          matches.forEach(m => {
            let nameOnly = m[1].replace(/[A-Z]{3,}/g, '').trim();
            let words = nameOnly.split(/\s+/);
            nameOnly = words.slice(-2).join(' ');
            if (nameOnly.length > 2 && !nameOnly.toLowerCase().includes('total')) validBatters.push(`${nameOnly} ${m[2]}(${m[3]})`);
          });

          if (validBatters.length > 0) { b1Full = validBatters[0]; if (validBatters.length > 1) b2Full = validBatters[1]; }
        }

        if (b1Full) {
          let name1 = b1Full.match(/([A-Za-z\s\.\-']+)/)[1].trim();
          let name2 = b2Full ? b2Full.match(/([A-Za-z\s\.\-']+)/)[1].trim() : "";
          let isN1Striker = true;
          let safeText = bodyText.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([a-zA-Z])(\d)/g, '$1 $2');
          let tableHeaderMatch = safeText.match(/(?:Batter|Batsman)\s+R\(B\)\s+4[Ss]\s+6[Ss]\s+S\.?R\.?\s+([A-Za-z\s\.\-']+?)\s+\d/i);

          if (tableHeaderMatch && tableHeaderMatch[1]) {
            let topNameInTable = tableHeaderMatch[1].trim().toLowerCase();
            let n1LastWord = name1.split(' ').pop().toLowerCase();
            let n2LastWord = name2 ? name2.split(' ').pop().toLowerCase() : "xyz";
            if (topNameInTable.includes(n2LastWord) && !topNameInTable.includes(n1LastWord)) { isN1Striker = false; }
          }

          if (isN1Striker) {
            payload.striker = b1Full + " 🏏"; payload.non_striker = b2Full || "Off-Strike";
          } else {
            payload.striker = b1Full; payload.non_striker = b2Full + " 🏏";
          }
        } else { payload.striker = "Target Engaged"; payload.non_striker = "Off-Strike"; }

        if (payload.live_score && payload.live_score.includes('0/0 (0.0)')) { payload.striker = "Awaiting Batters"; payload.non_striker = "Standby"; }
      } catch (e) { payload.striker = "Extractor Error"; payload.non_striker = "Extractor Error"; }

      try {
        let safeText = bodyText.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([a-zA-Z])(\d)/g, '$1 $2');
        let bowIdx = safeText.search(/Bowler/i);
        let bowArea = bowIdx !== -1 ? safeText.substring(bowIdx, bowIdx + 200) : safeText;
        let bowMatch = bowArea.match(/([A-Z][a-zA-Z\s\.\-']{2,25}?)\s+(\d{1,2}\s*\-\s*\d{1,3}|\d{1,2}\s*\.\s*\d{1,2}\s+\d)/);

        if (bowMatch && bowMatch[1]) {
          let name = bowMatch[1].replace(/(Econ|ECO|Overs|Runs|Wickets|Bowler|IMP)/gi, '').replace(/[A-Z]{3,}/g, '').trim();
          let words = name.replace(/\s+/g, ' ').trim().split(' ');
          payload.bowler = words.slice(-2).join(' ');
        } else { payload.bowler = "Active Bowler"; }

        if (payload.live_score && payload.live_score.includes('0/0 (0.0)')) payload.bowler = "Awaiting Bowler";
      } catch (e) { payload.bowler = "Extractor Error"; }

      try {
        let recentTextMatch = bodyText.match(/Recent\s*:\s*([W0-9NbLwd|\s]+)/i);
        if (recentTextMatch) {
          payload.last_over = recentTextMatch[1].split(/[|\s]+/).filter(b => b.trim()).slice(-6);
        } else {
          let overMatches = [...bodyText.matchAll(/Over\s+\d+\s+([W0-9Nbwd\s]+?)(?:Over|=|$)/gi)];
          if (overMatches.length > 0) {
            let lastOverStr = overMatches[overMatches.length - 1][1];
            let arr = lastOverStr.split(/\s+/).filter(b => b.trim() && !b.includes('='));
            payload.last_over = arr.slice(-6);
            if (payload.last_over.length === 0) payload.last_over = ["-", "-", "-", "-", "-", "-"];
          } else { payload.last_over = ["-", "-", "-", "-", "-", "-"]; }
        }
      } catch (e) { payload.last_over = ["E", "R", "R", "O", "R", "!"]; }

      // ==========================================================
      // ODDS SNIPER (PRESERVED)
      // ==========================================================
      try {
        if (payload.live_score.includes('/')) {
          let scoreMatchClean = payload.live_score.match(/(\d+)[\/\-](\d+)\s*\(?([\d\.]+)\)?/);

          if (scoreMatchClean) {
            let runs = parseInt(scoreMatchClean[1]); let wkts = parseInt(scoreMatchClean[2]);
            let oversSplit = scoreMatchClean[3].split('.');
            let overs = parseInt(oversSplit[0]); let balls = oversSplit[1] ? parseInt(oversSplit[1]) : 0;
            let totalBalls = (overs * 6) + balls;

            let crr = parseFloat(payload.current_rr);
            if (isNaN(crr) || totalBalls === 0) crr = 8.5;

            let isWeatherInterrupted = (payload.status.toLowerCase().includes('rain') || payload.status.toLowerCase().includes('weather') || payload.status.toLowerCase().includes('dls'));

            if (payload.required_rr !== "1st Innings" && payload.required_rr !== "Error") { 
              if (isWeatherInterrupted) payload.prediction = `🔴 DLS PROTOCOL ACTIVE | HALT PHASE BETS`;
              else payload.prediction = `CHASE ORACLE | PHASE MARKETS CLOSED (1st Innings Only)`; 
            } else {
              let phaseTactic = ""; let projections = []; let milestones = [6, 10, 15, 20];

              if (isWeatherInterrupted) {
                phaseTactic = "🔴 HARD STOP - RAIN DELAY (Targets Subject to Change)";
              } else if (totalBalls === 0) {
                projections = ["[6v: 48]", "[10v: 85]", "[15v: 135]", "[20v: 180]"];
                phaseTactic = "🟡 HOLD - MATCH INITIATING";
              } else {
                for (let m of milestones) {
                  if (overs < m) {
                    let oversLeft = m - (overs + (balls / 6));
                    let projected = Math.floor(runs + (oversLeft * crr));
                    if (wkts >= 8) projected = Math.min(projected, runs + 10);
                    projections.push(`[${m}v: ${projected}]`);
                  }
                }
              }

              if (projections.length > 0 && !isWeatherInterrupted) payload.prediction = `TARGETS: ${projections.join(' ')}`;
              else if (isWeatherInterrupted) payload.prediction = `INNINGS HALTED`;
              else payload.prediction = `INNINGS ENDING`;
            }

            // MARKET EXTRACTION
            const teamMap = {
              "chennai super kings": "CSK", "csk": "CSK", "chennai": "CSK",
              "lucknow super giants": "LSG", "lsg": "LSG", "lucknow": "LSG",
              "mumbai indians": "MI", "mi": "MI", "mumbai": "MI",
              "punjab kings": "PBKS", "pbks": "PBKS", "punjab": "PBKS",
              "delhi capitals": "DC", "dc": "DC", "delhi": "DC",
              "gujarat titans": "GT", "gt": "GT", "gujarat": "GT",
              "kolkata knight riders": "KKR", "kkr": "KKR", "kolkata": "KKR",
              "rajasthan royals": "RR", "rr": "RR", "rajasthan": "RR",
              "royal challengers bengaluru": "RCB", "royal challengers bangalore": "RCB", "rcb": "RCB", "bengaluru": "RCB",
              "sunrisers hyderabad": "SRH", "srh": "SRH", "hyderabad": "SRH"
            };

            let crexOdds = null;
            if (payload.source_url && payload.source_url.toLowerCase().includes("crex")) {
              crexOdds = extractCrexTrueOdds(pageTitle) || extractCrexTrueOdds(bodyText);
            }

            let displayOdds = "N/A";
            if (crexOdds && crexOdds.team && crexOdds.back && crexOdds.lay) {
              favTeam = crexOdds.team; favPaise = crexOdds.back; layPaise = crexOdds.lay;
              displayOdds = `${favPaise}-${layPaise}`; isRealMarket = true;
            } else {
              let teamsPattern = Object.keys(teamMap).join('|');
              let oddsRegex = new RegExp(`(${teamsPattern})[\\s\\W]*?(\\d{1,3})\\s+(\\d{1,3})\\b(?!\\s*[-/\\(\\)])`, 'i');
              let numViewMatch = bodyText.match(oddsRegex);
              if (numViewMatch && numViewMatch[1]) {
                let matchedTeam = numViewMatch[1].toLowerCase();
                let p1 = parseInt(numViewMatch[2]); let p2 = parseInt(numViewMatch[3]);
                if (Math.abs(p1 - p2) <= 3 && p1 > 0 && p2 < 100) {
                  favTeam = teamMap[matchedTeam] || matchedTeam.toUpperCase();
                  favPaise = p1; layPaise = p2; displayOdds = `${favPaise}-${layPaise}`;
                  isRealMarket = true;
                }
              }
            }

            let matchTactic = isRealMarket ? `[LIVE MARKET ODDS] ${favTeam} is Favorite at ${displayOdds} Paise` : `[AWAITING MARKET ODDS] Market Offline.`;
            payload.match_prediction = matchTactic;
          }
        }
      } catch (e) { payload.match_prediction = "Error"; }
    } else if (payload.match_state === "completed" || payload.match_state === "future") {
      payload.live_score = payload.match_state === "completed" ? "Match Ended" : "Match Not Started";
    }

    // =========================================================================
    // [ADD-ON: HUMAN INTUITION MATRIX] (Isolated Safely)
    // Extracts momentum and live pitch behavior using verified payload data.
    // =========================================================================
    try {
        if (payload.match_state === "live" && payload.live_score.includes('/')) {
            let scoreMatchClean = payload.live_score.match(/(\d+)[\/\-](\d+)\s*\(?([\d\.]+)\)?/);
            if (scoreMatchClean) {
                let runs = parseInt(scoreMatchClean[1]); 
                let wkts = parseInt(scoreMatchClean[2]);
                let oversSplit = scoreMatchClean[3].split('.');
                let overs = parseInt(oversSplit[0]); 
                let balls = oversSplit[1] ? parseInt(oversSplit[1]) : 0;
                let totalBalls = (overs * 6) + balls;
                
                let crr = parseFloat(payload.current_rr);
                if (isNaN(crr) || totalBalls === 0) crr = 8.5;

                // Calculate recent RR
                let recentRuns = 0; let validBalls = 0; let recentWicketFell = false;
                if (Array.isArray(payload.last_over)) {
                    payload.last_over.forEach(b => {
                        if (b === 'W') { recentWicketFell = true; validBalls++; }
                        else if (b === 'Wd' || b === 'Nb') recentRuns += 1;
                        else if (!isNaN(parseInt(b))) { recentRuns += parseInt(b); validBalls++; }
                    });
                }
                let recentRR = validBalls > 0 ? (recentRuns / validBalls) * 6 : crr;

                let pitchProfile = "Balanced/Standard";
                for (let key in venueProfiles) {
                    if (payload.venue.toLowerCase().includes(key)) {
                        pitchProfile = venueProfiles[key].type; break;
                    }
                }

                let livePitchRead = pitchProfile;
                let momentum = "Neutral";

                if (totalBalls >= 30) { 
                    if (crr > 9.5 && wkts <= 2) {
                        livePitchRead = "Flat/Batting Paradise (Playing better than historical par)";
                        momentum = "Batters Dictating Terms";
                    } else if (crr < 7.0 && wkts >= 3) {
                        livePitchRead = "Sluggish/Grip (Bowlers extracting heavy movement/spin)";
                        momentum = "Bowlers Choking Run Flow";
                    } else if (recentRR > crr + 2.0) {
                        momentum = "Violent Batting Acceleration";
                    } else if (recentRR < crr - 2.5 || recentWicketFell) {
                        momentum = "Bowlers Executing Squeeze";
                    } else {
                        livePitchRead = pitchProfile + " (Playing true to historical par)";
                        momentum = "Standard Accumulation";
                    }
                } else {
                    livePitchRead = pitchProfile + " (Assessing live conditions...)";
                    momentum = "Powerplay Settling";
                }

                // Append to existing match_prediction instead of overwriting
                let chaseContext = "";
                let isChasePhase = (payload.required_rr && !payload.required_rr.includes("REQ") && payload.required_rr !== "1st Innings" && payload.required_rr !== "Error");
                if (isChasePhase) {
                    let rrrVal = parseFloat(payload.required_rr) || 0;
                    if (livePitchRead.includes("Sluggish") && rrrVal > 9.0) chaseContext = " ⚠️ TOXIC CHASE (Avoid Backing)";
                    else if (livePitchRead.includes("Flat") && rrrVal < 10.5) chaseContext = " 🔥 VIABLE CHASE";
                }

                payload.match_prediction += `\n[LIVE PITCH] ${livePitchRead}\n[MOMENTUM] ${momentum}${chaseContext}`;
            }
        }
    } catch (err) {
        console.log("Human Intuition Module skipped.");
    }

    // =========================================================================
    // [ADD-ON: QUANTUM HEDGE ENGINE] (Isolated Safely)
    // Calculates Green Book exit points based on frontend Ledger parameters
    // =========================================================================
    try {
        let aiAdvice = "";

        if (!isRealMarket || payload.match_state !== "live") {
             aiAdvice = `[HEDGE OFFLINE] Awaiting live market odds and active match state.`;
        } else {
             // Case 1: You have NO bets (e1 and e2 are 0) - Generate ENTRY Point
             if (e1 === 0 && e2 === 0) {
                 aiAdvice = `[ENTRY PROTOCOL] No active ledger detected.\n`;
                 if (favPaise <= 35) {
                     aiAdvice += `> Market heavily favors ${favTeam} (${favPaise}p). Good risk-reward to EAT (Lay) ${favTeam} with a small stake for a wicket spike.`;
                 } else if (favPaise > 35 && favPaise < 60) {
                     aiAdvice += `> Market is unstable (${favPaise}p). WAIT for odds to drop below 35p or spike above 75p before taking a position.`;
                 } else {
                     aiAdvice += `> Match is balanced (${favPaise}p). PLAY (Back) ${favTeam} if you anticipate a massive over.`;
                 }
             } 
             // Case 2: You have active bets - Generate GREEN BOOK EXIT Point
             else {
                 let expFav = 0; let expOpp = 0;
                 let oppTeam = (favTeam === t1Name) ? t2Name : t1Name;
                 
                 if (favTeam === t1Name) { expFav = e1; expOpp = e2; } 
                 else if (favTeam === t2Name) { expFav = e2; expOpp = e1; }

                 if (expFav === 0 && expOpp === 0) {
                     aiAdvice = `[LEDGER ERROR] Could not map favorite team (${favTeam}) to your tracker inputs (${t1Name}/${t2Name}). Ensure abbreviations match exactly (e.g. KKR, MI).`;
                 } 
                 // Winning on Favorite, Losing on Opponent (Standard Hedge)
                 else if (expFav > 0 && expOpp < 0) {
                     let requiredStake = Math.abs(expOpp);
                     let profitCost = requiredStake * (layPaise / 100);
                     let newFavProfit = expFav - profitCost;

                     if (newFavProfit > 0) {
                         aiAdvice = `🟢 [GREEN BOOK AVAILABLE]\nTo clear your -${Math.abs(expOpp).toFixed(0)} liability on ${oppTeam}:\n> LAY ${favTeam} at ${layPaise}p.\n> STAKE REQUIRED: ${requiredStake.toFixed(0)}\n> FINAL BOOK: ${favTeam} (+${newFavProfit.toFixed(0)}) | ${oppTeam} (0.00)`;
                     } else {
                         let targetOdds = (expFav / Math.abs(expOpp)) * 100;
                         aiAdvice = `🟡 [HEDGE PENDING]\nYou cannot Green Book yet. Market is ${layPaise}p. You must wait for ${favTeam} odds to drop to ${targetOdds.toFixed(0)}p to zero out your liability.`;
                     }
                 }
                 // Losing on Favorite, Winning on Opponent (Reverse Hedge)
                 else if (expFav < 0 && expOpp > 0) {
                     let requiredStake = Math.abs(expFav) / (favPaise / 100);
                     let newOppProfit = expOpp - requiredStake;

                     if (newOppProfit > 0) {
                         aiAdvice = `🟢 [GREEN BOOK AVAILABLE]\nTo clear your -${Math.abs(expFav).toFixed(0)} liability on ${favTeam}:\n> BACK ${favTeam} at ${favPaise}p.\n> STAKE REQUIRED: ${requiredStake.toFixed(0)}\n> FINAL BOOK: ${oppTeam} (+${newOppProfit.toFixed(0)}) | ${favTeam} (0.00)`;
                     } else {
                         let targetOdds = (Math.abs(expFav) / expOpp) * 100;
                         aiAdvice = `🟡 [HEDGE PENDING]\nYou cannot Green Book yet. Market is ${favPaise}p. You must wait for ${favTeam} odds to rise to ${targetOdds.toFixed(0)}p to zero out your liability.`;
                     }
                 }
                 // Green Book Already Exists
                 else if (expFav >= 0 && expOpp >= 0) {
                     aiAdvice = `✅ [BOOK SECURED]\nYou have zero liability. (${favTeam}: +${expFav.toFixed(0)} | ${oppTeam}: +${expOpp.toFixed(0)}). Enjoy the match.`;
                 }
                 // Double Red Book
                 else {
                     aiAdvice = `🔴 [CRITICAL WARNING]\nYou are carrying liability on BOTH teams. Immediately Lay the favorite to balance the book.`;
                 }
             }
        }
        
        payload.ledger_analysis = aiAdvice;

    } catch (err) {
        payload.ledger_analysis = "Engine Fault in Hedge Calculation.";
    }

    // =========================================================================
    // [ADD-ON: SHADOW TRADER (CONTRARIAN VALUE HUNTER)]
    // Evaluates asymmetrical risk for Lay/Back anomalies against the market trend.
    // =========================================================================
    try {
        if (isRealMarket && payload.match_state === "live") {
            let contrarianAdvice = "";
            let rrrVal = 0;
            let isChasePhase = (payload.required_rr && !payload.required_rr.includes("REQ") && payload.required_rr !== "1st Innings" && payload.required_rr !== "Error");
            if (isChasePhase) rrrVal = parseFloat(payload.required_rr) || 0;

            let runs = 0, wkts = 0, overs = 0, balls = 0, totalBalls = 0;
            let scoreMatchClean = payload.live_score.match(/(\d+)[\/\-](\d+)\s*\(?([\d\.]+)\)?/);
            let batTeam = payload.live_score.split(' ')[0] || "Batting Team";

            if (scoreMatchClean) {
                runs = parseInt(scoreMatchClean[1]);
                wkts = parseInt(scoreMatchClean[2]);
                let oversSplit = scoreMatchClean[3].split('.');
                overs = parseInt(oversSplit[0]);
                balls = oversSplit[1] ? parseInt(oversSplit[1]) : 0;
                totalBalls = (overs * 6) + balls;
            }
            
            let crr = parseFloat(payload.current_rr) || 8.5;
            let recentRuns = 0; let validBalls = 0;
            if (Array.isArray(payload.last_over)) {
                payload.last_over.forEach(b => {
                    if (b === 'W') { validBalls++; }
                    else if (b === 'Wd' || b === 'Nb') recentRuns += 1;
                    else if (!isNaN(parseInt(b))) { recentRuns += parseInt(b); validBalls++; }
                });
            }
            let recentRR = validBalls > 0 ? (recentRuns / validBalls) * 6 : crr;

            if (favPaise > 0 && favPaise <= 20) {
                contrarianAdvice = `\n<br><span style="color:#b366ff; font-weight:bold;">[SHADOW TRADER]</span> <span style="color:#fff;">${favTeam} is extremely cheap (${favPaise}p). Asymmetrical risk: High value to LAY ${favTeam} for a quick trading swing. One wicket shifts this market 30-40 paise.</span>`;
            } else if (isChasePhase && favTeam === batTeam && rrrVal > 10.0 && wkts >= 3) {
                contrarianAdvice = `\n<br><span style="color:#b366ff; font-weight:bold;">[SHADOW TRADER]</span> <span style="color:#fff;">Market blindly backing ${favTeam}. RRR is creeping (${rrrVal.toFixed(1)}). High value to LAY ${favTeam} now before panic sets in on the scoreboard.</span>`;
            } else if (isChasePhase && favTeam !== batTeam && wkts <= 3 && rrrVal <= 11.0) {
                contrarianAdvice = `\n<br><span style="color:#b366ff; font-weight:bold;">[SHADOW TRADER]</span> <span style="color:#fff;">${batTeam} (Underdog) has wickets in hand. Late assault imminent. High value to BACK ${batTeam} against the market trend.</span>`;
            } else if (!isChasePhase && totalBalls > 90 && recentRR > 10.0) {
                contrarianAdvice = `\n<br><span style="color:#b366ff; font-weight:bold;">[SHADOW TRADER]</span> <span style="color:#fff;">Death over acceleration detected. If market still heavily favors bowling team, BACK the batting team for a rapid total score surge.</span>`;
            }

            if (contrarianAdvice) {
                payload.match_prediction += contrarianAdvice;
            }
        }
    } catch (err) {
        console.log("Shadow Trader Module skipped.");
    }

    return res.status(200).json({ success: true, match_info: payload });

  } catch (err) {
      payload.status = "FIREWALL BLOCKED CONNECTION";
      payload.live_score = "ERROR: Cannot Fetch"; 
      payload.prediction = "SCRAPER OFFLINE"; 
      payload.match_prediction = "DABBA LINE BLOCKED";
      payload.fetch_code = "OH"; 
      return res.status(200).json({ success: false, error: err.message, match_info: payload });
  }
};
