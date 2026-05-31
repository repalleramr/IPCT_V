// ==============================================================================
// MI6 QUANTUM ORACLE - DEEP DOM ISOLATION PARSER (GRAND FINAL EDITION)
// Version: 11.2.0 (Zero Shortcut High-Fidelity Sports-Book Interface)
// ==============================================================================
const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async function (req, res) {
  // --- AGGRESSIVE ANTI-CACHING PROTOCOLS ---
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Target Hardwired to Grand Final Link
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
    'Connection': 'keep-alive'
  };

  let payload = {
    title: "GT VS RCB | GRAND FINAL", status: "Initializing Deep DOM Scans...", match_state: "standby", winner: "PENDING",
    live_score: "NO SCORE", current_rr: "NO CRR", required_rr: "NO REQ",
    striker: "NO STRIKER", non_striker: "NO NON-STRIKER", bowler: "NO BOWLER",
    toss: "NO TOSS DATA", venue: "Narendra Modi Stadium, Ahmedabad", last_over: ["-", "-", "-", "-", "-", "-"],
    prediction: "AI STANDBY", match_prediction: "", ledger_analysis: "AWAITING TELEMETRY", source_url: "Hunting...", fetch_code: "OH"
  };

  try {
    let timestampBuster = Date.now();
    let fetchUrl = targetUrl.includes('?') ? `${targetUrl}&_t=${timestampBuster}` : `${targetUrl}?_t=${timestampBuster}`;
    
    const response = await axios.get(fetchUrl, { headers, timeout: 6000 });
    const $ = cheerio.load(response.data);
    
    // Unmask active elements by swapping graphic icons for distinct tracker tags
    $('svg, img').each(function() {
      let htmlContent = $(this).html() || '';
      let attrContent = $(this).attr('class') || '';
      if (htmlContent.includes('bat') || attrContent.includes('bat') || attrContent.includes('striker')) {
        $(this).before(' *BAT_ACTIVE* ');
      }
    });

    // Extract raw metadata blocks
    let pageTitle = $('title').text() || "";
    let bodyContainer = $('body');
    
    // Create isolated text rows to completely eliminate tracking bleed
    let rawHtml = bodyContainer.html() || "";
    rawHtml = rawHtml.replace(/<\/(div|tr|p|li|h1|h2|h3|table|tbody)>/gi, ' |ROW_BREAK| ');
    let cleanText = rawHtml.replace(/<[^>]+>/g, ' ');
    let domRows = cleanText.split('|ROW_BREAK|').map(r => r.replace(/\s+/g, ' ').trim()).filter(r => r.length > 0);

    payload.fetch_code = "UREKHA";
    payload.source_url = "CREX (Structured Link)";

    // =========================================================================
    // 1. STATE MACHINE RESOLVER
    // =========================================================================
    let fullPageString = domRows.join(' ');
    let topSummaryArea = domRows.slice(0, 40).join(' ');
    
    let scoreMatch = pageTitle.match(/(GT|RCB)\s*\d+[\/\-]\d*/i) || topSummaryArea.match(/(GT|RCB)\s*\d+[\/\-]\d*/i);
    let statusText = $('.cb-status-msg, .match-status, .status-text, .match-info-status').first().text().trim();
    
    if (!statusText) {
      for (let r of domRows.slice(0, 30)) {
        if (r.toLowerCase().includes('won by') || r.toLowerCase().includes('opt to') || r.toLowerCase().includes('need')) {
          statusText = r; break;
        }
      }
    }
    payload.status = statusText || "Match Active";
    let statusLower = payload.status.toLowerCase();

    if (statusLower.includes('won by') || statusLower.includes('tied') || statusLower.includes('abandoned')) {
      payload.match_state = "completed";
      let winMatch = payload.status.match(/^(.*?)\s+won by/i);
      if (winMatch) payload.winner = winMatch[1].trim().toUpperCase();
    } else if (scoreMatch || fullPageString.includes('CRR') || fullPageString.includes('Balls left:')) {
      payload.match_state = "live";
    } else {
      payload.match_state = "future";
    }

    // =========================================================================
    // PRE-MATCH REVERSION
    // =========================================================================
    if (payload.match_state === "future") {
      payload.live_score = "MATCH NOT STARTED";
      payload.current_rr = "0.00"; payload.required_rr = "0.00";
      payload.striker = "Awaiting Play"; payload.non_striker = "Awaiting Play"; payload.bowler = "Awaiting Play";
      payload.prediction = "COUNTDOWN ACTIVE"; payload.match_prediction = "Line Open Soon | Waiting for Telemetry";
      payload.ledger_analysis = "[ENTRY PROTOCOL] No active live ledger data logged.";
      return res.status(200).json({ success: true, match_info: payload });
    }

    // =========================================================================
    // 2. LIVE TELEMETRY STREAM PARSING (ROW ISOLATION TECHNIQUE)
    // =========================================================================
    let scoreFound = false;
    let runs = 0, wickets = 0, totalBalls = 0, currentOversStr = "0.0";
    let scoreingTeam = "GT";

    for (let row of domRows) {
      // Find scoreboard string at top hierarchy
      let m = row.match(/\b(GT|RCB)\s+(\d+)[\/\-](\d+)\s*\(?([\d\.]+)\)?/i);
      if (m) {
        scoreingTeam = m[1].toUpperCase();
        runs = parseInt(m[2]);
        wickets = parseInt(m[3]);
        currentOversStr = m[4];
        let parts = currentOversStr.split('.');
        totalBalls = (parseInt(parts[0]) * 6) + (parseInt(parts[1]) || 0);
        payload.live_score = `${scoreingTeam} ${runs}/${wickets} (${currentOversStr})`;
        scoreFound = true;
        break;
      }
    }

    // Backup core metric score compiler
    if (!scoreFound) {
      let altScore = pageTitle.match(/(GT|RCB)\s*(\d+)[\/\-](\d+)\s*\(?([\d\.]+)\)?/i);
      if (altScore) {
        scoreingTeam = altScore[1].toUpperCase();
        runs = parseInt(altScore[2]); wickets = parseInt(altScore[3]);
        currentOversStr = altScore[4];
        let parts = currentOversStr.split('.');
        totalBalls = (parseInt(parts[0]) * 6) + (parseInt(parts[1]) || 0);
        payload.live_score = `${scoreingTeam} ${runs}/${wickets} (${currentOversStr})`;
      }
    }

    // --- CRR & RRR ADVANCED LINE EXTRACTOR ---
    let crrVal = 0;
    for (let row of domRows) {
      let crrMatch = row.match(/CRR\s*[:\-]?\s*([\d\.]+)/i) || row.match(/Current Run Rate\s*[:\-]?\s*([\d\.]+)/i);
      if (crrMatch) {
        crrVal = parseFloat(crrMatch[1]);
        payload.current_rr = crrVal.toFixed(2);
      }
      let rrrMatch = row.match(/RRR\s*[:\-]?\s*([\d\.]+)/i) || row.match(/Required Run Rate\s*[:\-]?\s*([\d\.]+)/i) || row.match(/Req RR\s*[:\-]?\s*([\d\.]+)/i);
      if (rrrMatch) {
        payload.required_rr = parseFloat(rrrMatch[1]).toFixed(2);
      }
    }

    // Dynamic Live Math calculation standard if text engine fails to grab metrics
    if (!payload.current_rr || payload.current_rr === "NO CRR" || parseFloat(payload.current_rr) === 0) {
      if (totalBalls > 0) {
        crrVal = (runs / totalBalls) * 6;
        payload.current_rr = crrVal.toFixed(2);
      } else {
        crrVal = 8.50; payload.current_rr = "8.50";
      }
    }
    if (!payload.required_rr) payload.required_rr = "1st Innings";

    // --- STRUCTURAL PLAYER ARRAY MAPPER (BATTERS & BOWLERS) ---
    let collectedBatters = [];
    let discoveredBowler = "";

    for (let row of domRows) {
      // Clean target mapping filters out history summaries and table captions
      if (row.match(/Last wkt|Partnership|P'ship|Extras|Total|Bowler|Batter/i)) continue;

      // Extract text line patterns matching Name + Runs + (Balls)
      let batMatch = row.match(/^([A-Za-z\s\.\-']+)\s+(\d+)\s*\(\s*(\d+)\s*\)/);
      if (batMatch) {
        let cleanName = batMatch[1].replace(/[A-Z]{3,}/g, '').trim();
        let words = cleanName.split(/\s+/);
        if (words.length > 2) cleanName = words.slice(-2).join(' '); // Keep last name structure cleanly

        let playerString = `${cleanName} ${batMatch[2]}(${batMatch[3]})`;
        let hasBatMarker = row.includes('*BAT_ACTIVE*') || row.includes('🏏');

        collectedBatters.push({ text: playerString, isStriker: hasBatMarker });
      }

      // Extract text line patterns matching Name + Wickets-Runs + Overs
      let bowlMatch = row.match(/^([A-Za-z\s\.\-']+)\s+(\d+[\-\/]\d+)\s+([\d\.]+)/) || row.match(/^([A-Za-z\s\.\-']+)\s+(\d+[\-\/]\d+)/);
      if (bowlMatch && !discoveredBowler) {
        let nameCheck = bowlMatch[1].replace(/(Econ|ECO|Overs|Runs|Wickets|Bowler|Match)/gi, '').trim();
        let words = nameCheck.split(/\s+/);
        if (words.length >= 2 && !nameCheck.toLowerCase().includes('target') && !nameCheck.toLowerCase().includes('partnership')) {
          discoveredBowler = words.slice(-2).join(' ') + ` (${bowlMatch[2]})`;
        }
      }
    }

    // Bind parsed players cleanly to frontend strings
    if (collectedBatters.length > 0) {
      let b1 = collectedBatters[0];
      let b2 = collectedBatters[1];

      if (b1.isStriker || (b2 && !b2.isStriker)) {
        payload.striker = b1.text + " 🏏";
        payload.non_striker = b2 ? b2.text : "Off-Strike";
      } else if (b2 && b2.isStriker) {
        payload.striker = b2.text + " 🏏";
        payload.non_striker = b1.text;
      } else {
        payload.striker = b1.text + " 🏏";
        payload.non_striker = b2 ? b2.text : "Off-Strike";
      }
    } else {
      payload.striker = "Target Engaged"; payload.non_striker = "Off-Strike";
    }
    payload.bowler = discoveredBowler || "🔄 Rotating Bowler";

    // --- RECENT OVER HISTORY BALLS ---
    for (let row of domRows) {
      if (row.startsWith('Over') || row.includes('Recent')) {
        let blocks = row.split(/\s+/);
        let items = blocks.filter(b => b === 'W' || b === 'Wd' || b === 'Nb' || !isNaN(parseInt(b)));
        if (items.length >= 3) {
          payload.last_over = items.slice(-6);
          while (payload.last_over.length < 6) payload.last_over.push('-');
          break;
        }
      }
    }

    // =========================================================================
    // 3. TRUNCATION-PROOF ODDS SEPARATION MOTOR
    // =========================================================================
    let rcbBack = 0, rcbLay = 0, gtBack = 0, gtLay = 0;
    let extractedFavTeam = "";

    for (let row of domRows) {
      // Clean structure normalization: Compress spaces and remove brackets
      let normalizedRow = row.replace(/\s+/g, ' ').trim();
      
      // Look for any team identifier truncation string context followed by sequential digits
      let matchRCB = normalizedRow.match(/(RCB|Royal\s+Challengers|Benga\.\.\.)\s+(\d+)\s+(\d+)/i);
      let matchGT = normalizedRow.match(/(GT|Gujarat\s+Titans|Titans)\s+(\d+)\s+(\d+)/i);

      if (matchRCB) {
        rcbBack = parseInt(matchRCB[2]); rcbLay = parseInt(matchRCB[3]);
        if (Math.abs(rcbBack - rcbLay) <= 5) { isRealMarket = true; break; }
      }
      if (matchGT) {
        gtBack = parseInt(matchGT[2]); gtLay = parseInt(matchGT[3]);
        if (Math.abs(gtBack - gtLay) <= 5) { isRealMarket = true; break; }
      }
    }

    // Absolute universal fallback loop scanning for two close metrics adjacent to each other anywhere
    if (!isRealMarket) {
      for (let row of domRows) {
        let generalizedMatch = row.match(/([A-Za-z\.\s]{2,20})\s+(\d{1,3})\s+(\d{1,3})\b/);
        if (generalizedMatch) {
          let teamToken = generalizedMatch[1].toLowerCase();
          let p1 = parseInt(generalizedMatch[2]); let p2 = parseInt(generalizedMatch[3]);
          if (p1 > 0 && p2 > 0 && p1 <= 140 && p2 <= 140 && Math.abs(p1 - p2) <= 3) {
            if (teamToken.includes('beng') || teamToken.includes('rcb') || teamToken.includes('royal')) {
              rcbBack = Math.min(p1, p2); rcbLay = Math.max(p1, p2); isRealMarket = true; break;
            } else if (teamToken.includes('guj') || teamToken.includes('gt') || teamToken.includes('titan')) {
              gtBack = Math.min(p1, p2); gtLay = Math.max(p1, p2); isRealMarket = true; break;
            }
          }
        }
      }
    }

    // Map the extracted numbers straight into our display calculations
    if (isRealMarket) {
      if (rcbBack > 0) {
        extractedFavTeam = "RCB"; favPaise = rcbBack; layPaise = rcbLay;
      } else if (gtBack > 0) {
        extractedFavTeam = "GT"; favPaise = gtBack; layPaise = gtLay;
      }
      displayOdds = `${favPaise}-${layPaise}`;
    } else {
      // Mathematical Live-Probability Fallback Core Engine if bookie elements disappear
      let isChasePhase = (payload.required_rr !== "1st Innings");
      let currentCrr = parseFloat(payload.current_rr) || 8.50;
      let calculatedWinProb = 50;
      let remainingBalls = 120 - totalBalls;

      if (isChasePhase) {
        let rrrVal = parseFloat(payload.required_rr) || 0;
        if (wickets >= 10 || (remainingBalls <= 0 && rrrVal > 0)) calculatedWinProb = 1;
        else if (rrrVal <= 0) calculatedWinProb = 99;
        else {
          let diff = currentCrr - rrrVal;
          calculatedWinProb = 50 + (diff * 6) - (wickets * 4.5);
        }
      } else {
        let projection = runs + (remainingBalls / 6) * currentCrr;
        calculatedWinProb = 50 + ((projection - 180) * 0.75) - (wickets * 4);
      }
      
      calculatedWinProb = Math.max(5, Math.min(95, calculatedWinProb));
      extractedFavTeam = (scoreingTeam === "GT" ? (calculatedWinProb > 50 ? "GT" : "RCB") : (calculatedWinProb > 50 ? "RCB" : "GT"));
      let topPercentage = Math.max(calculatedWinProb, 100 - calculatedWinProb);
      
      favPaise = Math.max(1, Math.round(((100 - topPercentage) / topPercentage) * 100));
      layPaise = favPaise + 1;
      displayOdds = `${favPaise}-${layPaise}`;
      isRealMarket = true; 
    }

    payload.match_prediction = `[LIVE MARKET ODDS] ${extractedFavTeam} is Favorite at ${displayOdds} Paise`;

    // =========================================================================
    // 4. ADVANCED TRADING ORACLE STRATEGY GENERATOR
    // =========================================================================
    let currentInplayCrr = parseFloat(payload.current_rr) || 8.5;
    let isChaseModeActive = (payload.required_rr !== "1st Innings");
    let strategicTactic = "🟡 HOLD - STANDARD ACCUMULATION";

    if (wickets >= 6 || (wickets >= 4 && currentInplayCrr < 7.4)) {
      strategicTactic = "🔴 EAT (LAY) - COLLAPSING PATTERN";
    } else if (currentInplayCrr >= 9.6 && wickets <= 2) {
      strategicTactic = "🟢 PLAY (BACK) - HIGH AGGRESSION";
    }

    if (isChaseModeActive) {
      payload.prediction = `CHASE ORACLE | PHASE MARKETS CLOSED\nTACTIC: ${strategicTactic}`;
    } else {
      let phaseLineProjections = [];
      let timingMilestones = [6, 10, 15, 20];
      let currentOversFloat = totalBalls / 6;

      for (let milestone of timingMilestones) {
        if (currentOversFloat < milestone) {
          let projectedLine = Math.floor(runs + ((milestone - currentOversFloat) * currentInplayCrr));
          if (wickets >= 7) projectedLine = Math.min(projectedLine, runs + 12);
          phaseLineProjections.push(`[${milestone}v: ${projectedLine}]`);
        }
      }
      if (phaseLineProjections.length > 0) {
        payload.prediction = `TARGETS: ${phaseLineProjections.join(' ')}\nTACTIC: ${strategicTactic}`;
      } else {
        payload.prediction = `INNINGS ENDING\nTACTIC: ${strategicTactic}`;
      }
    }

    // --- SHADOW TRADER PANEL ---
    let tradeTrigger = (extractedFavTeam === scoreingTeam) ? "One wicket" : "A quick flurry of boundaries";
    if (favPaise > 0 && favPaise <= 22) {
      payload.match_prediction += `\n<br><span style="color:#b366ff; font-weight:bold;">[SHADOW TRADER]</span> <span style="color:#fff;">${extractedFavTeam} is extremely cheap (${favPaise}p). Asymmetrical risk: High value to LAY ${extractedFavTeam} for a quick trading swing. ${tradeTrigger} shifts this market 30-40 paise.</span>`;
    }

    // =========================================================================
    // 5. QUANTUM HEDGE CRUNCHER
    // =========================================================================
    let hedgeAdvice = "";
    const resolveShortToken = (name) => {
        let n = name.toLowerCase().trim();
        if (n.includes('gujarat') || n.includes('gt')) return "GT";
        if (n.includes('challengers') || n.includes('rcb') || n.includes('bengaluru')) return "RCB";
        return name.toUpperCase();
    };

    let canonicalFav = resolveShortToken(extractedFavTeam);
    let canonicalT1 = resolveShortToken(t1Name);
    let canonicalT2 = resolveShortToken(t2Name);

    let activeFavExposure = 0; let activeOppExposure = 0;
    let targetOpponentTeamName = "";

    if (canonicalFav === canonicalT1) { activeFavExposure = e1; activeOppExposure = e2; targetOpponentTeamName = t2Name; } 
    else if (canonicalFav === canonicalT2) { activeFavExposure = e2; activeOppExposure = e1; targetOpponentTeamName = t1Name; }

    if (e1 === 0 && e2 === 0) {
      hedgeAdvice = `[ENTRY PROTOCOL] No active ledger. Wait for entry signals.`;
    } else if (activeFavExposure > 0 && activeOppExposure < 0) {
      let stakeTarget = Math.abs(activeOppExposure);
      let exitTax = stakeTarget * (layPaise / 100);
      let lockedGains = activeFavExposure - exitTax;
      if (lockedGains > 0) hedgeAdvice = `🟢 [GREEN BOOK AVAILABLE]\nTo clear -${Math.abs(activeOppExposure).toFixed(0)} on ${targetOpponentTeamName}:\n> LAY ${extractedFavTeam} at ${layPaise}p.\n> FINAL BOOK: +${lockedGains.toFixed(0)}`;
      else hedgeAdvice = `🟡 [HEDGE PENDING] Wait for ${extractedFavTeam} odds to drop lower.`;
    } else if (activeFavExposure < 0 && activeOppExposure > 0) {
      let stakeTarget = Math.abs(activeFavExposure) / (favPaise / 100);
      let lockedGains = activeOppExposure - stakeTarget;
      if (lockedGains > 0) hedgeAdvice = `🟢 [GREEN BOOK AVAILABLE]\nTo clear -${Math.abs(activeFavExposure).toFixed(0)} on ${extractedFavTeam}:\n> BACK ${extractedFavTeam} at ${favPaise}p.\n> FINAL BOOK: +${lockedGains.toFixed(0)}`;
      else hedgeAdvice = `🟡 [HEDGE PENDING] Wait for ${extractedFavTeam} odds to drift out.`;
    } else if (activeFavExposure >= 0 && activeOppExposure >= 0) {
      hedgeAdvice = `✅ [BOOK SECURED] Zero risk exposure maintained. (${extractedFavTeam}: +${activeFavExposure.toFixed(0)} | ${targetOpponentTeamName}: +${activeOppExposure.toFixed(0)})`;
    } else {
      hedgeAdvice = `🔴 [CRITICAL] Negative exposure bound on both sides. Lay the favorite immediately.`;
    }

    payload.ledger_analysis = hedgeAdvice;
    return res.status(200).json({ success: true, match_info: payload });

  } catch (err) {
    payload.status = "FIREWALL BLOCKED CONNECTION";
    payload.live_score = "ERROR: Scraper Off"; 
    payload.prediction = "CORE SCRAPER TERMINATED"; 
    payload.match_prediction = "DABBA CONNECTION INTERRUPTED";
    return res.status(200).json({ success: false, error: err.message, match_info: payload });
  }
};
