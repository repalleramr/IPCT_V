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
  let targetMonth = targetDate.split(' ')[0] || "";
  let targetDay = targetDate.split(' ')[1] || ""; 

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
  // 0. THE ALIAS ENGINE 
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
      let match1 = t1A.some(a => txt.includes(a));
      let match2 = t2A.some(a => txt.includes(a));
      return match1 && match2;
  }

  try {
      // ==============================================================
      // PHASE 1: TEMPORAL DATA ACQUISITION 
      // ==============================================================
      let htmlAcquired = false;

      // --- TIER 1: CRICBUZZ ---
      if (!htmlAcquired) {
          try {
              let cbUrl = targetUrl;
              if (!cbUrl && targetTeams) {
                  const searchDirs = [
                      { url: 'https://m.cricbuzz.com/cricket-match/live-scores', checkDate: false },
                      { url: 'https://m.cricbuzz.com/cricket-match/live-scores/recent', checkDate: true },
                      { url: 'https://m.cricbuzz.com/cricket-match/live-scores/upcoming', checkDate: false }
                  ];
                  
                  for (let dir of searchDirs) {
                      const res = await axios.get(dir.url, { headers, timeout: 3000 });
                      const $temp = cheerio.load(res.data);
                      $temp('a').each((i, el) => {
                          let txt = $temp(el).text().toLowerCase();
                          let href = $temp(el).attr('href') || "";
                          let parentTxt = $temp(el).parent().parent().text().toLowerCase();
                          
                          let isIPL = href.includes('indian-premier-league') || parentTxt.includes('ipl');
                          let hasMatchId = href.match(/\/\d{4,}\//); 
                          
                          let isDateMatch = true;
                          if (dir.checkDate && targetDate) {
                              isDateMatch = txt.includes(targetMonth) || parentTxt.includes(targetMonth) || txt.includes('yesterday') || parentTxt.includes('yesterday');
                          }
                          
                          // STRICT SCOPE FIX: Only check the link text and the URL slug for teams, NEVER the parent container!
                          let strictTeamCheck = txt + " " + href; 

                          if (isIPL && hasMatchId && matchesTeams(strictTeamCheck) && href.includes('scores')) {
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
          } catch (e) { /* Pivot to CREX */ }
      }

      // --- TIER 2: CREX ---
      if (!htmlAcquired) {
          try {
              let crexUrl = targetUrl.includes('crex') ? targetUrl : "";
              if (!crexUrl && targetTeams) {
                  const cxRes = await axios.get('https://crex.live/fixtures/match-list', { headers, timeout: 3000 });
                  const $temp = cheerio.load(cxRes.data);
                  $temp('a').each((i, el) => {
                      let txt = $temp(el).text().toLowerCase();
                      let href = $temp(el).attr('href') || "";
                      
                      let strictTeamCheck = txt + " " + href;
                      if ((txt.includes('ipl') || txt.includes('indian premier league')) && href.includes('scoreboard') && matchesTeams(strictTeamCheck)) {
                          crexUrl = 'https://crex.live' + href;
                      }
                  });
              }
              if (crexUrl) {
                  const cRes = await axios.get(crexUrl, { headers, timeout: 3500 });
                  $ = cheerio.load(cRes.data);
                  $('script, style, noscript').remove();
                  pageTitle = $('title').text() || "";
                  bodyText = $('body').text().replace(/\s+/g, ' ');
                  payload.source_url = crexUrl;
                  htmlAcquired = true;
              }
          } catch (e) { /* Pivot to ESPN */ }
      }

      // --- TIER 3: ESPN JSON API ---
      if (!htmlAcquired) {
          try {
              const espnEndpoints = [
                  'https://hs-consumer-api.espncricinfo.com/v1/pages/matches/current',
                  'https://hs-consumer-api.espncricinfo.com/v1/pages/matches/recent',
                  'https://hs-consumer-api.espncricinfo.com/v1/pages/matches/schedule'
              ];
              for (let url of espnEndpoints) {
                  const espnRes = await axios.get(url, { headers, timeout: 3000 });
                  espnMatchData = espnRes.data.matches.find(m => {
                      let isIPL = (m.series?.name?.toLowerCase().includes('ipl') || m.title.toLowerCase().includes('ipl'));
                      let hasTeam = matchesTeams(m.title.toLowerCase() + " " + m.teams.map(t => t.team.abbreviation).join(" ").toLowerCase());
                      
                      let isDateMatch = true;
                      if (targetDate && m.startTime) {
                           let mDate = new Date(m.startTime);
                           let options = { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric' };
                           let mDateStr = mDate.toLocaleString('en-US', options).toLowerCase();
                           isDateMatch = (mDateStr === targetDate || (targetDay && mDateStr.includes(targetDay)));
                      }

                      return isIPL && hasTeam && isDateMatch;
                  });
                  if (espnMatchData) break;
              }
              
              if (espnMatchData) {
                  pageTitle = espnMatchData.title;
                  bodyText = espnMatchData.statusText + " " + (espnMatchData.tossResults?.text || "");
                  payload.source_url = "ESPN-API-Uplink";
                  htmlAcquired = true;
              }
          } catch (e) { /* Total Failure */ }
      }

      if (!htmlAcquired) {
          payload.status = "YAHOO: IPL 2026 Match Not Found for Target Date";
          payload.title = "UPLINK FAILED";
          return res.status(200).json({ success: true, match_info: payload }); 
      }

      // ==============================================================
      // PHASE 2: BATTLEFIELD ASSESSMENT (State Detection)
      // ==============================================================
      if (pageTitle) payload.title = pageTitle.split(/[,|]/)[0].trim();
      let venueMatch = bodyText.match(/Venue\s*:\s*([^•|{]+)/i) || (espnMatchData && espnMatchData.ground ? [null, espnMatchData.ground.name] : null);
      if (venueMatch) payload.venue = venueMatch[1].trim();

      let statusText = "";
      if ($) {
          statusText = $('.cb-status-msg, .cb-text-complete, .ui-match-status').first().text().trim();
      }

      let titleWin = pageTitle.match(/([a-zA-Z\s\-]+won by\s\d+\s(?:runs|wickets|run|wicket))/i);
      
      if (!statusText && titleWin) statusText = titleWin[1].trim();
      else if (espnMatchData) statusText = espnMatchData.statusText;
      
      if (statusText) payload.status = statusText;
      
      let state = "future";
      let statusLower = (statusText || "").toLowerCase();

      if (statusLower.includes('won by') || statusLower.includes('tied') || statusLower.includes('abandoned')) {
          state = "completed";
      } else if (bodyText.includes('CRR:') || bodyText.includes('REQ:') || ($ && $('.ui-bat-team-scores').length > 0) || (espnMatchData && espnMatchData.status === "Live")) {
          state = "live";
      }

      payload.match_state = state;

      // ==============================================================
      // PHASE 3: TIMELINE-SPECIFIC DATA EXTRACTION 
      // ==============================================================
      let tossMatch = bodyText.match(/([A-Z][a-z]+\s[A-Za-z]+\swon the toss and (?:opted|elected|chose) to (?:bat|bowl) first)/i);
      if (tossMatch) payload.toss = tossMatch[1].trim();
      else if (espnMatchData && espnMatchData.tossResults) payload.toss = espnMatchData.tossResults.text;

      // --- ROUTE A: COMPLETED MATCH ---
      if (state === "completed") {
          payload.status = statusText || "Match Concluded";
          
          let rawTitleArray = pageTitle.split('|');
          if (rawTitleArray.length > 1) {
              payload.live_score = rawTitleArray[1].replace(/-\s*Live.*?Score/i, '').trim();
          } else {
              payload.live_score = "Match Ended";
          }

          payload.striker = "Match Ended"; payload.non_striker = "Match Ended";
          payload.bowler = "Match Ended"; payload.current_rr = "Match Ended";
          payload.required_rr = "Match Ended"; payload.last_over = ["E", "N", "D", "E", "D", "!"];
          
          let potmMatch = bodyText.match(/player of the match\s*([a-zA-Z\s]+?)(?:match\svideos|view\sall|share|$)/i);
          payload.prediction = potmMatch ? `POTM: ${potmMatch[1].trim()}` : "Match Ended";
          
          if (payload.toss === "YAHOO: No Toss Data") payload.toss = "Toss Record Unavailable";
      } 
      
      // --- ROUTE B: LIVE MATCH ---
      else if (state === "live") {
          let scoreMatch = pageTitle.match(/([A-Z]{2,4}\s\d+\/\d+\s\([^)]+\))/);
          if (scoreMatch) payload.live_score = scoreMatch[1];
          else if (espnMatchData) payload.live_score = `${espnMatchData.teams[0].score || ''} vs ${espnMatchData.teams[1].score || ''}`;
          
          let crrMatch = bodyText.match(/CRR:\s*([\d\.]+)/i);
          if (crrMatch) payload.current_rr = crrMatch[1];
          let reqMatch = bodyText.match(/REQ:\s*([\d\.]+)/i);
          if (reqMatch) payload.required_rr = reqMatch[1];

          if (espnMatchData && payload.source_url === "ESPN-API-Uplink") {
              payload.striker = "Tracking via API..."; payload.bowler = "Tracking via API...";
          } else {
             payload.striker = "Live Target Engaged"; payload.bowler = "Live Target Engaged";
             
             if ($) {
                 let batsmen = [];
                 $('.cb-min-inf').each((i, el) => {
                     let text = $(el).text().trim();
                     if (text && !text.includes('CRR')) batsmen.push(text);
                 });
                 if (batsmen[0]) payload.striker = batsmen[0];
                 if (batsmen[1]) payload.non_striker = batsmen[1];

                 let cbBowler = $('.cb-min-bowl-rw').find('a').first().text().trim();
                 if (cbBowler) payload.bowler = cbBowler;
             }
          }

          let recentTextMatch = bodyText.match(/Recent\s*:\s*([W0-9NbLwd|\s]+)/i);
          if (recentTextMatch) payload.last_over = recentTextMatch[1].split(/[|\s]+/).filter(b => b.trim()).slice(-6);
          else payload.last_over = ["-", "-", "-", "-", "-", "-"];

          if (payload.required_rr !== "YAHOO: No REQ") payload.prediction = "TRACKING CHASE PROBABILITY...";
          else if (payload.current_rr !== "YAHOO: No CRR") payload.prediction = `PROJECTED TARGET: ${Math.floor(parseFloat(payload.current_rr) * 20)} RUNS`;
      } 
      
      // --- ROUTE C: FUTURE MATCH ---
      else if (state === "future") {
          payload.live_score = "Match Not Started";
          payload.striker = "Waiting for Openers"; payload.non_striker = "Waiting for Openers";
          payload.bowler = "Waiting for Bowler"; payload.last_over = ["-", "-", "-", "-", "-", "-"];
          payload.prediction = "AWAITING START";
          
          let matchDate = bodyText.match(/Date\s*:\s*([^•|{]+)/i);
          if (matchDate) payload.status = `Starts: ${matchDate[1].trim()}`;
          else if (espnMatchData) payload.status = "Pre-Match Standby";
          
          if (payload.toss === "YAHOO: No Toss Data") payload.toss = "Awaiting Coin Drop";
          if (payload.toss !== "Awaiting Coin Drop") payload.status = payload.toss;
      }

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
