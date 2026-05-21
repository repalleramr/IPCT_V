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
  let targetDate = rawDateStr.split('(')[0].trim().toLowerCase();
  
  const headers = { 
      'User-Agent': 'Mozilla/5.0 (Linux; Android 13; SM-G991U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
  };

  let payload = {
        title: "TARGET UNKNOWN", status: "Scanning Fields...", match_state: "standby",
        live_score: "NO SCORE", current_rr: "NO CRR", required_rr: "NO REQ",
        striker: "NO STRIKER", non_striker: "NO NON-STRIKER", bowler: "NO BOWLER",
        toss: "NO TOSS DATA", venue: "VENUE HIDDEN", last_over: ["-", "-", "-", "-", "-", "-"],
        prediction: "AI OFFLINE", match_prediction: "", source_url: "Hunting...", fetch_code: "OH"
  };

  let pageTitle = ""; let bodyText = ""; let espnMatchData = null; let $ = null; 

  const teamAliases = {
      "chennai": ["csk", "chennai", "super kings"], "lucknow": ["lsg", "lucknow", "super giants"],
      "mumbai": ["mi", "mumbai", "indians"], "punjab": ["pbks", "punjab", "kings"],
      "delhi": ["dc", "delhi", "capitals"], "gujarat": ["gt", "gujarat", "titans"],
      "kolkata": ["kkr", "kolkata", "knight riders"], "rajasthan": ["rr", "rajasthan", "royals"],
      "royal": ["rcb", "bengaluru", "bangalore", "challengers"], "sunrisers": ["srh", "hyderabad", "sunrisers"]
  };

  const homeVenues = {
      "csk": "M.A. Chidambaram Stadium, Chennai",
      "lsg": "Ekana Cricket Stadium, Lucknow",
      "mi": "Wankhede Stadium, Mumbai",
      "pbks": "Mullanpur / Mohali",
      "dc": "Arun Jaitley Stadium, Delhi",
      "gt": "Narendra Modi Stadium, Ahmedabad",
      "kkr": "Eden Gardens, Kolkata",
      "rr": "Sawai Mansingh Stadium, Jaipur",
      "rcb": "M. Chinnaswamy Stadium, Bengaluru",
      "srh": "Rajiv Gandhi Intl Stadium, Hyderabad"
  };

  let t1 = targetTeams.split(' vs ')[0]?.trim().split(' ')[0] || "unknown";
  let t2 = targetTeams.split(' vs ')[1]?.trim().split(' ')[0] || "unknown";
  const t1A = teamAliases[t1] || [t1]; const t2A = teamAliases[t2] || [t2];

  function matchesTeams(txt) {
      if (!txt) return false;
      return t1A.some(a => txt.includes(a)) && t2A.some(a => txt.includes(a));
  }

  try {
      let htmlAcquired = false;
      let timestampBuster = Date.now(); 

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
                  pageTitle = $('title').text() || ""; bodyText = $('body').text().replace(/\s+/g, ' ');
                  payload.source_url = "CREX (Tier 1 Speed)"; htmlAcquired = true;
              }
          } catch (e) {}
      }

      if (!htmlAcquired) {
          try {
              let cbUrl = targetUrl.includes('cricbuzz') ? targetUrl.replace('www.cricbuzz.com', 'm.cricbuzz.com') : ""; 
              if (!cbUrl && targetTeams) {
                  const searchDirs = [ `https://m.cricbuzz.com/cricket-match/live-scores?_t=${timestampBuster}`, `https://m.cricbuzz.com/cricket-match/live-scores/upcoming?_t=${timestampBuster}` ];
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
                  pageTitle = $('title').text() || ""; bodyText = $('body').text().replace(/\s+/g, ' ');
                  payload.source_url = "CRICBUZZ (Tier 2 Failsafe)"; htmlAcquired = true;
              }
          } catch (e) {}
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
          } catch (e) {}
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
          
          // ==========================================
          // CORE SCORE FORMAT FIX (Handles missing parenthesis: MI 0-0 0.0)
          // ==========================================
          let isLiveScoreFormat = bodyText.match(/[A-Z]{2,4}\s\d+[\/\-]\d+/);
          
          if (statusLower.includes('won by') || statusLower.includes('tied') || statusLower.includes('abandoned')) {
              payload.match_state = "completed";
          } else if (isLiveScoreFormat && (bodyText.includes('CRR:') || bodyText.includes('REQ:') || bodyText.match(/Players Entering/i) || (espnMatchData && espnMatchData.status === "Live"))) {
              payload.match_state = "live";
          } else {
              payload.match_state = "future";
          }
      } catch (e) { payload.match_state = "standby"; }

      try {
          let tossMatch = bodyText.match(/([A-Za-z\s\.\-]+(?:won the toss|opt(?:ed|s)? to|elect(?:ed|s)? to|chose to)\s(?:bat|bowl|field))/i);
          if (!tossMatch) tossMatch = bodyText.match(/Toss\s*:\s*([^•|{\(]+)/i);
          if (tossMatch) payload.toss = tossMatch[1].trim();
          else if (espnMatchData && espnMatchData.tossResults) payload.toss = espnMatchData.tossResults.text;
          if (payload.toss.length > 50) payload.toss = "Tracking Toss Data...";
      } catch (e) { payload.toss = "Toss Error"; }

      if (payload.match_state === "live") {
          try {
              if (payload.status === "Scanning Fields..." || payload.status === "") {
                  if (bodyText.match(/innings break/i)) payload.status = "Innings Break";
                  else if (bodyText.match(/strategic timeout/i)) payload.status = "Strategic Timeout";
                  else if (bodyText.match(/rain stop/i) || bodyText.match(/delay/i)) payload.status = "Weather/Delay Protocol";
                  else if (bodyText.match(/Players Entering/i)) payload.status = "Players Entering";
                  else payload.status = "Live Match Active";
              }
          } catch(e) { payload.status = "Status Error"; }

          try {
              // ADVANCED SCORE EXTRACTION: Captures both MI 0/0 (0.0) and MI 0-0 0.0
              let scoreRegex = /([A-Z]{2,4}\s\d+[\/\-]\d+\s*\(?\d+\.\d+\)?)/;
              let scoreMatch = pageTitle.match(scoreRegex);
              if (!scoreMatch) scoreMatch = bodyText.match(scoreRegex);
              
              if (scoreMatch) {
                  let rawScore = scoreMatch[1];
                  let parts = rawScore.match(/([A-Z]{2,4})\s*(\d+)[\/\-](\d+)\s*\(?([\d\.]+)\)?/);
                  if (parts) {
                      payload.live_score = `${parts[1]} ${parts[2]}/${parts[3]} (${parts[4]})`;
                  } else {
                      payload.live_score = rawScore.replace('-', '/');
                  }
              } else if (espnMatchData) {
                  payload.live_score = `${espnMatchData.teams[0].score || ''} vs ${espnMatchData.teams[1].score || ''}`;
              }
          } catch(e) { payload.live_score = "Score Error"; }

          try {
              let crrMatch = bodyText.match(/CRR:\s*([\d\.]+)/i);
              if (crrMatch) payload.current_rr = crrMatch[1];
              let reqMatch = bodyText.match(/(?:REQ|RRR|Req RR)\s*[:-]?\s*([\d\.]+)/i);
              if (reqMatch) payload.required_rr = reqMatch[1];
              else {
                  if (espnMatchData && espnMatchData.liveInning && espnMatchData.liveInning.requiredRunRate) payload.required_rr = espnMatchData.liveInning.requiredRunRate.toString();
                  else payload.required_rr = "1st Innings";
              }
          } catch(e) { payload.current_rr = "Error"; payload.required_rr = "Error"; }

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
                      if (nameOnly.length > 2 && !nameOnly.toLowerCase().includes('total')) {
                          validBatters.push(`${nameOnly} ${m[2]}(${m[3]})`);
                      }
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
          } catch(e) { payload.striker = "Extractor Error"; payload.non_striker = "Extractor Error"; }

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
          } catch(e) { payload.bowler = "Extractor Error"; }

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
          } catch(e) { payload.last_over = ["E", "R", "R", "O", "R", "!"]; }

          // ==========================================================
          // [TARGET #13] PRO BOOKIE AI & LIVE MARKET SNIPER
          // ==========================================================
          try {
              if (payload.live_score.includes('/')) {
                  let scoreMatchClean = payload.live_score.match(/(\d+)[\/\-](\d+)\s*\(?([\d\.]+)\)?/);
                  let batTeam = payload.live_score.split(' ')[0] || "Batting Team";

                  if (scoreMatchClean) {
                      let runs = parseInt(scoreMatchClean[1]); let wkts = parseInt(scoreMatchClean[2]);
                      let oversSplit = scoreMatchClean[3].split('.');
                      let overs = parseInt(oversSplit[0]); let balls = oversSplit[1] ? parseInt(oversSplit[1]) : 0;
                      let totalBalls = (overs * 6) + balls;

                      let recentRuns = 0; let validBalls = 0; let dotBalls = 0; let recentWicketFell = false;
                      payload.last_over.forEach(b => {
                          if (b === 'W') recentWicketFell = true;
                          else if (b === 'Wd' || b === 'Nb') recentRuns += 1;
                          else if (!isNaN(parseInt(b))) { 
                              let val = parseInt(b); recentRuns += val; validBalls++; 
                              if (val === 0) dotBalls++;
                          }
                      });
                      
                      let crr = parseFloat(payload.current_rr);
                      if (isNaN(crr) || totalBalls === 0) crr = 8.5; // DEFAULT IPL RUN RATE AT BALL ZERO
                      
                      let recentRR = validBalls > 0 ? (recentRuns / validBalls) * 6 : crr;
                      let blendedRR = totalBalls > 0 ? ((recentRR * 0.6) + (crr * 0.4)) : 8.5;
                      
                      let isChase = (payload.required_rr && !payload.required_rr.includes("REQ") && payload.required_rr !== "
