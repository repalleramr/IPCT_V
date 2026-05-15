const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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
  let activeSource = "";
  let espnMatchData = null; 

  // ==============================================================
  // 0. THE ALIAS ENGINE (Fixes PBKS vs Punjab routing)
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
      // PHASE 1: TEMPORAL DATA ACQUISITION (Cricbuzz -> CREX -> ESPN)
      // ==============================================================
      let htmlAcquired = false;

      // --- TIER 1: CRICBUZZ ---
      if (!htmlAcquired) {
          try {
              let cbUrl = targetUrl;
              if (!cbUrl && targetTeams) {
                  const searchUrls = [
                      'https://m.cricbuzz.com/cricket-match/live-scores/upcoming',
                      'https://m.cricbuzz.com/cricket-match/live-scores',
                      'https://m.cricbuzz.com/cricket-match/live-scores/recent'
                  ];
                  
                  for (let url of searchUrls) {
                      const res = await axios.get(url, { headers, timeout: 2500 });
                      const $ = cheerio.load(res.data);
                      $('a').each((i, el) => {
                          let txt = $(el).text().toLowerCase();
                          let href = $(el).attr('href') || "";
                          let parentTxt = $(el).parent().parent().text().toLowerCase();
                          
                          let isIPL = href.includes('indian-premier-league') || parentTxt.includes('ipl');
                          let isDateMatch = targetDate ? ((txt.includes(targetMonth) && txt.includes(targetDay)) || (parentTxt.includes(targetMonth) && parentTxt.includes(targetDay)) || txt.includes('today') || txt.includes('yesterday') || parentTxt.includes('yesterday')) : true;
                          
                          if (isIPL && isDateMatch && matchesTeams(txt + " " + parentTxt) && href.includes('scores')) {
                              cbUrl = 'https://m.cricbuzz.com' + href;
                          }
                      });
                      if (cbUrl) break;
                  }
              }
              if (cbUrl) {
                  cbUrl = cbUrl.replace('www.', 'm.').replace('/live-cricket-scorecard/', '/cricket-scores/');
                  const cbRes = await axios.get(cbUrl, { headers, timeout: 3000 });
                  const $ = cheerio.load(cbRes.data);
                  $('script, style, noscript').remove();
                  pageTitle = $('title').text() || "";
                  bodyText = $('body').text().replace(/\s+/g, ' ');
                  payload.source_url = cbUrl;
                  activeSource = "cricbuzz";
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
                  const $cx = cheerio.load(cxRes.data);
                  $cx('a').each((i, el) => {
                      let txt = $cx(el).text().toLowerCase();
                      let href = $cx(el).attr('href') || "";
                      let isDateMatch = targetDate ? ((txt.includes(targetMonth) && txt.includes(targetDay)) || txt.includes('today') || txt.includes('yesterday')) : true;
                      
                      if ((txt.includes('ipl') || txt.includes('indian premier league')) && isDateMatch && href.includes('scoreboard') && matchesTeams(txt)) {
                          crexUrl = 'https://crex.live' + href;
                      }
                  });
              }
              if (crexUrl) {
                  const cRes = await axios.get(crexUrl, { headers, timeout: 3000 });
                  const $ = cheerio.load(cRes.data);
                  $('script, style, noscript').remove();
                  pageTitle = $('title').text() || "";
                  bodyText = $('body').text().replace(/\s+/g, ' ');
                  payload.source_url = crexUrl;
                  activeSource = "crex";
                  htmlAcquired = true;
              }
          } catch (e) { /* Pivot to ESPN */ }
      }

      // --- TIER 3: ESPN JSON API ---
      if (!htmlAcquired) {
          try {
              const espnRes = await axios.get('https://hs-consumer-api.espncricinfo.com/v1/pages/matches/current', { headers, timeout: 3000 });
              
              espnMatchData = espnRes.data.matches.find(m => {
                  let isIPL = (m.series?.name?.toLowerCase().includes('ipl') || m.title.toLowerCase().includes('ipl'));
                  let hasTeam = matchesTeams(m.title.toLowerCase() + " " + m.teams.map(t => t.team.abbreviation).join(" ").toLowerCase());
                  
                  let mDate = new Date(m.startTime || "");
                  let options = { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric' };
                  let mDateStr = mDate.toLocaleString('en-US', options).toLowerCase(); 
                  let isDateMatch = targetDate ? (mDateStr === targetDate || mDateStr.includes(targetDay)) : true;

                  return isIPL && hasTeam && isDateMatch;
              });
              
              if (espnMatchData) {
                  pageTitle = espnMatchData.title;
                  bodyText = espnMatchData.statusText + " " + (espnMatchData.tossResults?.text || "");
                  payload.source_url = "ESPN-API-Uplink";
                  activeSource = "espn";
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
      const bodyLower = bodyText.toLowerCase();

      if (pageTitle) payload.title = pageTitle.split(/[,|]/)[0].trim();
      let venueMatch = bodyText.match(/Venue\s*:\s*([^•|{]+)/i) || (espnMatchData && espnMatchData.ground ? [null, espnMatchData.ground.name] : null);
      if (venueMatch) payload.venue = venueMatch[1].trim();

      let statusText = "";
      let titleWin = pageTitle.match(/([a-zA-Z\s\-]+won by\s\d+\s(?:runs|wickets|run|wicket))/i);
      let bodyWin = bodyText.match(/([a-zA-Z\s\-]+won by\s\d+\s(?:runs|wickets|run|wicket))/i);
      
      if (titleWin) statusText = titleWin[1].trim();
      else if (bodyWin) statusText = bodyWin[1].trim();
      else if (espnMatchData) statusText = espnMatchData.statusText;
      
      if (statusText) payload.status = statusText;
      
      let state = "future";
      let statusLower = (statusText || "").toLowerCase();

      if (statusLower.includes('won by') || statusLower.includes('tied') || statusLower.includes('abandoned') || bodyLower.includes('player of the match')) {
          state = "completed";
      } else if (bodyLower.includes('crr:') || bodyLower.includes('req:') || pageTitle.match(/\d+\/\d+/) || (espnMatchData && espnMatchData.status === "Live")) {
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
          let scoreMatch = pageTitle.match(/([A-Z]{2,4}\s\d+\/\d+\s\([^)]+\))/g);
          if (scoreMatch) payload.live_score = scoreMatch.join(' vs ');
          else payload.live_score = "Match Ended";

          payload.striker = "Match Ended"; payload.non_striker = "Match Ended";
          payload.bowler = "Match Ended"; payload.current_rr = "Match Ended";
          payload.required_rr = "Match Ended"; payload.last_over = ["E", "N", "D", "E", "D", "!"];
          
          let potmMatch = bodyText.match(/player of the match\s*([a-zA-Z\s]+)/i);
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

          if (espnMatchData) {
              payload.striker = "Tracking via API..."; payload.bowler = "Tracking via API...";
          } else {
             payload.striker = "Live Target Engaged"; payload.bowler = "Live Target Engaged";
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
