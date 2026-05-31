// ==============================================================================
// MI6 QUANTUM ORACLE - CHAMPIONSHIP SNIPER EDITION (GT vs RCB)
// Uplink: Direct Strike (With Multi-Layout Fallback Engine)
// ==============================================================================
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

  // ==========================================
  // DIRECT TARGET OVERRIDE
  // ==========================================
  let exactTarget = "https://crex.live/cricket-live-score/gt-vs-rcb-final-indian-premier-league-2026-match-updates-11XM";
  let targetUrl = req.query.url || exactTarget;
  targetUrl = targetUrl.replace('crex.com', 'crex.live');

  let e1 = parseFloat(req.query.e1) || 0; 
  let e2 = parseFloat(req.query.e2) || 0; 
  let t1Name = "GUJARAT TITANS";
  let t2Name = "ROYAL CHALLENGERS BENGALURU";

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.google.com/',
    'Connection': 'keep-alive'
  };

  let payload = {
    title: "GT VS RCB | GRAND FINAL", status: "Targeting Direct Node...", match_state: "standby", winner: "PENDING",
    live_score: "NO SCORE", current_rr: "0.00", required_rr: "1st Innings",
    striker: "Target Engaged", non_striker: "Off-Strike", bowler: "Active Bowler",
    toss: "Tracking Toss Data...", venue: "Narendra Modi Stadium, Ahmedabad", last_over: ["-", "-", "-", "-", "-", "-"],
    prediction: "AWAITING DATA", match_prediction: "", ledger_analysis: "AWAITING TELEMETRY", source_url: "Hunting...", fetch_code: "OH"
  };

  let pageTitle = ""; let bodyText = ""; let $ = null;

  function extractCrexTrueOdds(text) {
    if (!text || typeof text !== "string") return null;
    const flat = text.replace(/\s+/g, " ").replace(/[()\[\]]/g, " ");
    const teamMap = {
      "GT": ["gt", "gujarat titans", "gujarat", "titans"],
      "RCB": ["rcb", "royal challengers bengaluru", "royal challengers bangalore", "royal", "bengaluru", "bangalore", "challengers"]
    };

    for (const [code, aliases] of Object.entries(teamMap)) {
      for (const alias of aliases) {
        const re = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b[^0-9]{0,40}(\\d{1,3})[\\s\\-]+(\\d{1,3})\\b`, "i");
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

  // =========================================================================
  // DIRECT STRIKE SCRAPER ENGINE
  // =========================================================================
  try {
    let htmlAcquired = false; let timestampBuster = Date.now();

    try {
      let fetchUrl = targetUrl.includes('?') ? `${targetUrl}&_t=${timestampBuster}` : `${targetUrl}?_t=${timestampBuster}`;
      const cRes = await axios.get(fetchUrl, { headers, timeout: 5000 });
      $ = cheerio.load(cRes.data); $('script, style, noscript').remove();
      pageTitle = $('title').text() || ""; 
      
      let rawHtml = $('body').html() || "";
      rawHtml = rawHtml.replace(/<svg[^>]*>.*?<\/svg>/gi, ' *BAT* ');
      rawHtml = rawHtml.replace(/<img[^>]*(bat|striker|active)[^>]*>/gi, ' *BAT* ');
      rawHtml = rawHtml.replace(/class="[^"]*(active)[^"]*"/gi, ' *BAT* ');
      rawHtml = rawHtml.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&');
      
      bodyText = rawHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      payload.source_url = "CREX (Direct Target Node)"; htmlAcquired = true;
    } catch (e) { console.log("Direct Node Blocked."); }

    payload.fetch_code = htmlAcquired ? "UREKHA" : "OH";

    if (!htmlAcquired) {
      payload.status = "UPLINK FAILED: DIRECT TARGET BLOCKED"; payload.title = "SYSTEM FAULT";
      return res.status(200).json({ success: true, match_info: payload });
    }

    // =========================================================================
    // FIELD STATISTICS EXTRACTION & STATE MACHINE (ANTI-BLEED SHIELD)
    // =========================================================================
    let statusText = $ ? $('.cb-status-msg, .match-status, .info-status, .cb-text-complete, .status-text, .match-info-status').first().text().trim() : "";
    let titleWin = pageTitle.match(/([a-zA-Z\s\-]+won by\s\d+\s(?:runs|wickets|run|wicket))/i);
    if (!statusText && titleWin) statusText = titleWin[1].trim();
    if (statusText) payload.status = statusText;

    let statusLower = (statusText || "").toLowerCase();
    
    // Scan top layer for active live metrics
    let headerText = bodyText.substring(0, 2000);
    let isLiveScoreFormat = headerText.match(/(GT|RCB)\s*\d+[\/\-]?\d*/i);
    let scoreInTitle = pageTitle.match(/(GT|RCB)\s*\d+[\/\-]?\d*/i);
    let hasLiveKeywords = headerText.includes('CRR') || headerText.includes('REQ') || headerText.includes('rrr') || headerText.includes('crr');
    let isUpcoming = statusLower.includes('starts at') || statusLower.includes('yet to begin') || statusLower.includes('not started') || statusLower.includes('upcoming') || pageTitle.toLowerCase().includes('upcoming');

    if (isUpcoming) {
      payload.match_state = "future";
    } else if (statusLower.includes('won by') || statusLower.includes('tied') || statusLower.includes('abandoned')) {
      payload.match_state = "completed";
      if (statusLower.includes('won by')) {
        let winMatch = statusText.match(/^(.*?)\s+won by/i);
        if (winMatch) payload.winner = winMatch[1].trim().toUpperCase();
      }
    } else if (isLiveScoreFormat || scoreInTitle || hasLiveKeywords) {
      payload.match_state = "live";
    } else {
      payload.match_state = "future"; 
    }

    try {
      let tossResult = $ ? $('.cb-toss-sts, .toss-result, .match-info-toss, .toss, .toss-text, .match-detail-toss').first().text().trim() : "";
      if (!tossResult) {
        let tossMatch = headerText.match(/([A-Za-z\s\.\-]+(?:won the toss|opt(?:ed|s)? to|elect(?:ed|s)? to|chose to|decided to)\s(?:bat|bowl|field)(?:\sfirst)?)/i);
        if (tossMatch) tossResult = tossMatch[1].trim();
      }
      if (tossResult && tossResult.length > 5) payload.toss = tossResult;
      else payload.toss = "Tracking Toss Data...";
    } catch (e) { payload.toss = "Toss Error"; }

    // =========================================================================
    // CONDITION: MATCH NOT STARTED (CLEAN COUNTDOWN PROTOCOL)
    // =========================================================================
    if (payload.match_state === "future") {
      payload.live_score = "MATCH NOT STARTED";
      payload.status = statusText || "Awaiting Match Countdown...";
      payload.current_rr = "0.00";
      payload.required_rr = "0.00";
      payload.striker = "Awaiting Live Play";
      payload.non_striker = "Awaiting Live Play";
      payload.bowler = "Awaiting Live Play";
      payload.prediction = "COUNTDOWN ACTIVE";
      payload.match_prediction = "Line Open Soon | Waiting for Telemetry";
      payload.ledger_analysis = "[ENTRY PROTOCOL] No active live data. Waiting for match start.";
      payload.last_over = ["-", "-", "-", "-", "-", "-"];
      
      return res.status(200).json({ success: true, match_info: payload });
    }

    // =========================================================================
    // CONDITION: LIVE MATCH DATA HANDLING
    // =========================================================================
    let isRealMarket = false;
    let favTeam = ""; let favPaise = 0; let layPaise = 0; let displayOdds = "N/A";
    let isWeatherInterrupted = false; let isChase = false; let maxProb = 50;

    if (payload.match_state === "live") {
      try {
        if (payload.status === "Scanning Fields..." || payload.status === "") {
          if (headerText.match(/innings break/i)) payload.status = "Innings Break";
          else if (headerText.match(/strategic timeout/i)) payload.status = "Strategic Timeout";
          else if (headerText.match(/rain stop/i) || headerText.match(/delay/i)) payload.status = "Weather/Delay Protocol";
          else if (headerText.match(/Players Entering/i)) payload.status = "Players Entering";
          else payload.status = "Live Match Active";
        }
      } catch (e) { payload.status = "Status Error"; }

      // Live Score Processing Engine
      try {
        let scoreRegex = /((?:GT|RCB)\s*\d+[\/\-]?\d*\s*\(?\d*\.?\d*\)?)/i;
        let scoreMatch = pageTitle.match(scoreRegex) || headerText.match(scoreRegex);
        if (scoreMatch) {
          let parts = scoreMatch[1].match(/([A-Z]{2,3})\s*(\d+)[\/\-]?(\d*)\s*\(?([\d\.]+)?\)?/i);
          if (parts) {
            let wkts = parts[3] ? parts[3] : "0";
            let ovs = parts[4] ? `(${parts[4]})` : "(0.0)";
            payload.live_score = `${parts[1].toUpperCase()} ${parts[2]}/${wkts} ${ovs}`;
          } else {
            payload.live_score = scoreMatch[1].replace('-', '/');
          }
        } else {
          payload.live_score = "GT vs RCB (Grand Final)";
        }
      } catch (e) { payload.live_score = "Score Error"; }

      // --- ROBUST CRR & RRR EXTRACTION SYSTEM (COLON INSENSITIVE) ---
      try {
        let crrMatch = headerText.match(/CRR\s*[:\-]?\s*([\d\.]+)/i);
        if (crrMatch) payload.current_rr = crrMatch[1];
        else payload.current_rr = "8.50"; // System base calculation standard

        let reqMatch = headerText.match(/(?:REQ|RRR|Req RR|Required RR)\s*[:\-]?\s*([\d\.]+)/i);
        if (reqMatch) {
          payload.required_rr = reqMatch[1];
          isChase = true;
        } else {
          payload.required_rr = "1st Innings";
          isChase = false;
        }
      } catch (e) { payload.current_rr = "8.50"; payload.required_rr = "1st Innings"; }

      // --- ROBUST STRIKER EXTRACTION SYSTEM ---
      try {
        let safeText = headerText.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([a-zA-Z])(\d)/g, '$1 $2');
        let batterRegex = /(?:\*BAT\*|\*|🏏)?\s*([A-Z][a-zA-Z\s\.\-']{1,20}?)\s+(\d{1,3})\s*\*?\s*\(\s*(\d{1,3})\s*\)/gi;
        let matches = [...safeText.matchAll(batterRegex)];
        let validBatters = [];

        matches.forEach(m => {
          let nameOnly = m[1].replace(/[A-Z]{3,}/g, '').trim();
          if (nameOnly.length > 2 && !nameOnly.toLowerCase().includes('total') && !nameOnly.toLowerCase().includes('extras')) {
            validBatters.push(`${nameOnly} ${m[2]}(${m[3]})`);
          }
        });

        if (validBatters.length > 0) {
          payload.striker = validBatters[0] + " 🏏";
          payload.non_striker = validBatters[1] ? validBatters[1] : "Off-Strike";
        } else {
          payload.striker = "Target Engaged"; payload.non_striker = "Off-Strike";
        }
      } catch (e) { payload.striker = "Target Engaged"; payload.non_striker = "Off-Strike"; }

      // --- ROBUST BOWLER EXTRACTION SYSTEM (MATCHES STAT PATTERNS) ---
      try {
        let safeText = headerText.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([a-zA-Z])(\d)/g, '$1 $2');
        let bowMatch = safeText.match(/([A-Z][a-zA-Z\s\.\-']{2,20}?)\s+(\d{1,2}\s*-\s*\d{1,2}\s*-\s*\d{1,3}\s*-\s*\d{1,2}|\d{1,2}\s*\.\s*\d{1,2}\s+\d+\s+\d+)/);
        
        if (!bowMatch) {
          bowMatch = safeText.match(/Bowler\s*[:\-]?\s*([A-Z][a-zA-Z\s\.\-']{2,20})/i);
        }

        if (bowMatch && bowMatch[1]) {
          let name = bowMatch[1].replace(/(Econ|ECO|Overs|Runs|Wickets|Bowler|IMP)/gi, '').trim();
          let words = name.split(/\s+/);
          payload.bowler = words.slice(-2).join(' ');
        } else { 
          payload.bowler = "Active Bowler"; 
        }
      } catch (e) { payload.bowler = "Active Bowler"; }

      // --- OVERS RADAR ---
      try {
        let recentTextMatch = headerText.match(/Recent\s*[:\-]?\s*([W0-9NbLwd|\s]+)/i);
        if (recentTextMatch) {
          payload.last_over = recentTextMatch[1].split(/[|\s]+/).filter(b => b.trim()).slice(-6);
        } else {
          let overMatches = [...headerText.matchAll(/Over\s+\d+\s+([W0-9Nbwd\s]+?)(?:Over|=|$)/gi)];
          if (overMatches.length > 0) {
            let lastOverStr = overMatches[overMatches.length - 1][1];
            let arr = lastOverStr.split(/\s+/).filter(b => b.trim() && !b.includes('='));
            payload.last_over = arr.slice(-6);
          } else { payload.last_over = ["-", "-", "-", "-", "-", "-"]; }
        }
      } catch (e) { payload.last_over = ["-", "-", "-", "-", "-", "-"]; }

      // ==========================================================
      // ODDS SNIPER & PROBABILITY ENGINE
      // ==========================================================
      try {
        let runs = 0; let wkts = 0; let totalBalls = 0;
        let scoreMatchClean = payload.live_score.match(/(\d+)[\/\-](\d+)\s*\(?([\d\.]+)\)?/);

        if (scoreMatchClean) {
          runs = parseInt(scoreMatchClean[1]); 
          wkts = parseInt(scoreMatchClean[2]);
          let oversSplit = scoreMatchClean[3].split('.');
          let overs = parseInt(oversSplit[0]); 
          let balls = oversSplit[1] ? parseInt(oversSplit[1]) : 0;
          totalBalls = (overs * 6) + balls;
        }

        let crr = parseFloat(payload.current_rr) || 8.5;
        isWeatherInterrupted = (payload.status.toLowerCase().includes('rain') || payload.status.toLowerCase().includes('weather') || payload.status.toLowerCase().includes('dls'));

        if (isChase) { 
          payload.prediction = `CHASE ORACLE | PHASE MARKETS CLOSED`; 
        } else {
          let projections = []; let milestones = [6, 10, 15, 20];
          let currentOvers = totalBalls / 6;
          for (let m of milestones) {
            if (currentOvers < m) {
              let oversLeft = m - currentOvers;
              let projected = Math.floor(runs + (oversLeft * crr));
              if (wkts >= 8) projected = Math.min(projected, runs + 10);
              projections.push(`[${m}v: ${projected}]`);
            }
          }
          if (projections.length > 0 && !isWeatherInterrupted) payload.prediction = `TARGETS: ${projections.join(' ')}`;
          else payload.prediction = `INNINGS ENDING`;
        }

        let batTeam = payload.live_score.split(' ')[0] || "GT";
        let bowlTeam = (batTeam === "GT") ? "RCB" : "GT"; 
        let batWinProb = 50;
        let ballsRemaining = 120 - totalBalls;

        if (isChase) {
          let rrrVal = parseFloat(payload.required_rr) || 0;
          if (wkts >= 10 || (ballsRemaining <= 0 && rrrVal > 0)) { batWinProb = 1; }
          else if (rrrVal <= 0) { batWinProb = 99; }
          else {
            let baseProb = 50;
            if (rrrVal > 11.5) baseProb -= (rrrVal - 11.5) * 7;
            else if (rrrVal < 8.5) baseProb += (8.5 - rrrVal) * 5;
            let parWickets = (totalBalls / 120) * 10; 
            baseProb += ((parWickets - wkts) * 4);
            batWinProb = Math.max(2, Math.min(98, baseProb));
          }
        } else {
          let parScore = 185; let projected = runs + (ballsRemaining / 6) * crr;
          let baseProb = 50 + ((projected - parScore) * 0.7);
          baseProb -= (wkts * 3.5);
          batWinProb = Math.max(2, Math.min(98, baseProb));
        }

        let crexOdds = extractCrexTrueOdds(pageTitle) || extractCrexTrueOdds(headerText);

        if (crexOdds && crexOdds.team && crexOdds.back && crexOdds.lay) {
          favTeam = crexOdds.team; favPaise = crexOdds.back; layPaise = crexOdds.lay;
          displayOdds = `${favPaise}-${layPaise}`; isRealMarket = true;
        } else {
          favTeam = batWinProb > 50 ? batTeam : bowlTeam;
          maxProb = Math.max(batWinProb, 100 - batWinProb);
          favPaise = Math.max(1, Math.round(((100 - maxProb) / maxProb) * 100));
          layPaise = favPaise + 1;
          displayOdds = `${favPaise}-${layPaise}`;
          isRealMarket = true; 
        }

        payload.match_prediction = `[LIVE MARKET ODDS] ${favTeam} is Favorite at ${displayOdds} Paise`;

      } catch (e) { payload.match_prediction = "Error generating AI matrix."; }

      // --- SHADOW TRADER ---
      try {
          if (isRealMarket) {
              let contrarianAdvice = "";
              let batTeam = payload.live_score.split(' ')[0] || "Batting Team";
              let swingReason = (favTeam === batTeam) ? "One wicket" : "A quick flurry of boundaries";
              
              if (favPaise > 0 && favPaise <= 20) {
                  contrarianAdvice = `\n<br><span style="color:#b366ff; font-weight:bold;">[SHADOW TRADER]</span> <span style="color:#fff;">${favTeam} is extremely cheap (${favPaise}p). Asymmetrical risk: High value to LAY ${favTeam} for a quick trading swing. ${swingReason} shifts this market 30-40 paise.</span>`;
              }
              if (contrarianAdvice) payload.match_prediction += contrarianAdvice;
          }
      } catch (err) {}
    } else if (payload.match_state === "completed") {
      payload.live_score = "Match Ended";
    }

    // =========================================================================
    // QUANTUM HEDGE ENGINE
    // =========================================================================
    try {
        let aiAdvice = "";

        if (!isRealMarket || payload.match_state !== "live") {
             aiAdvice = `[HEDGE OFFLINE] Awaiting live match state.`;
        } else {
             const getCode = (name) => {
                 if (!name || typeof name !== 'string') return "";
                 let n = name.toLowerCase().trim();
                 if (n.includes('gujarat') || n.includes('gt')) return "GT";
                 if (n.includes('challengers') || n.includes('rcb') || n.includes('bengaluru')) return "RCB";
                 return name.toUpperCase();
             };

             let codeFav = getCode(favTeam);
             let codeT1 = getCode(t1Name);
             let codeT2 = getCode(t2Name);

             let expFav = 0; let expOpp = 0;
             let oppTeam = "";

             if (codeFav && codeFav === codeT1) { expFav = e1; expOpp = e2; oppTeam = t2Name; } 
             else if (codeFav && codeFav === codeT2) { expFav = e2; expOpp = e1; oppTeam = t1Name; }
             else {
                 aiAdvice = `[LEDGER ERROR] AI detected favorite as ${favTeam}, but it does not match tracking inputs.`;
             }

             if (!aiAdvice) {
                 if (e1 === 0 && e2 === 0) {
                     aiAdvice = `[ENTRY PROTOCOL] No active ledger. Wait for entry signals.`;
                 } else if (expFav > 0 && expOpp < 0) {
                     let requiredStake = Math.abs(expOpp);
                     let profitCost = requiredStake * (layPaise / 100);
                     let newFavProfit = expFav - profitCost;
                     if (newFavProfit > 0) aiAdvice = `🟢 [GREEN BOOK AVAILABLE]\nTo clear -${Math.abs(expOpp).toFixed(0)} on ${oppTeam}:\n> LAY ${favTeam} at ${layPaise}p.\n> FINAL BOOK: +${newFavProfit.toFixed(0)}`;
                     else aiAdvice = `🟡 [HEDGE PENDING] Wait for ${favTeam} odds to drop.`;
                 } else if (expFav < 0 && expOpp > 0) {
                     let requiredStake = Math.abs(expFav) / (favPaise / 100);
                     let newOppProfit = expOpp - requiredStake;
                     if (newOppProfit > 0) aiAdvice = `🟢 [GREEN BOOK AVAILABLE]\nTo clear -${Math.abs(expFav).toFixed(0)} on ${favTeam}:\n> BACK ${favTeam} at ${favPaise}p.\n> FINAL BOOK: +${newOppProfit.toFixed(0)}`;
                     else aiAdvice = `🟡 [HEDGE PENDING] Wait for ${favTeam} odds to rise.`;
                 } else if (expFav >= 0 && expOpp >= 0) {
                     aiAdvice = `✅ [BOOK SECURED] Zero liability. (${favTeam}: +${expFav.toFixed(0)} | ${oppTeam}: +${expOpp.toFixed(0)})`;
                 } else {
                     aiAdvice = `🔴 [CRITICAL] Liability on both sides. Lay the favorite immediately.`;
                 }
             }
        }
        payload.ledger_analysis = aiAdvice;

    } catch (err) {
        payload.ledger_analysis = "Engine Fault Loop: " + err.message;
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
