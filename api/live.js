const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  let targetUrl = req.query.url || "";
  let targetTeams = (req.query.teams || "").toLowerCase().trim();

  const headers = { 'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36' };

  let payload = {
        title: "YAHOO: Target Unknown", status: "YAHOO: Status Missing", match_state: "standby",
        live_score: "YAHOO: No Score", current_rr: "YAHOO: No CRR", required_rr: "YAHOO: No REQ",
        striker: "YAHOO: No Striker", non_striker: "YAHOO: No Non-Striker", bowler: "YAHOO: No Bowler",
        toss: "YAHOO: No Toss Data", venue: "YAHOO: Venue Hidden", last_over: ["Y", "A", "H", "O", "O", "!"],
        prediction: "YAHOO: AI Offline", source_url: "Hunting..."
  };

  let pageTitle = "";
  let bodyText = "";
  let activeSource = "";
  let espnMatchData = null; // Used if we fall all the way back to ESPN

  try {
      // ==============================================================
      // PHASE 1: MERCENARY DATA ACQUISITION (Cricbuzz -> CREX -> ESPN)
      // ==============================================================
      
      let htmlAcquired = false;

      // --- TIER 1: CRICBUZZ ---
      if (!htmlAcquired) {
          try {
              let cbUrl = targetUrl;
              if (!cbUrl && targetTeams) {
                  // Quick search on Cricbuzz
                  let t1 = targetTeams.split(' vs ')[0].trim().split(' ')[0];
                  const res = await axios.get('https://m.cricbuzz.com/cricket-match/live-scores', { headers, timeout: 2500 });
                  const $ = cheerio.load(res.data);
                  $('a').each((i, el) => {
                      if ($(el).text().toLowerCase().includes(t1) && $(el).attr('href').includes('scores')) {
                          cbUrl = 'https://m.cricbuzz.com' + $(el).attr('href');
                      }
                  });
              }
              if (cbUrl) {
                  cbUrl = cbUrl.replace('www.', 'm.').replace('/live-cricket-scorecard/', '/cricket-scores/');
                  const cbRes = await axios.get(cbUrl, { headers, timeout: 3000 });
                  const $ = cheerio.load(cbRes.data);
                  pageTitle = $('title').text() || "";
                  bodyText = $('body').text().replace(/\s+/g, ' ');
                  payload.source_url = cbUrl;
                  activeSource = "cricbuzz";
                  htmlAcquired = true;
              }
          } catch (e) { console.log("Cricbuzz Blocked. Pivoting to CREX..."); }
      }

      // --- TIER 2: CREX (The Secondary Breach) ---
      if (!htmlAcquired) {
          try {
              let crexUrl = targetUrl.includes('crex') ? targetUrl : "";
              if (!crexUrl && targetTeams) {
                  // Hit CREX schedule to find the match
                  const cxRes = await axios.get('https://crex.live/fixtures/match-list', { headers, timeout: 3000 });
                  const $cx = cheerio.load(cxRes.data);
                  let t1 = targetTeams.split(' vs ')[0].trim().split(' ')[0];
                  $cx('a').each((i, el) => {
                      let href = $cx(el).attr('href') || "";
                      if (href.includes('scoreboard') && $cx(el).text().toLowerCase().includes(t1)) {
                          crexUrl = 'https://crex.live' + href;
                      }
                  });
              }
              if (crexUrl) {
                  const cRes = await axios.get(crexUrl, { headers, timeout: 3000 });
                  const $ = cheerio.load(cRes.data);
                  pageTitle = $('title').text() || "";
                  bodyText = $('body').text().replace(/\s+/g, ' ');
                  payload.source_url = crexUrl;
                  activeSource = "crex";
                  htmlAcquired = true;
              }
          } catch (e) { console.log("CREX Blocked. Pivoting to ESPN..."); }
      }

      // --- TIER 3: ESPN JSON API (The Unblockable Ghost) ---
      if (!htmlAcquired) {
          try {
              const espnRes = await axios.get('https://hs-consumer-api.espncricinfo.com/v1/pages/matches/current', { headers, timeout: 3000 });
              let t1 = targetTeams.split(' vs ')[0].trim().split(' ')[0];
              espnMatchData = espnRes.data.matches.find(m => m.title.toLowerCase().includes(t1) || m.teams.some(t => t.team.abbreviation.toLowerCase() === t1.toLowerCase()));
              
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
          payload.status = "YAHOO: Match Not Found on Any Server";
          payload.title = "UPLINK FAILED";
          return res.status(200).json({ success: true, match_info: payload }); 
      }

      // ==============================================================
      // PHASE 2: BATTLEFIELD ASSESSMENT (State Detection)
      // ==============================================================
      const bodyLower = bodyText.toLowerCase();

      // Universal Title & Venue Regex
      if (pageTitle) payload.title = pageTitle.split(/[,|]/)[0].trim();
      let venueMatch = bodyText.match(/Venue\s*:\s*([^•|{]+)/i) || (espnMatchData && espnMatchData.ground ? [null, espnMatchData.ground.name] : null);
      if (venueMatch) payload.venue = venueMatch[1].trim();

      // Universal Status Detection
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
      // PHASE 3: TIMELINE-SPECIFIC DATA EXTRACTION (Regex Powered)
      // ==============================================================

      // Universal Toss Extraction
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
          
          let potm = bodyText.match(/player of the match\s*([^•]+)/i);
          payload.prediction = potm ? `POTM: ${potm[1].trim()}` : "Match Ended";
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

          // We use ESPN arrays if available, else regex on raw text
          if (espnMatchData) {
              payload.striker = "Tracking via API..."; payload.bowler = "Tracking via API...";
          } else {
             // Fallback for players if regex can't find them cleanly
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
      // ==============================================================
      // THE "OH SORRY" BLOCK (Triggers if EVERY Site is Down/Blocked)
      // ==============================================================
      payload.status = "OH SORRY: Connection Blocked by All Sites";
      payload.live_score = "OH SORRY: Cannot Fetch";
      payload.striker = "OH SORRY"; payload.non_striker = "OH SORRY";
      payload.bowler = "OH SORRY"; payload.toss = "OH SORRY";
      payload.venue = "OH SORRY"; payload.prediction = "OH SORRY: AI Offline";
      payload.last_over = ["O", "H", "S", "R", "R", "Y"];
      
      return res.status(200).json({ success: false, error: err.message, match_info: payload });
  }
};
