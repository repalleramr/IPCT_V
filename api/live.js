const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.method === 'OPTIONS') return res.status(200).end();

  let targetUrl = (req.query && req.query.url) ? req.query.url : "";
  let targetTeams = (req.query && req.query.teams) ? String(req.query.teams).toLowerCase().trim() : "";
  
  let e1 = parseFloat(req.query && req.query.e1) || 0; 
  let e2 = parseFloat(req.query && req.query.e2) || 0; 
  let t1Name = (req.query && req.query.t1 ? req.query.t1 : "Team A").toUpperCase().trim();
  let t2Name = (req.query && req.query.t2 ? req.query.t2 : "Team B").toUpperCase().trim();

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
  };

  let payload = {
    title: "TARGET UNKNOWN", status: "Scanning Fields...", match_state: "standby", winner: "PENDING",
    live_score: "NO SCORE", current_rr: "NO CRR", required_rr: "NO REQ",
    striker: "NO STRIKER", non_striker: "NO NON-STRIKER", bowler: "NO BOWLER",
    toss: "NO TOSS DATA", venue: "VENUE HIDDEN", last_over: ["-", "-", "-", "-", "-", "-"],
    prediction: "AI OFFLINE", match_prediction: "", ledger_analysis: "AWAITING TELEMETRY", source_url: "Hunting...", fetch_code: "OH"
  };

  let pageTitle = ""; let bodyText = ""; let $ = null; let fullHtml = "";

  const teamAliases = {
    "csk": ["chennai", "super kings"], "lsg": ["lucknow", "super giants"],
    "mi": ["mumbai", "indians"], "pbks": ["punjab", "kings"],
    "dc": ["delhi", "capitals"], "gt": ["gujarat", "titans"],
    "kkr": ["kolkata", "knight riders"], "rr": ["rajasthan", "royals"],
    "rcb": ["royal", "bengaluru", "bangalore", "challengers"], "srh": ["sunrisers", "hyderabad"]
  };

  function escapeRegExp(str) { return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  let t1 = targetTeams.split(' vs ')[0]?.trim().split(' ')[0] || "unknown";
  let t2 = targetTeams.split(' vs ')[1]?.trim().split(' ')[0] || "unknown";
  
  // Flatten aliases for search
  let t1A = [t1]; if(teamAliases[t1]) t1A = t1A.concat(teamAliases[t1]);
  let t2A = [t2]; if(teamAliases[t2]) t2A = t2A.concat(teamAliases[t2]);

  function matchesTeams(txt) {
    if (!txt) return false;
    let match1 = t1A.some(a => txt.includes(a));
    let match2 = t2A.some(a => txt.includes(a));
    // If targetTeams wasn't provided properly, bypass strict check to allow raw scraping
    if (t1 === "unknown" && t2 === "unknown") return true; 
    return match1 || match2;
  }

  // =========================================================================
  // CORE SCRAPER ENGINE
  // =========================================================================
  try {
    let htmlAcquired = false; let timestampBuster = Date.now();

    if (!htmlAcquired) {
      try {
        let crexUrl = (targetUrl.includes('crex.com') || targetUrl.includes('crex.live')) ? targetUrl : "";
        if (!crexUrl && targetTeams) {
          const cxRes = await axios.get(`https://crex.com/fixtures/match-list?_t=${timestampBuster}`, { headers, timeout: 2000 });
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
          fullHtml = cRes.data; 
          $ = cheerio.load(cRes.data); $('script, style, noscript').remove();
          pageTitle = $('title').text() || ""; 
          bodyText = $('body').text().replace(/\s+/g, ' ').trim();
          payload.source_url = "CREX (Tier 1)"; htmlAcquired = true;
        }
      } catch (e) { }
    }

    if (!htmlAcquired) {
      try {
        let cbUrl = targetUrl.includes('cricbuzz') ? targetUrl.replace('www.cricbuzz.com', 'm.cricbuzz.com') : "";
        if (!cbUrl && targetTeams) {
          const searchDirs = [`https://m.cricbuzz.com/cricket-match/live-scores?_t=${timestampBuster}`];
          for (let dir of searchDirs) {
            const res = await axios.get(dir, { headers, timeout: 2000 });
            const $temp = cheerio.load(res.data);
            $temp('a').each((i, el) => {
              let txt = $temp(el).text().toLowerCase(); let href = $temp(el).attr('href') || ""; 
              if (href.match(/\/\d{4,}\//) && matchesTeams(txt + " " + href) && href.includes('scores')) cbUrl = 'https://m.cricbuzz.com' + href;
            });
            if (cbUrl) break;
          }
        }
        if (cbUrl) {
          cbUrl = cbUrl.replace('www.', 'm.').replace('/live-cricket-scorecard/', '/cricket-scores/');
          const cbRes = await axios.get(`${cbUrl}?_t=${timestampBuster}`, { headers, timeout: 3000 });
          fullHtml = cbRes.data;
          $ = cheerio.load(cbRes.data); $('script, style, noscript').remove();
          pageTitle = $('title').text() || ""; 
          bodyText = $('body').text().replace(/\s+/g, ' ').trim();
          payload.source_url = "CRICBUZZ (Tier 2)"; htmlAcquired = true;
        }
      } catch (e) { }
    }

    payload.fetch_code = htmlAcquired ? "UREKHA" : "OH";

    if (!htmlAcquired) {
      payload.status = "UPLINK FAILED: ALL TARGETS BLOCKED"; 
      return res.status(200).json({ success: true, match_info: payload });
    }

    // --- BASIC DATA & STATE EXTRACTION ---
    try {
      let finalTitle = pageTitle.match(/([a-zA-Z0-9\s]+?\s+(?:vs|v)\s+[a-zA-Z0-9\s]+)/i) || bodyText.match(/([a-zA-Z0-9\s]+?\s+(?:vs|v)\s+[a-zA-Z0-9\s]+)/i);
      payload.title = finalTitle ? finalTitle[1].replace(/live score/i, '').trim().toUpperCase() : (targetTeams.toUpperCase() || "LIVE MATCH");
      
      let statusText = $('.cb-status-msg, .match-status, .info-status').first().text().trim();
      let titleWin = pageTitle.match(/([a-zA-Z\s\-]+won by\s\d+\s(?:runs|wickets|run|wicket))/i);
      payload.status = statusText || (titleWin ? titleWin[1].trim() : "Match Active");

      let statusLower = payload.status.toLowerCase();
      
      // [FIXED] Aggressive Live State Detection (Catches CRR/RRR even if score formatting is weird)
      if (statusLower.includes('won by') || statusLower.includes('tied') || statusLower.includes('abandoned')) {
        payload.match_state = "completed";
      } else if (bodyText.includes('CRR:') || bodyText.includes('RRR:') || bodyText.includes('Target :') || bodyText.match(/[A-Z]{2,4}[^\d]{0,10}\d+[\/\-]\d+/)) {
        payload.match_state = "live";
      } else {
        payload.match_state = "future";
      }
    } catch (e) { payload.match_state = "standby"; }

    let isRealMarket = false;
    let favTeam = ""; let favPaise = 0; let layPaise = 0; let displayOdds = "N/A";
    let runs = 0, wkts = 0, totalBalls = 0, crr = 8.5, rrrVal = 0, batTeam = "TEAM";

    if (payload.match_state === "live") {
      // [FIXED] SCORE PARSER - Tolerates junk like "PP" between Team and Score
      try {
        let scoreRegex = /([A-Z]{2,4})[^\d]{0,20}?(\d{1,3})[\/\-](\d{1,2})\s*\(?([\d\.]+)\)?/i;
        let scoreMatch = pageTitle.match(scoreRegex) || bodyText.match(scoreRegex) || fullHtml.replace(/<[^>]+>/g, " ").match(scoreRegex);

        if (scoreMatch) {
          payload.live_score = `${scoreMatch[1].toUpperCase()} ${scoreMatch[2]}/${scoreMatch[3]} (${scoreMatch[4]})`;
          batTeam = scoreMatch[1].toUpperCase();
          runs = parseInt(scoreMatch[2]);
          wkts = parseInt(scoreMatch[3]);
          let oversSplit = scoreMatch[4].split('.');
          totalBalls = (parseInt(oversSplit[0]) * 6) + (oversSplit[1] ? parseInt(oversSplit[1]) : 0);
        }
        
        let crrMatch = bodyText.match(/CRR:\s*([\d\.]+)/i) || fullHtml.match(/CRR:\s*([\d\.]+)/i);
        if (crrMatch) { payload.current_rr = crrMatch[1]; crr = parseFloat(crrMatch[1]); }
        
        let reqMatch = bodyText.match(/(?:RRR|Req RR|Target)\s*[:\-]?\s*([\d\.]+)/i) || fullHtml.match(/(?:RRR|Req RR|Target)\s*[:\-]?\s*([\d\.]+)/i);
        if (reqMatch) { 
            let val = parseFloat(reqMatch[1]);
            // If it matched target (e.g., 215), calculate RRR manually. Otherwise it's RRR.
            if (val > 30) {
               let ballsLeft = 120 - totalBalls;
               if (ballsLeft > 0) { rrrVal = ((val - runs) / ballsLeft) * 6; payload.required_rr = rrrVal.toFixed(2); }
            } else {
               payload.required_rr = reqMatch[1]; rrrVal = val; 
            }
        } else { payload.required_rr = "1st Innings"; }

      } catch (e) { payload.live_score = "Score Extraction Error"; }

      // =========================================================================
      // [NEW] CREX STRICT UI ODDS SNIPER
      // =========================================================================
      try {
        // Strip HTML, turn into a clean stream of text
        let rawDump = fullHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
        let allValidTeams = [...t1A, ...t2A, ...Object.keys(teamAliases), "Gujarat Titans", "Rajasthan Royals"]; 
        
        for (let team of allValidTeams) {
            if(!team || team.length < 2) continue;
            
            // The Magic Regex: Matches TeamName, allows up to 50 NON-NUMBER characters (like 'GT', info icon, pencil), then matches two numbers (odds). 
            // It strictly rejects matching if a session score or other number gets in the way.
            let regex = new RegExp(`\\b${escapeRegExp(team)}\\b[^0-9]{0,50}?\\b(\\d{1,3})\\s+(\\d{1,3})\\b`, 'i');
            let match = rawDump.match(regex);
            
            if (match) {
                let p1 = parseInt(match[1]); let p2 = parseInt(match[2]);
                let diff = Math.abs(p1 - p2);
                
                // Validate Indian Market Odds (1 to 150 paise, spread of 1 to 5)
                if (p1 >= 1 && p2 >= 1 && p1 <= 150 && p2 <= 150 && diff >= 1 && diff <= 5) {
                    favTeam = team.toUpperCase();
                    
                    // Map back to abbreviation if full name was matched
                    if(favTeam === "GUJARAT TITANS") favTeam = "GT";
                    if(favTeam === "RAJASTHAN ROYALS") favTeam = "RR";
                    
                    favPaise = Math.min(p1, p2); layPaise = Math.max(p1, p2);
                    displayOdds = `${favPaise}-${layPaise}`;
                    isRealMarket = true;
                    break;
                }
            }
        }

        let matchTactic = isRealMarket ? `[ACTIVE MARKET] ${favTeam} is Favorite at ${displayOdds} Paise` : `[AWAITING MARKET ODDS] Market Closed / Offline.`;
        payload.match_prediction = matchTactic;
      } catch (e) { payload.match_prediction = "Extraction logic failed."; }
    } else {
      payload.live_score = "Match Not Active";
    }

    // =========================================================================
    // QUANTUM HEDGE ENGINE
    // =========================================================================
    try {
        if (payload.match_state === "live" && isRealMarket) {
            let hedgeAdvice = "";
            let valE1 = isNaN(e1) ? 0 : e1;
            let valE2 = isNaN(e2) ? 0 : e2;

            if (valE1 === 0 && valE2 === 0) {
                hedgeAdvice = `[ENTRY PROTOCOL] No active ledger entries.\n> Market favors ${favTeam} (${favPaise}p).`;
            } else {
                let expFav = 0; let expOpp = 0; let oppTeam = "Opponent";
                let t1Safe = t1Name.substring(0, 3); let t2Safe = t2Name.substring(0, 3);
                
                let isT1Fav = (favTeam.includes(t1Safe) || t1Safe.includes(favTeam));
                let isT2Fav = (favTeam.includes(t2Safe) || t2Safe.includes(favTeam));

                if (isT1Fav) { expFav = valE1; expOpp = valE2; oppTeam = t2Name; }
                else if (isT2Fav) { expFav = valE2; expOpp = valE1; oppTeam = t1Name; }
                else { expFav = valE1; expOpp = valE2; oppTeam = "UNKNOWN"; } 

                if (favPaise > 0 && layPaise > 0) {
                    if (expFav > 0 && expOpp < 0) {
                        let requiredStake = Math.abs(expOpp);
                        let profitCost = requiredStake * (layPaise / 100);
                        let newFavProfit = expFav - profitCost;
                        if (newFavProfit > 0) hedgeAdvice = `🟢 [GREEN BOOK AVAILABLE]\nTo clear your -${Math.abs(expOpp).toFixed(0)} liability on ${oppTeam}:\n> LAY ${favTeam} at ${layPaise}p.\n> STAKE REQUIRED: ${requiredStake.toFixed(0)}\n> FINAL BOOK: ${favTeam} (+${newFavProfit.toFixed(0)}) | ${oppTeam} (0.00)`;
                        else hedgeAdvice = `🟡 [HEDGE PENDING] Wait for ${favTeam} odds to drop to ${((expFav / Math.abs(expOpp)) * 100).toFixed(0)}p to zero liability.`;
                    } else if (expFav < 0 && expOpp > 0) {
                        let requiredStake = Math.abs(expFav) / (favPaise / 100);
                        let newOppProfit = expOpp - requiredStake;
                        if (newOppProfit > 0) hedgeAdvice = `🟢 [GREEN BOOK AVAILABLE]\nTo clear your -${Math.abs(expFav).toFixed(0)} liability on ${favTeam}:\n> BACK ${favTeam} at ${favPaise}p.\n> STAKE REQUIRED: ${requiredStake.toFixed(0)}\n> FINAL BOOK: ${oppTeam} (+${newOppProfit.toFixed(0)}) | ${favTeam} (0.00)`;
                        else hedgeAdvice = `🟡 [HEDGE PENDING] Wait for ${favTeam} odds to rise to ${((Math.abs(expFav) / expOpp) * 100).toFixed(0)}p to zero liability.`;
                    } else if (expFav >= 0 && expOpp >= 0) {
                        hedgeAdvice = `✅ [BOOK SECURED] Zero liability. (${favTeam}: +${expFav.toFixed(0)} | ${oppTeam}: +${expOpp.toFixed(0)}).`;
                    } else {
                        hedgeAdvice = `🔴 [CRITICAL WARNING] Liability on BOTH teams. Check tracker.`;
                    }
                }
            }
            payload.ledger_analysis = hedgeAdvice;
        } else if (!isRealMarket && payload.match_state === "live") {
             payload.ledger_analysis = "[HEDGE OFFLINE] Waiting for data stream.";
        }
    } catch (err) {
        payload.ledger_analysis = "Engine Fault in Hedge Calculation: " + err.message;
    }

    return res.status(200).json({ success: true, match_info: payload });

  } catch (err) {
      payload.status = "FIREWALL BLOCKED CONNECTION";
      payload.match_prediction = "DABBA LINE BLOCKED";
      return res.status(200).json({ success: false, error: err.message, match_info: payload });
  }
};
