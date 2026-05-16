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
  
  // ==============================================================
  // 0. STRICT TEMPORAL LOCKDOWN (Current Day Only)
  // ==============================================================
  let now = new Date();
  let options = { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric' };
  let todayIST = now.toLocaleString('en-US', options).toLowerCase();
  
  if (targetDate && targetDate !== todayIST) {
      let lockdownPayload = {
          title: "UPLINK DENIED", status: "Select today match only", match_state: "standby",
          live_score: "Out of Bounds", current_rr: "N/A", required_rr: "N/A",
          striker: "N/A", non_striker: "N/A", bowler: "N/A", toss: "N/A", 
          venue: "Temporal Lock Active", last_over: ["-", "-", "-", "-", "-", "-"],
          prediction: "Select today match only", source_url: "Rejected by Firewall"
      };
      return res.status(200).json({ success: false, error: "Temporal mismatch", match_info: lockdownPayload });
  }

  const headers = { 'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36' };

  let payload = {
        title: "YAHOO: Target Unknown", status: "Scanning Fields...", match_state: "standby",
        live_score: "YAHOO: No Score", current_rr: "YAHOO: No CRR", required_rr: "YAHOO: No REQ",
        striker: "YAHOO: No Striker", non_striker: "YAHOO: No Non-Striker", bowler: "YAHOO: No Bowler",
        toss: "YAHOO: No Toss Data", venue: "YAHOO: Venue Hidden", last_over: ["Y", "A", "H", "O", "O", "!"],
        prediction: "YAHOO: AI Offline", source_url: "Hunting..."
  };

  let pageTitle = "";
  let bodyText = "";
  let espnMatchData = null; 
  let $ = null; 

  // ==============================================================
  // 1. THE ALIAS ENGINE 
  // ==============================================================
  const teamAliases = {
      "chennai": ["csk", "chennai", "super kings"], "lucknow": ["lsg", "lucknow", "super giants"],
      "mumbai": ["mi", "mumbai", "indians"], "punjab": ["pbks", "punjab", "kings"],
      "delhi": ["dc", "delhi", "capitals"], "gujarat": ["gt", "gujarat", "titans"],
      "kolkata": ["kkr", "kolkata", "knight riders"], "rajasthan": ["rr", "rajasthan", "royals"],
      "royal": ["rcb", "bengaluru", "bangalore", "challengers"], "sunrisers": ["srh", "hyderabad", "sunrisers"]
  };

  let t1 = targetTeams.split(' vs ')[0]?.trim().split(' ')[0] || "unknown";
  let t2 = targetTeams.split(' vs ')[1]?.trim().split(' ')[0] || "unknown";
  const t1A = teamAliases[t1] || [t1];
  const t2A = teamAliases[t2] || [t2];

  function matchesTeams(txt) {
      if (!txt) return false;
      return t1A.some(a => txt.includes(a)) && t2A.some(a => txt.includes(a));
  }

  try {
      // ==============================================================
      // PHASE 1: MOBILE DATA ACQUISITION 
      // ==============================================================
      let htmlAcquired = false;

      if (!htmlAcquired) {
          try {
              let cbUrl = targetUrl;
              if (cbUrl) cbUrl = cbUrl.replace('www.cricbuzz.com', 'm.cricbuzz.com'); 

              if (!cbUrl && targetTeams) {
                  const searchDirs = ['https://m.cricbuzz.com/cricket-match/live-scores', 'https://m.cricbuzz.com/cricket-match/live-scores/upcoming'];
                  for (let dir of searchDirs) {
                      const res = await axios.get(dir, { headers, timeout: 3000 });
                      const $temp = cheerio.load(res.data);
                      $temp('a').each((i, el) => {
                          let txt = $temp(el).text().toLowerCase();
                          let href = $temp(el).attr('href') || "";
                          let parentTxt = $temp(el).parent().parent().text().toLowerCase();
                          if ((href.includes('indian-premier-league') || parentTxt.includes('ipl')) && href.match(/\/\d{4,}\//) && matchesTeams(txt + " " + href) && href.includes('scores')) {
                              cbUrl = 'https://m.cricbuzz.com' + href;
                          }
                      });
                      if (cbUrl) break;
                  }
              }
              if (cbUrl) {
                  cbUrl = cbUrl.replace('www.', 'm.').replace('/live-cricket-scorecard/', '/cricket-scores/');
                  const cbRes = await axios.get(cbUrl, { headers, timeout: 4000 });
                  $ = cheerio.load(cbRes.data);
                  $('script, style, noscript').remove();
                  pageTitle = $('title').text() || "";
                  bodyText = $('body').text().replace(/\s+/g, ' ');
                  payload.source_url = cbUrl;
                  htmlAcquired = true;
              }
          } catch (e) {}
      }

      if (!htmlAcquired) {
          try {
              const espnRes = await axios.get('https://hs-consumer-api.espncricinfo.com/v1/pages/matches/current', { headers, timeout: 3000 });
              espnMatchData = espnRes.data.matches.find(m => {
                  let isIPL = (m.series?.name?.toLowerCase().includes('ipl') || m.title.toLowerCase().includes('ipl'));
                  return isIPL && matchesTeams(m.title.toLowerCase() + " " + m.teams.map(t => t.team.abbreviation).join(" ").toLowerCase());
              });
              if (espnMatchData) {
                  pageTitle = espnMatchData.title;
                  bodyText = espnMatchData.statusText + " " + (espnMatchData.tossResults?.text || "");
                  payload.source_url = "ESPN-API-Uplink";
                  htmlAcquired = true;
              }
          } catch (e) {}
      }

      if (!htmlAcquired) {
          payload.status = "YAHOO: Today's IPL Match Not Found";
          payload.title = "UPLINK FAILED";
          return res.status(200).json({ success: true, match_info: payload }); 
      }

      // ==============================================================
      // PHASE 2: BATTLEFIELD ASSESSMENT (State Detection)
      // ==============================================================
      try {
          // --- [TARGET #1] TITLE EXTRACTION (SECURED) ---
          let vsMatch = pageTitle.match(/([a-zA-Z0-9\s]+?\s+vs\s+[a-zA-Z0-9\s]+)/i);
          if (vsMatch) {
              payload.title = vsMatch[1].replace(/live score/i, '').replace(/live/i, '').trim();
          } else if (targetTeams) {
              payload.title = targetTeams.replace(/\b\w/g, l => l.toUpperCase()); 
          } else {
              payload.title = pageTitle.split(/[,|]/)[0].trim() || "Live Cricket Match";
          }

          // --- [TARGET #11] VENUE EXTRACTION (SECURED) ---
          let venueMatch = bodyText.match(/Venue\s*:\s*([^•|{]+)/i) || (espnMatchData && espnMatchData.ground ? [null, espnMatchData.ground.name] : null);
          if (venueMatch) payload.venue = venueMatch[1].trim();

          // Base Status Pull
          let statusText = $ ? $('.cb-status-msg, .cb-text-complete, .ui-match-status').first().text().trim() : "";
          let titleWin = pageTitle.match(/([a-zA-Z\s\-]+won by\s\d+\s(?:runs|wickets|run|wicket))/i);
          if (!statusText && titleWin) statusText = titleWin[1].trim();
          else if (espnMatchData) statusText = espnMatchData.statusText;
          if (statusText) payload.status = statusText;
          
          // --- [TARGET #3] MATCH STATE EXTRACTION (SECURED) ---
          let statusLower = (statusText || "").toLowerCase();
          if (statusLower.includes('won by') || statusLower.includes('tied') || statusLower.includes('abandoned')) {
              payload.match_state = "completed";
          } else if (bodyText.includes('CRR:') || bodyText.includes('REQ:') || ($ && $('.ui-bat-team-scores').length > 0) || (espnMatchData && espnMatchData.status === "Live")) {
              payload.match_state = "live";
          } else {
              payload.match_state = "future";
          }
      } catch (e) { payload.match_state = "standby"; }

      // ==============================================================
      // PHASE 3: ISOLATED EXTRACTION BOXES
      // ==============================================================

      // --- [TARGET #10] TOSS EXTRACTION (SECURED) ---
      try {
          let tossMatch = bodyText.match(/([A-Z][a-zA-Z\s]+won the toss and (?:opted|elected|chose|decided) to (?:bat|bowl|field))/i);
          if (!tossMatch) tossMatch = bodyText.match(/Toss\s*:\s*([^•|{\(]+)/i);
          if (tossMatch) payload.toss = tossMatch[1].trim();
          else if (espnMatchData && espnMatchData.tossResults) payload.toss = espnMatchData.tossResults.text;
          if (payload.toss.length > 50) payload.toss = "Tracking Toss Data...";
      } catch (e) { payload.toss = "Toss Error"; }

      // --- LIVE STATE EXTRACTION ---
      if (payload.match_state === "live") {
          
          // --- [TARGET #2] STATUS REFINEMENT (NEW OVERRIDE) ---
          try {
              if (payload.status === "Scanning Fields..." || payload.status === "") {
                  if (bodyText.match(/innings break/i)) payload.status = "Innings Break";
                  else if (bodyText.match(/strategic timeout/i)) payload.status = "Strategic Timeout";
                  else if (bodyText.match(/rain stop/i) || bodyText.match(/delay/i)) payload.status = "Weather/Delay Protocol";
                  else payload.status = "Live Match Active";
              }
          } catch(e) { payload.status = "Status Error"; }

          // --- [TARGET #4] LIVE SCORE (SECURED) ---
          try {
              let scoreMatch = pageTitle.match(/([A-Z]{2,4}\s\d+\/\d+\s\([^)]+\))/);
              if (scoreMatch) payload.live_score = scoreMatch[1];
              else if (espnMatchData) payload.live_score = `${espnMatchData.teams[0].score || ''} vs ${espnMatchData.teams[1].score || ''}`;
          } catch(e) { payload.live_score = "Score Error"; }

          // --- [TARGET #5 & #6] RUN RATES (SECURED) ---
          try {
              let crrMatch = bodyText.match(/CRR:\s*([\d\.]+)/i);
              if (crrMatch) payload.current_rr = crrMatch[1];
              let reqMatch = bodyText.match(/REQ:\s*([\d\.]+)/i);
              if (reqMatch) payload.required_rr = reqMatch[1];
          } catch(e) { payload.current_rr = "Error"; payload.required_rr = "Error"; }

          // --- [TARGET #7 & #8] STRIKER & NON-STRIKER (PENDING FIX) ---
          try {
              payload.striker = "Target Engaged";
              payload.non_striker = "Off-Strike";
              if ($) {
                  let batters = [];
                  $('.cb-min-bat-rw').each((i, el) => {
                      let rowText = $(el).text().replace(/\s+/g, ' ').trim();
                      let cleanText = rowText;
                      if (rowText.includes('SR ')) cleanText = rowText.split('SR ')[1];
                      else if (rowText.includes('SR')) cleanText = rowText.split('SR')[1];
                      
                      let namePart = cleanText.split(/\d/)[0].trim(); 
                      if (namePart.length > 2 && !namePart.toLowerCase().includes('batter')) {
                          if (rowText.substring(0, namePart.length + 3).includes('*')) namePart += ' *';
                          batters.push(namePart);
                      }
                  });
                  if (batters.length > 0) {
                      let starIdx = batters.findIndex(b => b.includes('*'));
                      if (starIdx === 1) {
                          payload.striker = batters[1]; payload.non_striker = batters[0];
                      } else {
                          payload.striker = batters[0]; payload.non_striker = batters[1] || "Off-Strike";
                      }
                  }
              }
          } catch(e) { payload.striker = "Extractor Error"; payload.non_striker = "Extractor Error"; }

          // --- [TARGET #9] BOWLER (PENDING FIX) ---
          try {
              payload.bowler = "Active Bowler";
              if ($) {
                  let bowlers = [];
                  $('.cb-min-bowl-rw').each((i, el) => {
                      let rowText = $(el).text().replace(/\s+/g, ' ').trim();
                      let cleanText = rowText;
                      if (rowText.includes('ECO ')) cleanText = rowText.split('ECO ')[1];
                      else if (rowText.includes('ECO')) cleanText = rowText.split('ECO')[1];
                      
                      let namePart = cleanText.split(/\d/)[0].trim(); 
                      if (namePart.length > 2 && !namePart.toLowerCase().includes('bowler')) bowlers.push(namePart);
                  });
                  if (bowlers[0]) payload.bowler = bowlers[0];
              }
          } catch(e) { payload.bowler = "Extractor Error"; }

          // --- [TARGET #12] LAST OVER BALLS (SECURED) ---
          try {
              let recentTextMatch = bodyText.match(/Recent\s*:\s*([W0-9NbLwd|\s]+)/i);
              if (recentTextMatch) payload.last_over = recentTextMatch[1].split(/[|\s]+/).filter(b => b.trim()).slice(-6);
              else payload.last_over = ["-", "-", "-", "-", "-", "-"];
          } catch(e) { payload.last_over = ["E", "R", "R", "O", "R", "!"]; }

          // --- [TARGET #13] PREDICTION (SECURED) ---
          try {
              if (payload.required_rr !== "YAHOO: No REQ" && payload.required_rr !== "Error") payload.prediction = "TRACKING CHASE PROBABILITY...";
              else if (payload.current_rr !== "YAHOO: No CRR" && payload.current_rr !== "Error") payload.prediction = `PROJECTED TARGET: ${Math.floor(parseFloat(payload.current_rr) * 20)} RUNS`;
          } catch(e) { payload.prediction = "Prediction Error"; }
      }

      // --- COMPLETED MATCH FALLBACKS ---
      else if (payload.match_state === "completed") {
          let rawTitleArray = pageTitle.split('|');
          if (rawTitleArray.length > 1) payload.live_score = rawTitleArray[1].replace(/-\s*Live.*?Score/i, '').trim();
          else payload.live_score = "Match Ended";

          payload.striker = "Match Ended"; payload.non_striker = "Match Ended";
          payload.bowler = "Match Ended"; payload.current_rr = "Match Ended";
          payload.required_rr = "Match Ended"; payload.last_over = ["E", "N", "D", "E", "D", "!"];
          
          let potmMatch = bodyText.match(/player of the match\s*([a-zA-Z\s]+?)(?:match\svideos|view\sall|share|$)/i);
          payload.prediction = potmMatch ? `POTM: ${potmMatch[1].trim()}` : "Match Ended";
          if (payload.toss === "Tracking Toss Data...") payload.toss = "Toss Record Unavailable";
      }

      // --- FUTURE MATCH FALLBACKS ---
      else if (payload.match_state === "future") {
          payload.live_score = "Match Not Started";
          payload.striker = "Waiting for Openers"; payload.non_striker = "Waiting for Openers";
          payload.bowler = "Waiting for Bowler"; payload.last_over = ["-", "-", "-", "-", "-", "-"];
          payload.prediction = "AWAITING START";
          let matchDate = bodyText.match(/Date\s*:\s*([^•|{]+)/i);
          if (matchDate) payload.status = `Starts: ${matchDate[1].trim()}`;
          else if (espnMatchData) payload.status = "Pre-Match Standby";
          if (payload.toss === "Tracking Toss Data..." || payload.toss.includes("YAHOO")) payload.toss = "Awaiting Coin Drop";
          if (payload.toss !== "Awaiting Coin Drop") payload.status = payload.toss;
      }

      // --- [TARGET #14] SOURCE URL (SECURED) ---
      // Handled natively during Phase 1 Acquisition

      return res.status(200).json({ success: true, match_info: payload });

  } catch (err) {
      payload.status = "OH SORRY: Connection Blocked by All Sites";
      payload.live_score = "OH SORRY: Cannot Fetch";
      payload.striker = "OH SORRY"; payload.non_striker = "OH SORRY";
      payload.bowler = "OH SORRY"; payload.toss = "OH SORRY";
      payload.venue = "OH SORRY"; payload.prediction = "OH SORRY: AI Offline";
      payload.last_over = ["O", "H", "S", "R", "R", "Y"];
      return res.status(200).json({ success: false, error: err.message, match_info: payload });
  }
};
