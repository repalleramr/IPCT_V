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

  let targetUrl = req.query.url || "";
  let targetTeams = (req.query.teams || "").toLowerCase().trim();
  
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
      "csk": "M.A. Chidambaram Stadium, Chennai", "lsg": "Ekana Cricket Stadium, Lucknow",
      "mi": "Wankhede Stadium, Mumbai", "pbks": "Mullanpur / Mohali",
      "dc": "Arun Jaitley Stadium, Delhi", "gt": "Narendra Modi Stadium, Ahmedabad",
      "kkr": "Eden Gardens, Kolkata", "rr": "Sawai Mansingh Stadium, Jaipur",
      "rcb": "M. Chinnaswamy Stadium, Bengaluru", "srh": "Rajiv Gandhi Intl Stadium, Hyderabad"
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
          
          let isLiveScoreFormat = bodyText.match(/[A-Z]{2,4}\s\d+[\/\-]\d+/);
          
          if (statusLower.includes('won by') || statusLower.includes('tied') || statusLower.includes('abandoned')) {
              payload.match_state = "completed";
          } else if (isLiveScoreFormat && (bodyText.includes('CRR:') || bodyText.includes('REQ:') || bodyText.match(/Players Entering/i) || (espnMatchData && espnMatchData.status === "Live"))) {
              payload.match_state = "live";
          } else {
              payload.match_state = "future";
          }
      } catch (e) { payload.match_state = "standby"; }

      // --- [TOSS DATA FIX] ---
      try {
          let tossMatch = bodyText.match(/(?:Toss|Toss winner|Toss result)\s*[:\-]?\s*([A-Za-z\s]+)(?:won|opt|elect)/i);
          if (!tossMatch) tossMatch = bodyText.match(/Toss\s*:\s*([A-Za-z\s]+)/i);
          if (tossMatch) payload.toss = tossMatch[1].trim() + " won the toss";
          else if (espnMatchData && espnMatchData.tossResults) payload.toss = espnMatchData.tossResults.text;
      } catch (e) { payload.toss = "Toss Error"; }

      if (payload.match_state === "live") {
          try {
              let scoreRegex = /([A-Z]{2,4}\s\d+[\/\-]\d+\s*\(?\d+\.\d+\)?)/;
              let scoreMatch = pageTitle.match(scoreRegex) || bodyText.match(scoreRegex);
              if (scoreMatch) payload.live_score = scoreMatch[1].replace('-', '/');
          } catch(e) { payload.live_score = "Score Error"; }

          // --- [TRUE ODDS FIX] ---
          try {
              let teamsStr = [...t1A, ...t2A].join('|');
              // Look for the team name followed by two numbers (the odds)
              let oddsRegex = new RegExp(`(${teamsStr})\\s+([0-9]{2})\\s+([0-9]{2})`, "gi");
              let match = oddsRegex.exec(bodyText);
              if (match) {
                  payload.match_prediction = `[TRUE ODDS] ${match[1].toUpperCase()} is Favorite at ${match[2]}-${match[3]} Paise`;
              } else {
                  payload.match_prediction = "[TRUE ODDS] Market Closed or Scanning...";
              }
          } catch(e) {}
      }

      return res.status(200).json({ success: true, match_info: payload });
  } catch (error) {
      return res.status(500).json({ success: false, match_info: payload });
  }
};
