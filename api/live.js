// ==============================================================================
// MI6 QUANTUM ORACLE - CORE SCRAPING ENGINE & DATA ISOLATION PROTOCOL
// Version: 9.0.0 (Row-by-Row DOM Isolation)
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

  // --- QUERY PARAMETERS ---
  let targetUrl = req.query.url || "";
  let targetTeams = (req.query.teams || "").toLowerCase().trim();
  let rawDateStr = req.query.time || "";
  let targetDate = rawDateStr.split('(')[0].trim().toLowerCase();
  let userPosition = (req.query.position || "NONE").toUpperCase().trim();

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 13; SM-G991U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
  };

  // --- INITIAL PAYLOAD STRUCTURE ---
  // Notice: striker/non_striker removed. Replaced with batter_1/batter_2 to preserve UP/DOWN order.
  let payload = {
    title: "TARGET UNKNOWN", status: "Scanning Fields...", match_state: "standby", winner: "PENDING",
    live_score: "NO SCORE", current_rr: "NO CRR", required_rr: "NO REQ",
    batter_1: "NO BATTER 1", batter_2: "NO BATTER 2", bowler: "NO BOWLER",
    toss: "NO TOSS DATA", venue: "VENUE HIDDEN", last_over: ["-", "-", "-", "-", "-", "-"],
    prediction: "AI OFFLINE", match_prediction: "", source_url: "Hunting...", fetch_code: "OH"
  };

  let pageTitle = ""; let rawHtmlData = ""; let espnMatchData = null; let $ = null;

  // --- COMPREHENSIVE TEAM ALIAS DICTIONARY ---
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

  function escapeRegExp(str) { return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  let t1 = targetTeams.split(' vs ')[0]?.trim().split(' ')[0] || "unknown";
  let t2 = targetTeams.split(' vs ')[1]?.trim().split(' ')[0] || "unknown";
  const t1A = teamAliases[t1] || [t1]; const t2A = teamAliases[t2] || [t2];

  function matchesTeams(txt) {
    if (!txt) return false;
    return t1A.some(a => txt.includes(a)) && t2A.some(a => txt.includes(a));
  }

  // ==============================================================================
  // PHASE 1: DATA ACQUISITION & UPLINK
  // ==============================================================================
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
          rawHtmlData = $('body').html() || "";
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
          rawHtmlData = $('body').html() || "";
          payload.source_url = "CRICBUZZ (Tier 2 Failsafe)"; htmlAcquired = true;
        }
      } catch (e) { }
    }

    payload.fetch_code = htmlAcquired ? "UREKHA" : "OH";
    if (!htmlAcquired) {
      payload.status = "UPLINK FAILED: ALL TARGETS BLOCKED"; payload.title = "UPLINK FAILED";
      return res.status(200).json({ success: true, match_info: payload });
    }

    // ==============================================================================
    // PHASE 2: HTML PRE-PROCESSING & ROW ISOLATION
    // This is the core fix. We chop the HTML into isolated rows so names and scores 
    // mathematically cannot mix together. We also expose hidden bat SVGs.
    // ==============================================================================
    
    // 1. Expose the hidden SVG bat icons and dynamic active classes
    rawHtmlData = rawHtmlData.replace(/<svg[^>]*>.*?<\/svg>/gi, ' *BAT* ');
    rawHtmlData = rawHtmlData.replace(/<img[^>]*(bat|striker|active)[^>]*>/gi, ' *BAT* ');
    rawHtmlData = rawHtmlData.replace(/class="[^"]*(active)[^"]*"/gi, ' *BAT* ');

    // 2. Create Hard Row Boundaries
    rawHtmlData = rawHtmlData.replace(/<\/?(div|tr|p|li|table|tbody)[^>]*>/gi, ' |ROW| ');
    rawHtmlData = rawHtmlData.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&');

    // 3. Strip remaining HTML safely
    let cleanText = rawHtmlData.replace(/<[^>]+>/g, ' ');
    
    // 4. Create an array of strictly isolated text rows
    let domRows = cleanText.split('|ROW|').map(r => r.replace(/\s+/g, ' ').trim()).filter(r => r.length > 0);
    let fullBodyText = domRows.join(' '); // Used for generic regex lookups

    // ==============================================================================
    // PHASE 3: BASIC TELEMETRY EXTRACTION
    // ==============================================================================
    try {
      let finalTitle = "";
      let vsMatch = pageTitle.match(/([a-zA-Z0-9\s]+?\s+(?:vs|v)\s+[a-zA-Z0-9\s]+)/i);
      if (!vsMatch) vsMatch = fullBodyText.match(/([a-zA-Z0-9\s]+?\s+(?:vs|v)\s+[a-zA-Z0-9\s]+)/i);
      if (vsMatch) finalTitle = vsMatch[1];
      else if (targetTeams) finalTitle = targetTeams;
      else if (pageTitle && pageTitle.length > 5) finalTitle = pageTitle.split(/[,|]/)[0];

      if (finalTitle) payload.title = finalTitle.replace(/live score/i, '').replace(/live/i, '').replace(/cricket/i, '').trim().toUpperCase();
      else payload.title = "LIVE MATCH ACTIVE";

      let venueMatch = fullBodyText.match(/Venue\s*:\s*([^•|{]+)/i);
      if (venueMatch) { payload.venue = venueMatch[1].trim(); } 
      else {
        let homeCode = t1A[0];
        if (homeVenues[homeCode]) payload.venue = homeVenues[homeCode];
      }

      let statusText = $ ? $('.cb-status-msg, .match-status, .info-status, .cb-text-complete').first().text().trim() : "";
      let titleWin = pageTitle.match(/([a-zA-Z\s\-]+won by\s\d+\s(?:runs|wickets|run|wicket))/i);
      if (!statusText && titleWin) statusText = titleWin[1].trim();
      if (statusText) payload.status = statusText;

      let statusLower = (statusText || "").toLowerCase();
      let isLiveScoreFormat = fullBodyText.match(/[A-Z]{2,4}\s\d+[\/\-]\d+/);

      if (statusLower.includes('won by') || statusLower.includes('tied') || statusLower.includes('abandoned')) {
        payload.match_state = "completed";
        if (statusLower.includes('won by')) {
          let winMatch = statusText.match(/^(.*?)\s+won by/i);
          if (winMatch) { payload.winner = winMatch[1].trim(); }
        } else if (statusLower.includes('tied')) { payload.winner = "TIED"; } 
        else { payload.winner = "NO RESULT"; }
      } else if (isLiveScoreFormat && (fullBodyText.includes('CRR:') || fullBodyText.includes('REQ:') || fullBodyText.match(/Players Entering/i))) {
        payload.match_state = "live";
      } else {
        payload.match_state = "future";
      }
    } catch (e) { payload.match_state = "standby"; }

    try {
      let tossResult = "";
      if ($) tossResult = $('.cb-toss-sts, .toss-result, .match-info-toss, .toss, .toss-text, .match-detail-toss').first().text().trim();
      if (!tossResult) {
        let tossMatch = fullBodyText.match(/([A-Za-z\s\.\-]+(?:won the toss|opt(?:ed|s)? to|elect(?:ed|s)? to|chose to|decided to)\s(?:bat|bowl|field)(?:\sfirst)?)/i);
        if (!tossMatch) tossMatch = fullBodyText.match(/Toss\s*:\s*([^•|{\(]+)/i);
        if (tossMatch) tossResult = tossMatch[1].trim();
      }
      if (tossResult && tossResult.length > 5 && tossResult.length < 100) payload.toss = tossResult;
      else payload.toss = "Tracking Toss Data...";
    } catch (e) { payload.toss = "Toss Error"; }

    // ==============================================================================
    // PHASE 4: LIVE METRICS & ROW-BY-ROW DOM ISOLATION (THE FINAL FIX)
    // ==============================================================================
    if (payload.match_state === "live") {
      try {
        if (payload.status === "Scanning Fields..." || payload.status === "") {
          if (fullBodyText.match(/innings break/i)) payload.status = "Innings Break";
          else if (fullBodyText.match(/strategic timeout/i)) payload.status = "Strategic Timeout";
          else if (fullBodyText.match(/rain stop/i) || fullBodyText.match(/delay/i)) payload.status = "Weather/Delay Protocol";
          else if (fullBodyText.match(/Players Entering/i)) payload.status = "Players Entering";
          else payload.status = "Live Match Active";
        }
      } catch (e) { payload.status = "Status Error"; }

      try {
        let scoreRegex = /([A-Z]{2,4}\s\d+[\/\-]\d+\s*\(?\d+\.\d+\)?)/;
        let scoreMatch = pageTitle.match(scoreRegex);
        if (!scoreMatch) scoreMatch = fullBodyText.match(scoreRegex);
        if (scoreMatch) {
          let rawScore = scoreMatch[1];
          let parts = rawScore.match(/([A-Z]{2,4})\s*(\d+)[\/\-](\d+)\s*\(?([\d\.]+)\)?/);
          if (parts) payload.live_score = `${parts[1]} ${parts[2]}/${parts[3]} (${parts[4]})`;
          else payload.live_score = rawScore.replace('-', '/');
        }
      } catch (e) { payload.live_score = "Score Error"; }

      try {
        let crrMatch = fullBodyText.match(/CRR:\s*([\d\.]+)/i);
        if (crrMatch) payload.current_rr = crrMatch[1];
        let reqMatch = fullBodyText.match(/(?:REQ|RRR|Req RR)\s*[:-]?\s*([\d\.]+)/i);
        if (reqMatch) payload.required_rr = reqMatch[1];
        else payload.required_rr = "1st Innings";
      } catch (e) { payload.current_rr = "Error"; payload.required_rr = "Error"; }

      // ----------------------------------------------------------------------------
      // ISOLATED BATTER EXTRACTION (PREVENTS NAME & SCORE BLEEDING)
      // ----------------------------------------------------------------------------
      try {
        let validBatters = [];
        let batterRegex = /([A-Za-z\s\.\-']{3,25}?)\s*(?:\*BAT\*|\*|🏏)?\s+(\d{1,3})\s*\*?\s*\(\s*(\d{1,3})\s*\)/;
        
        for (let r of domRows) {
            // ANTI-DEAD-BATTER SHIELD: Ignore any rows tracking historical stats
            if (r.match(/Last wkt|Last wicket|Partnership|P'ship|Total|Extras|Yet to Bat/i)) continue;

            let m = r.match(batterRegex);
            if (m) {
                let rawName = m[1].trim();
                if (rawName.toLowerCase().includes('batter') || rawName.toLowerCase().includes('batsman')) continue;
                
                // Detect the exposed *BAT* tag ANYWHERE in the isolated row
                let isStriker = r.includes('*BAT*') || r.includes('*') || r.includes('🏏');
                let cleanName = rawName.replace(/[A-Z]{3,}/g, '').trim();
                
                // Construct the final string for the app
                let finalString = `${cleanName} ${m[2]}(${m[3]})`;
                
                validBatters.push({
                    name: cleanName,
                    text: finalString,
                    isStriker: isStriker
                });
            }
        }

        // Deduplicate in case of nested HTML loops
        let uniqueBatters = [];
        validBatters.forEach(b => { if (!uniqueBatters.find(u => u.name === b.name)) uniqueBatters.push(b); });

        if (uniqueBatters.length > 0) {
            let b1 = uniqueBatters[0];
            let b2 = uniqueBatters.length > 1 ? uniqueBatters[1] : null;

            // Apply 🏏 symbol strictly based on the extracted isStriker flag
            payload.batter_1 = b1.text + (b1.isStriker ? " 🏏" : "");
            payload.batter_2 = b2 ? (b2.text + (b2.isStriker ? " 🏏" : "")) : "";

            // Fail-safe: if neither triggered the bat, give it to the first player
            if (!payload.batter_1.includes('🏏') && !payload.batter_2.includes('🏏')) {
                payload.batter_1 += " 🏏";
            }
        } else {
            payload.batter_1 = "Target Engaged";
            payload.batter_2 = "Standby";
        }

        if (payload.live_score && payload.live_score.includes('0/0 (0.0)')) { 
            payload.batter_1 = "Awaiting Batters"; payload.batter_2 = "Standby"; 
        }
      } catch (e) { 
          payload.batter_1 = "Extractor Error"; payload.batter_2 = "Extractor Error"; 
      }

      // ----------------------------------------------------------------------------
      // ISOLATED BOWLER EXTRACTION
      // ----------------------------------------------------------------------------
      try {
        let bowlerStr = "Active Bowler";
        for (let r of domRows) {
            if (r.match(/Last wkt|Partnership|P'ship|Batter|Batsman|Total/i)) continue;
            let bowMatch = r.match(/([A-Z][a-zA-Z\s\.\-']{2,25}?)\s+(\d{1,2}\s*\-\s*\d{1,3}|\d{1,2}\s*\.\s*\d{1,2}\s+\d)/);
            if (bowMatch) {
                let cleanBowler = bowMatch[1].replace(/(Econ|ECO|Overs|Runs|Wickets|Bowler|IMP)/gi, '').replace(/[A-Z]{3,}/g, '').trim();
                let words = cleanBowler.replace(/\s+/g, ' ').split(' ');
                bowlerStr = words.slice(-2).join(' ');
                break; // Stop at first valid bowler found
            }
        }
        payload.bowler = bowlerStr;
        if (payload.live_score && payload.live_score.includes('0/0 (0.0)')) payload.bowler = "Awaiting Bowler";
      } catch (e) { payload.bowler = "Extractor Error"; }

      // ----------------------------------------------------------------------------
      // RECENT OVERS RADAR
      // ----------------------------------------------------------------------------
      try {
        let recentTextMatch = fullBodyText.match(/Recent\s*:\s*([W0-9NbLwd|\s]+)/i);
        if (recentTextMatch) {
          payload.last_over = recentTextMatch[1].split(/[|\s]+/).filter(b => b.trim()).slice(-6);
        } else {
          let overMatches = [...fullBodyText.matchAll(/Over\s+\d+\s+([W0-9Nbwd\s]+?)(?:Over|=|$)/gi)];
          if (overMatches.length > 0) {
            let lastOverStr = overMatches[overMatches.length - 1][1];
            let arr = lastOverStr.split(/\s+/).filter(b => b.trim() && !b.includes('='));
            payload.last_over = arr.slice(-6);
            if (payload.last_over.length === 0) payload.last_over = ["-", "-", "-", "-", "-", "-"];
          } else { payload.last_over = ["-", "-", "-", "-", "-", "-"]; }
        }
      } catch (e) { payload.last_over = ["E", "R", "R", "O", "R", "!"]; }

      // ==============================================================================
      // PHASE 5: PRO BOOKIE AI & LIVE MARKET SNIPER
      // ==============================================================================
      try {
        if (payload.live_score.includes('/')) {
          let scoreMatchClean = payload.live_score.match(/(\d+)[\/\-](\d+)\s*\(?([\d\.]+)\)?/);
          let batTeam = payload.live_score.split(' ')[0] || "Batting Team";

          if (scoreMatchClean) {
            let runs = parseInt(scoreMatchClean[1]); let wkts = parseInt(scoreMatchClean[2]);
            let oversSplit = scoreMatchClean[3].split('.');
            let overs = parseInt(oversSplit[0]); let balls = oversSplit[1] ? parseInt(oversSplit[1]) : 0;
            let totalBalls = (overs * 6) + balls;

            let recentRuns = 0; let validBalls = 0; let dotBalls = 0; let recentWicketFell = false; let recentBoundaries = 0;
            payload.last_over.forEach(b => {
              if (b === 'W') { recentWicketFell = true; validBalls++; }
              else if (b === 'Wd' || b === 'Nb') recentRuns += 1;
              else if (!isNaN(parseInt(b))) {
                let val = parseInt(b); recentRuns += val; validBalls++;
                if (val === 0) dotBalls++;
                if (val === 4 || val === 6) recentBoundaries++;
              }
            });

            let crr = parseFloat(payload.current_rr);
            if (isNaN(crr) || totalBalls === 0) crr = 8.5;

            let recentRR = validBalls > 0 ? (recentRuns / validBalls) * 6 : crr;
            let blendedRR = totalBalls > 0 ? ((recentRR * 0.6) + (crr * 0.4)) : 8.5;

            let isChase = (payload.required_rr && !payload.required_rr.includes("REQ") && payload.required_rr !== "1st Innings" && payload.required_rr !== "Error");
            let rrrVal = isChase ? parseFloat(payload.required_rr) : 0;
            
            let isWeatherInterrupted = (payload.status.toLowerCase().includes('rain') || payload.status.toLowerCase().includes('weather') || payload.status.toLowerCase().includes('dls'));

            if (isChase) { 
              if (isWeatherInterrupted) payload.prediction = `🔴 DLS PROTOCOL ACTIVE | HALT PHASE BETS`;
              else payload.prediction = `CHASE ORACLE | PHASE MARKETS CLOSED (1st Innings Only)`; 
            }
            else {
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
                    let projected = Math.floor(runs + (oversLeft * blendedRR));
                    if (wkts >= 8) projected = Math.min(projected, runs + 10);
                    projections.push(`[${m}v: ${projected}]`);
                  }
                }
                if (wkts >= 7 || (wkts >= 4 && blendedRR < 7)) phaseTactic = "🔴 EAT (LAY) - COLLAPSING PATTERN";
                else if (recentWicketFell && blendedRR < 8) phaseTactic = "🟡 HOLD - PATTERN UNSTABLE";
                else if (blendedRR >= 10 && wkts <= 3) phaseTactic = "🟢 PLAY (BACK) - HIGH AGGRESSION";
                else phaseTactic = "🟡 HOLD - STANDARD ACCUMULATION";
              }

              if (projections.length > 0 && !isWeatherInterrupted) payload.prediction = `TARGETS: ${projections.join(' ')} \nTACTIC: ${phaseTactic}`;
              else payload.prediction = `INNINGS ENDING \nTACTIC: ${phaseTactic}`;
            }

            let batWinProb = 50;
            let ballsRemaining = 120 - totalBalls;

            if (isChase) {
              if (totalBalls === 0) { batWinProb = 50; if (rrrVal > 9.5) batWinProb -= 10; else if (rrrVal < 8.0) batWinProb += 10; }
              else if (wkts >= 10 || (ballsRemaining <= 0 && rrrVal > 0)) { batWinProb = 1; }
              else if (rrrVal <= 0) { batWinProb = 99; }
              else {
                let baseProb = 50; let rrDiff = crr - rrrVal;
                if (rrrVal > 10.5) baseProb -= (rrrVal - 10.5) * 8;
                else if (rrrVal < 8.5) baseProb += (8.5 - rrrVal) * 5;

                let parWickets = (totalBalls / 120) * 10; let wicketDiff = parWickets - wkts;
                baseProb += (wicketDiff * 3.5);
                if (rrDiff > 0) baseProb += (rrDiff * 3); else baseProb += (rrDiff * 5);
                if (recentWicketFell) baseProb -= 4;
                batWinProb = Math.max(5, Math.min(95, baseProb));
              }
            } else {
              if (totalBalls === 0) {
                batWinProb = 50;
              } else {
                let parScore = 175; let projected = runs + (ballsRemaining / 6) * blendedRR;
                let baseProb = 50 + ((projected - parScore) * 0.8);
                baseProb -= (wkts * 3); if (recentWicketFell) baseProb -= 4;
                batWinProb = Math.max(5, Math.min(95, baseProb));
              }
            }

            let maxProb = Math.max(batWinProb, 100 - batWinProb);
            if (maxProb > 55 && maxProb < 90) maxProb = 50 + ((maxProb - 50) * 0.75);

            let favPaise = Math.max(1, Math.round(((100 - maxProb) / maxProb) * 100));
            let layPaise = favPaise + 2;
            let favTeam = batWinProb > 50 ? batTeam : "Bowling Team";
            let isRealMarket = false;
            let displayOdds = `${favPaise}-${layPaise}`;

            // ----------------------------------------------------------------------------
            // NEW DOM-ROW ODDS EXTRACTOR (Bypasses hidden icons to guarantee True Odds)
            // ----------------------------------------------------------------------------
            let oddsFound = false;
            for (let r of domRows) {
                if (oddsFound) break;
                // Check map aliases against strict row isolation
                for (const [code, aliases] of Object.entries(teamAliases)) {
                    for (const alias of aliases) {
                        // Regex looks for exact alias, followed by max 30 chars, then two numbers
                        let re = new RegExp(`\\b${escapeRegExp(alias)}\\b.*?(\\d{1,3})\\s+(\\d{1,3})\\b`, 'i');
                        let m = r.match(re);
                        if (m) {
                            let p1 = parseInt(m[1]); let p2 = parseInt(m[2]);
                            // Must be valid odds spread (e.g. 83 84)
                            if (Math.abs(p1 - p2) <= 4 && p1 > 0 && p2 < 150 && p1 !== p2) {
                                favTeam = code.toUpperCase();
                                favPaise = Math.min(p1, p2);
                                layPaise = Math.max(p1, p2);
                                displayOdds = `${favPaise}-${layPaise}`;
                                maxProb = (100 / (100 + favPaise)) * 100;
                                isRealMarket = true;
                                oddsFound = true;
                                break;
                            }
                        }
                    }
                    if (oddsFound) break;
                }
            }

            let pitchProfile = "Balanced/Standard"; let expectedPar = 175;
            for (let key in venueProfiles) {
              if (payload.venue.toLowerCase().includes(key)) {
                pitchProfile = venueProfiles[key].type; expectedPar = venueProfiles[key].par; break;
              }
            }

            let sSR = 0;
            // Extract the strike rate from the payload strings safely to predict micro-matchup
            let strikerString = payload.batter_1.includes('🏏') ? payload.batter_1 : payload.batter_2;
            let sMatch = strikerString.match(/(\d+)\s*\(\s*(\d+)\s*\)/);
            if (sMatch) {
              let sRuns = parseInt(sMatch[1]); let sBalls = parseInt(sMatch[2]);
              if (sBalls > 0) sSR = (sRuns / sBalls) * 100;
            }

            let matchupState = "NEUTRAL";
            if (recentWicketFell || (dotBalls >= 3 && sSR < 120 && totalBalls > 5)) matchupState = "BOWLER_DOMINATING";
            else if (recentBoundaries >= 2 || (sSR >= 160)) matchupState = "BATTER_DOMINATING";

            let microString = `[PITCH] ${pitchProfile} (Par ~${expectedPar}). `;
            if (matchupState === "BOWLER_DOMINATING") microString += `[MATCHUP] Bowler applying heavy pressure. Striker struggling. `;
            else if (matchupState === "BATTER_DOMINATING") microString += `[MATCHUP] Striker in brutal form (SR: ${sSR.toFixed(0)}). Bowler bleeding. `;
            else microString += `[MATCHUP] Consolidation phase. Strike rotation active. `;

            if (userPosition === "NONE" && totalBalls > 0) {
              if (matchupState === "BOWLER_DOMINATING") microString += `[FORECAST] Expect a wicket or maiden. Odds for ${batTeam} will drift higher. Lay ${batTeam} for a quick scalp.`;
              else if (matchupState === "BATTER_DOMINATING") microString += `[FORECAST] Expect a massive over. Odds for ${batTeam} will crash. Good entry to Back ${batTeam}.`;
              else microString += `[FORECAST] Market will likely remain stable for the next 6 balls.`;
            }

            let tag = isRealMarket ? "[LIVE MARKET ODDS]" : "[TRUE ODDS]";
            let matchTactic = `${tag} ${favTeam} is Favorite at ${displayOdds} Paise\nWin Probability: ${maxProb.toFixed(0)}%|${microString}|`;

            if (isWeatherInterrupted) {
               matchTactic = `🔴 DLS WARNING | RAIN/WEATHER DELAY DETECTED|[ANALYSIS] Match conditions have fundamentally changed. Original phase math is void.|[DIRECTIVE] 🔴 HARD STOP. Freeze all trading entries until revised targets are official.`;
            } else if (totalBalls === 0 && !isRealMarket) {
              matchTactic = `${tag} Book Open at 95-98 Paise (Even)\nWin Probability: 50%|[ANALYSIS] Match is initiating. Awaiting powerplay market data.|[DIRECTIVE] 🟡 HOLD. Keep capital reserved until trend emerges.`;
            } else {
              if (maxProb >= 95 || favPaise <= 5) {
                if (userPosition === favTeam) matchTactic += `[DIRECTIVE] 🟢 BOOK SET. Market is dead (${favPaise}p). Green book and close app.`;
                else matchTactic += `[DIRECTIVE] 🔴 DEAD MARKET. Do not put fresh capital in at ${favPaise}p. Risk-to-reward is mathematically unviable.`;
              } 
              else if (maxProb > 80 || favPaise <= 25) {
                if (userPosition === favTeam) {
                    matchTactic += `[DIRECTIVE] 🟢 BOOK SET OPPORTUNITY. You have a position on ${favTeam}. EAT (Lay) ${favTeam} at ${layPaise}p to recover initial stake and guarantee a Green Book.`;
                } else if (userPosition !== "NONE" && userPosition !== favTeam) {
                    matchTactic += `[DIRECTIVE] 🚨 LOSS-CUT WARNING: Your position on ${userPosition} is failing. ${favTeam} is dominating. Consider exiting now (Lay ${userPosition} / Back ${favTeam}) to save remaining capital before odds hit 1 paise.`;
                } else {
                    matchTactic += `[DIRECTIVE] 🟡 HOLD / NO ENTRY. Odds are too low (${favPaise}p) to Back ${favTeam} safely. Wait for a wicket spike.`;
                }
              } else if (isChase) {
                if (totalBalls === 0) matchTactic += `[DIRECTIVE] 🟡 PLAY (Back) ${favTeam} at ${favPaise}p if supporting the favorite, or HOLD.`;
                else if (maxProb < 15 && favTeam !== batTeam) matchTactic += `[DIRECTIVE] 🔴 EAT (Lay) ${batTeam} heavily at ${layPaise}p if odds spike on a boundary.`;
                else if (rrrVal > 9.5 && wkts < 4) matchTactic += `[DIRECTIVE] 🔴 EAT (Lay) ${batTeam} at ${layPaise}p. Wait for panic.`;
                else matchTactic += `[DIRECTIVE] 🟡 SCALP ENTRY: Wait for a 15-20 paise swing before entering a new position.`;
              } else {
                if (totalBalls === 0) matchTactic += `[DIRECTIVE] 🟡 PLAY (Back) ${favTeam} at ${favPaise}p if supporting the favorite, or HOLD.`;
                else if (wkts >= 5 || matchupState === "BOWLER_DOMINATING") matchTactic += `[DIRECTIVE] 🔴 EAT (Lay) ${batTeam} at ${layPaise}p. Bowling team in absolute control.`;
                else matchTactic += `[DIRECTIVE] 🟡 HOLD. Watch the final explosion before committing capital.`;
              }
            }

            payload.match_prediction = matchTactic;
          } else {
            payload.prediction = "ORACLE: AWAITING SUFFICIENT DATA"; payload.match_prediction = "[TRUE ODDS] AWAITING TELEMETRY|[ANALYSIS] Processing Match Data...|[DIRECTIVE] N/A";
          }
        } else {
          payload.prediction = "ORACLE: OFFLINE"; payload.match_prediction = "[TRUE ODDS] SYSTEM OFFLINE|[ANALYSIS] Re-establish Uplink.|[DIRECTIVE] N/A";
        }
      } catch (e) { payload.prediction = "Quantum Core Error"; payload.match_prediction = "Core Error"; }
    }
    else if (payload.match_state === "completed" || payload.match_state === "future") {
      payload.live_score = payload.match_state === "completed" ? "Match Ended" : "Match Not Started";
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
