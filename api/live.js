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
  
  let now = new Date();
  let options = { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric' };
  let todayIST = now.toLocaleString('en-US', options).toLowerCase();
  
  if (targetDate && targetDate !== todayIST) {
      let lockdownPayload = {
          title: "UPLINK DENIED", status: "Select today match only", match_state: "standby",
          live_score: "Out of Bounds", current_rr: "N/A", required_rr: "N/A",
          striker: "N/A", non_striker: "N/A", bowler: "N/A", toss: "N/A", 
          venue: "Temporal Lock Active", last_over: ["-", "-", "-", "-", "-", "-"],
          prediction: "Select today match only", match_prediction: "", source_url: "Rejected by Firewall"
      };
      return res.status(200).json({ success: false, error: "Temporal mismatch", match_info: lockdownPayload });
  }

  const headers = { 'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36' };

  let payload = {
        title: "YAHOO: Target Unknown", status: "Scanning Fields...", match_state: "standby",
        live_score: "YAHOO: No Score", current_rr: "YAHOO: No CRR", required_rr: "YAHOO: No REQ",
        striker: "YAHOO: No Striker", non_striker: "YAHOO: No Non-Striker", bowler: "YAHOO: No Bowler",
        toss: "YAHOO: No Toss Data", venue: "YAHOO: Venue Hidden", last_over: ["Y", "A", "H", "O", "O", "!"],
        prediction: "YAHOO: AI Offline", match_prediction: "", source_url: "Hunting..."
  };

  let pageTitle = ""; let bodyText = ""; let espnMatchData = null; let $ = null; 

  const teamAliases = {
      "chennai": ["csk", "chennai", "super kings"], "lucknow": ["lsg", "lucknow", "super giants"],
      "mumbai": ["mi", "mumbai", "indians"], "punjab": ["pbks", "punjab", "kings"],
      "delhi": ["dc", "delhi", "capitals"], "gujarat": ["gt", "gujarat", "titans"],
      "kolkata": ["kkr", "kolkata", "knight riders"], "rajasthan": ["rr", "rajasthan", "royals"],
      "royal": ["rcb", "bengaluru", "bangalore", "challengers"], "sunrisers": ["srh", "hyderabad", "sunrisers"]
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
              let cbUrl = targetUrl;
              if (cbUrl) cbUrl = cbUrl.replace('www.cricbuzz.com', 'm.cricbuzz.com'); 
              if (!cbUrl && targetTeams) {
                  const searchDirs = [ `https://m.cricbuzz.com/cricket-match/live-scores?_t=${timestampBuster}`, `https://m.cricbuzz.com/cricket-match/live-scores/upcoming?_t=${timestampBuster}` ];
                  for (let dir of searchDirs) {
                      const res = await axios.get(dir, { headers, timeout: 3000 });
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
                  const cbRes = await axios.get(fetchUrl, { headers, timeout: 4000 });
                  $ = cheerio.load(cbRes.data); $('script, style, noscript').remove();
                  pageTitle = $('title').text() || ""; bodyText = $('body').text().replace(/\s+/g, ' ');
                  payload.source_url = cbUrl; htmlAcquired = true;
              }
          } catch (e) {}
      }

      if (!htmlAcquired) {
          try {
              let crexUrl = targetUrl.includes('crex') ? targetUrl : "";
              if (!crexUrl && targetTeams) {
                  const cxRes = await axios.get(`https://crex.live/fixtures/match-list?_t=${timestampBuster}`, { headers, timeout: 3000 });
                  const $temp = cheerio.load(cxRes.data);
                  $temp('a').each((i, el) => {
                      let txt = $temp(el).text().toLowerCase(); let href = $temp(el).attr('href') || ""; let strictTeamCheck = txt + " " + href;
                      if ((txt.includes('ipl') || txt.includes('indian premier league')) && href.includes('scoreboard') && matchesTeams(strictTeamCheck)) crexUrl = 'https://crex.live' + href;
                  });
              }
              if (crexUrl) {
                  let fetchUrl = crexUrl.includes('?') ? `${crexUrl}&_t=${timestampBuster}` : `${crexUrl}?_t=${timestampBuster}`;
                  const cRes = await axios.get(fetchUrl, { headers, timeout: 3500 });
                  $ = cheerio.load(cRes.data); $('script, style, noscript').remove();
                  pageTitle = $('title').text() || ""; bodyText = $('body').text().replace(/\s+/g, ' ');
                  payload.source_url = crexUrl; htmlAcquired = true;
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
                  payload.source_url = "ESPN-API-Uplink"; htmlAcquired = true;
              }
          } catch (e) {}
      }

      if (!htmlAcquired) {
          payload.status = "YAHOO: Today's IPL Match Not Found"; payload.title = "UPLINK FAILED";
          return res.status(200).json({ success: true, match_info: payload }); 
      }

      try {
          let vsMatch = pageTitle.match(/([a-zA-Z0-9\s]+?\s+vs\s+[a-zA-Z0-9\s]+)/i);
          if (vsMatch) payload.title = vsMatch[1].replace(/live score/i, '').replace(/live/i, '').trim();
          else if (targetTeams) payload.title = targetTeams.replace(/\b\w/g, l => l.toUpperCase()); 
          else payload.title = pageTitle.split(/[,|]/)[0].trim() || "Live Cricket Match";

          let venueMatch = bodyText.match(/Venue\s*:\s*([^•|{]+)/i) || (espnMatchData && espnMatchData.ground ? [null, espnMatchData.ground.name] : null);
          if (venueMatch) payload.venue = venueMatch[1].trim();

          let statusText = $ ? $('.cb-status-msg, .cb-text-complete, .ui-match-status').first().text().trim() : "";
          let titleWin = pageTitle.match(/([a-zA-Z\s\-]+won by\s\d+\s(?:runs|wickets|run|wicket))/i);
          if (!statusText && titleWin) statusText = titleWin[1].trim();
          else if (espnMatchData) statusText = espnMatchData.statusText;
          if (statusText) payload.status = statusText;
          
          let statusLower = (statusText || "").toLowerCase();
          if (statusLower.includes('won by') || statusLower.includes('tied') || statusLower.includes('abandoned')) payload.match_state = "completed";
          else if (bodyText.includes('CRR:') || bodyText.includes('REQ:') || ($ && $('.ui-bat-team-scores').length > 0) || (espnMatchData && espnMatchData.status === "Live")) payload.match_state = "live";
          else payload.match_state = "future";
      } catch (e) { payload.match_state = "standby"; }

      try {
          let tossMatch = bodyText.match(/([A-Z][a-zA-Z\s]+won the toss and (?:opted|elected|chose|decided) to (?:bat|bowl|field))/i);
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
                  else payload.status = "Live Match Active";
              }
          } catch(e) { payload.status = "Status Error"; }

          try {
              let scoreMatch = pageTitle.match(/([A-Z]{2,4}\s\d+\/\d+\s\([^)]+\))/);
              if (scoreMatch) payload.live_score = scoreMatch[1];
              else if (espnMatchData) payload.live_score = `${espnMatchData.teams[0].score || ''} vs ${espnMatchData.teams[1].score || ''}`;
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

          // --- STRIKER / BOWLER EXTRACTION ---
          try {
              let foundStriker = "";
              let starMatch = bodyText.match(/([a-zA-Z\s\-\'\.]+?)\s*\*\s*\d+\s+\d+/);
              if (starMatch && starMatch[1]) {
                  let cleanName = starMatch[1].replace(/(Batter|SR|ECO|Runs|4s|6s)/gi, '').trim().replace(/^[a-z]+\s*/, '').trim(); 
                  if (cleanName.length > 2 && !cleanName.toLowerCase().includes('match')) foundStriker = cleanName;
              }
              if (!foundStriker && $) {
                  $('a[href*="/profiles/"]').each((i, el) => {
                      let name = $(el).text().trim(); let rowTxt = $(el).parent().parent().text();
                      if (rowTxt.includes('*') && rowTxt.includes(name) && !foundStriker && name.length > 2) foundStriker = name;
                  });
              }
              if (foundStriker) foundStriker = foundStriker.replace(/\*/g, '').trim() + " *";
              payload.striker = foundStriker || "Target Engaged";
          } catch(e) { payload.striker = "Extractor Error"; }

          try {
              let foundNonStriker = ""; let strikerNameRaw = payload.striker.replace(/\*/g, '').trim(); 
              if ($) {
                  let allNames = [];
                  $('a[href*="/profiles/"]').each((i, el) => {
                      let name = $(el).text().replace(/\*/g, '').trim();
                      if (name.length > 2 && !allNames.includes(name)) allNames.push(name);
                  });
                  if (allNames.length >= 2) {
                      if (strikerNameRaw.includes(allNames[0]) || allNames[0].includes(strikerNameRaw)) foundNonStriker = allNames[1];
                      else foundNonStriker = allNames[0]; 
                  }
              }
              if (!foundNonStriker) {
                  let matchBlock = bodyText.match(/SR\s+(.+?)\s+Bowler/i);
                  if (matchBlock) {
                      let nameMatches = [...matchBlock[1].matchAll(/([a-zA-Z\s\-\'\.]+?)\s*(?:\*|\d{1,3}\s+\d{1,3})/g)];
                      for (let m of nameMatches) {
                          let possibleName = m[1].replace(/\*/g, '').trim();
                          if (possibleName.length > 2 && !strikerNameRaw.includes(possibleName) && !possibleName.includes(strikerNameRaw)) { foundNonStriker = possibleName; break; }
                      }
                  }
              }
              payload.non_striker = foundNonStriker || "Off-Strike";
          } catch(e) { payload.non_striker = "Extractor Error"; }

          try {
              let foundBowler = ""; let strikerRaw = payload.striker.replace(/\*/g, '').trim(); let nonStrikerRaw = payload.non_striker.trim();
              if ($) {
                  let allProfileNames = [];
                  $('a[href*="/profiles/"]').each((i, el) => {
                      let name = $(el).text().replace(/\*/g, '').trim();
                      if (name.length > 2 && !allProfileNames.includes(name)) allProfileNames.push(name);
                  });
                  let nonBatters = allProfileNames.filter(name => !strikerRaw.includes(name) && !name.includes(strikerRaw) && !nonStrikerRaw.includes(name) && !name.includes(nonStrikerRaw) );
                  if (nonBatters.length > 0) foundBowler = nonBatters[0];
              }
              if (!foundBowler) {
                  let ecoMatch = bodyText.match(/ECO\s+([a-zA-Z\s\-\'\.]+?)\s*\d/i);
                  if (ecoMatch && ecoMatch[1]) {
                      let cleanName = ecoMatch[1].replace(/(Bowler|Batter|SR|ECO|\*)/gi, '').trim();
                      if (cleanName.length > 2) foundBowler = cleanName;
                  }
              }
              if (foundBowler) foundBowler = foundBowler.replace(/\*/g, '').trim();
              payload.bowler = foundBowler || "Active Bowler";
          } catch(e) { payload.bowler = "Extractor Error"; }

          try {
              let recentTextMatch = bodyText.match(/Recent\s*:\s*([W0-9NbLwd|\s]+)/i);
              if (recentTextMatch) payload.last_over = recentTextMatch[1].split(/[|\s]+/).filter(b => b.trim()).slice(-6);
              else payload.last_over = ["-", "-", "-", "-", "-", "-"];
          } catch(e) { payload.last_over = ["E", "R", "R", "O", "R", "!"]; }

          // ==========================================================
          // [TARGET #13] THE QUANTUM BOOKMAKER ENGINE (DUAL-CORE)
          // ==========================================================
          try {
              if (payload.live_score.includes('/')) {
                  let scoreMatch = payload.live_score.match(/(\d+)\/(\d+)\s*\(([\d\.]+)\)/);
                  let batTeam = payload.live_score.split(' ')[0] || "Batting Team";

                  if (scoreMatch) {
                      let runs = parseInt(scoreMatch[1]); let wkts = parseInt(scoreMatch[2]);
                      let oversSplit = scoreMatch[3].split('.');
                      let overs = parseInt(oversSplit[0]); let balls = oversSplit[1] ? parseInt(oversSplit[1]) : 0;
                      let totalBalls = (overs * 6) + balls;

                      // --- ADVANCED MICRO-RADAR ANALYSIS ---
                      let recentRuns = 0; let validBalls = 0; 
                      let dotBalls = 0; let boundaries = 0; let recentWicketFell = false;
                      
                      payload.last_over.forEach(b => {
                          if (b === 'W') recentWicketFell = true;
                          else if (b === 'Wd' || b === 'Nb') { recentRuns += 1; }
                          else if (!isNaN(parseInt(b))) { 
                              let val = parseInt(b);
                              recentRuns += val; validBalls++; 
                              if (val === 0) dotBalls++;
                              if (val === 4 || val === 6) boundaries++;
                          }
                      });
                      
                      // Calculate Pitch/Bowling Pressure
                      let wicketProb = "LOW";
                      if (recentWicketFell || (dotBalls >= 3 && validBalls > 3)) wicketProb = "HIGH (Bowling Pressure)";
                      
                      let crr = parseFloat(payload.current_rr) || (runs / totalBalls) * 6;
                      let recentRR = validBalls > 0 ? (recentRuns / validBalls) * 6 : crr;
                      let blendedRR = (recentRR * 0.6) + (crr * 0.4);
                      if (recentWicketFell) blendedRR *= 0.85; 
                      if (wkts >= 6) blendedRR *= 0.70; 

                      let isChase = (payload.required_rr !== "YAHOO: No REQ" && payload.required_rr !== "1st Innings" && payload.required_rr !== "Error");
                      let rrrVal = isChase ? parseFloat(payload.required_rr) : 0;

                      // --- CORE 1: PHASE PREDICTION ---
                      if (isChase) {
                          payload.prediction = `CHASE ORACLE | PHASE MARKETS CLOSED (1st Innings Only)`;
                      } else {
                          let phaseTactic = "";
                          let projections = [];
                          let milestones = [6, 10, 15, 20];
                          for (let m of milestones) {
                              if (overs < m) {
                                  let oversLeft = m - (overs + (balls/6));
                                  let projected = Math.floor(runs + (oversLeft * blendedRR));
                                  if (wkts >= 8) projected = Math.min(projected, runs + 10);
                                  projections.push(`[${m}v: ${projected}]`);
                              }
                          }
                          if (wkts >= 7 || (wkts >= 4 && blendedRR < 7)) phaseTactic = "🔴 EAT (LAY) - COLLAPSING PATTERN";
                          else if (recentWicketFell && blendedRR < 8) phaseTactic = "🟡 HOLD - PATTERN UNSTABLE";
                          else if (blendedRR >= 10 && wkts <= 3) phaseTactic = "🟢 PLAY (BACK) - HIGH AGGRESSION";
                          else phaseTactic = "🟡 HOLD - STANDARD ACCUMULATION";

                          if (projections.length > 0) payload.prediction = `TARGETS: ${projections.join(' ')} \nTACTIC: ${phaseTactic}`;
                          else payload.prediction = `INNINGS ENDING \nTACTIC: ${phaseTactic}`;
                      }

                      // --- CORE 2: MATCH TRADING (DYNAMIC ENTRY/EXIT MATRIX) ---
                      let matchTactic = "";
                      if (isChase) {
                          if (rrrVal > 15 || wkts >= 8) {
                              matchTactic = `[ENTRY] 🟢 PLAY Bowling Team at prevailing odds.|[EXIT] Market closing. Ensure profit is locked on Bowling team.|[INTEL] Wicket Prob: ${wicketProb} | Chase mathematically terminal.`;
                          } else if (rrrVal > 11 && wkts >= 5) {
                              matchTactic = `[ENTRY] 🔴 EAT (LAY) ${batTeam} at low odds.|[EXIT] HEDGE (Shift Winner) when next wicket falls to lock profit.|[INTEL] Pressure: CRITICAL | Tail exposed to run rate.`;
                          } else if (rrrVal <= crr + 1 && wkts < 4) {
                              matchTactic = `[ENTRY] 🟢 PLAY (BACK) ${batTeam} on market dips.|[EXIT] HEDGE (Green Out) when odds drop further to lock profit.|[INTEL] Wicket Prob: LOW | Batters finding gaps easily.`;
                          } else {
                              matchTactic = `[ENTRY] 🟡 WAIT FOR SWING | Market odds are currently balanced.|[EXIT] Hold capital. Look for entry after a boundary or wicket.|[INTEL] Pressure: NEUTRAL | Awaiting momentum shift.`;
                          }
                      } else {
                          // 1st Innings Bookmaking
                          if (wkts < 3 && blendedRR > 9) {
                              matchTactic = `[ENTRY] 🟢 PLAY (BACK) ${batTeam} on market dips.|[EXIT] HEDGE (Shift Winner) at Innings Break to guarantee profit.|[INTEL] Wicket Prob: LOW | Bowlers failing to restrict.`;
                          } else if (wkts >= 5 || (dotBalls >= 3 && wkts >= 3)) {
                              matchTactic = `[ENTRY] 🔴 EAT (LAY) ${batTeam} at low odds.|[EXIT] HEDGE (Green Out) immediately upon next wicket.|[INTEL] Wicket Prob: ${wicketProb} | Batters pinned down.`;
                          } else {
                              matchTactic = `[ENTRY] 🟡 HOLD POSITION | Consolidation phase active.|[EXIT] Do not commit funds until odds swing significantly.|[INTEL] Pressure: BUILDING | Teams establishing base.`;
                          }
                      }
                      payload.match_prediction = matchTactic;

                  } else {
                      payload.prediction = "ORACLE: AWAITING SUFFICIENT DATA";
                      payload.match_prediction = "[ENTRY] AWAITING TELEMETRY|[EXIT] N/A|[INTEL] Processing Matrix...";
                  }
              } else {
                  payload.prediction = "ORACLE: OFFLINE";
                  payload.match_prediction = "[ENTRY] SYSTEM OFFLINE|[EXIT] N/A|[INTEL] Re-establish Uplink.";
              }
          } catch(e) { payload.prediction = "Quantum Core Error"; payload.match_prediction = "Core Error"; }
      }

      else if (payload.match_state === "completed") {
          let rawTitleArray = pageTitle.split('|');
          if (rawTitleArray.length > 1) payload.live_score = rawTitleArray[1].replace(/-\s*Live.*?Score/i, '').trim();
          else payload.live_score = "Match Ended";

          payload.striker = "Match Ended"; payload.non_striker = "Match Ended"; payload.bowler = "Match Ended"; 
          payload.current_rr = "Match Ended"; payload.required_rr = "Match Ended"; payload.last_over = ["E", "N", "D", "E", "D", "!"];
          
          let potmMatch = bodyText.match(/player of the match\s*([a-zA-Z\s]+?)(?:match\svideos|view\sall|share|$)/i);
          payload.prediction = potmMatch ? `POTM: ${potmMatch[1].trim()}` : "Match Ended";
          payload.match_prediction = "[ENTRY] OPERATION ARCHIVED|[EXIT] Match Concluded|[INTEL] Final Settlement Processing.";
          if (payload.toss === "Tracking Toss Data...") payload.toss = "Toss Record Unavailable";
      }

      else if (payload.match_state === "future") {
          payload.live_score = "Match Not Started"; payload.striker = "Waiting for Openers"; 
          payload.non_striker = "Waiting for Openers"; payload.bowler = "Waiting for Bowler"; 
          payload.last_over = ["-", "-", "-", "-", "-", "-"]; payload.prediction = "AWAITING START";
          payload.match_prediction = "[ENTRY] PRE-MATCH STANDBY|[EXIT] N/A|[INTEL] Awaiting first ball.";
          let matchDate = bodyText.match(/Date\s*:\s*([^•|{]+)/i);
          if (matchDate) payload.status = `Starts: ${matchDate[1].trim()}`;
          else if (espnMatchData) payload.status = "Pre-Match Standby";
          if (payload.toss === "Tracking Toss Data..." || payload.toss.includes("YAHOO")) payload.toss = "Awaiting Coin Drop";
          if (payload.toss !== "Awaiting Coin Drop") payload.status = payload.toss;
      }

      return res.status(200).json({ success: true, match_info: payload });

  } catch (err) {
      payload.status = "OH SORRY: Connection Blocked by All Sites";
      payload.live_score = "OH SORRY: Cannot Fetch"; payload.striker = "OH SORRY"; 
      payload.non_striker = "OH SORRY"; payload.bowler = "OH SORRY"; payload.toss = "OH SORRY";
      payload.venue = "OH SORRY"; payload.prediction = "OH SORRY: AI Offline"; payload.match_prediction = "Offline"; payload.last_over = ["O", "H", "S", "R", "R", "Y"];
      return res.status(200).json({ success: false, error: err.message, match_info: payload });
  }
};
