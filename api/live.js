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
        title: "TARGET UNKNOWN", status: "Scanning Fields...", match_state: "standby", winner: "PENDING",
        live_score: "NO SCORE", current_rr: "NO CRR", required_rr: "NO REQ",
        batter_1: "NO BATTER 1", batter_2: "NO BATTER 2", bowler: "NO BOWLER",
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

  let t1 = targetTeams.split(' vs ')[0]?.trim().split(' ')[0] || "unknown";
  let t2 = targetTeams.split(' vs ')[1]?.trim().split(' ')[0] || "unknown";
  const t1A = teamAliases[t1] || [t1]; const t2A = teamAliases[t2] || [t2];

  function matchesTeams(txt) {
      if (!txt) return false;
      return t1A.some(a => txt.includes(a)) && t2A.some(a => txt.includes(a));
  }

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
                  $ = cheerio.load(cRes.data); 
                  
                  // EXACT DOM ARTIFACT INJECTION
                  $('img[src*="bat" i], img[alt*="bat" i], svg').replaceWith(' [STRIKER] ');
                  $('script, style, noscript').remove();

                  pageTitle = $('title').text() || ""; 
                  bodyText = $('body').text().replace(/\s+/g, ' ').trim();
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
                  $ = cheerio.load(cbRes.data); 
                  
                  $('.cb-font-bold').append(' [STRIKER] ');
                  $('script, style, noscript').remove();
                  
                  pageTitle = $('title').text() || ""; 
                  bodyText = $('body').text().replace(/\s+/g, ' ').trim();
                  payload.source_url = "CRICBUZZ (Tier 2 Failsafe)"; htmlAcquired = true;
              }
          } catch (e) {}
      }

      payload.fetch_code = htmlAcquired ? "UREKHA" : "OH";

      if (!htmlAcquired) {
          payload.status = "UPLINK FAILED: ALL TARGETS BLOCKED"; payload.title = "UPLINK FAILED";
          return res.status(200).json({ success: true, match_info: payload }); 
      }

      // 1. BASIC MATCH INFO
      try {
          let vsMatch = pageTitle.match(/([a-zA-Z0-9\s]+?\s+(?:vs|v)\s+[a-zA-Z0-9\s]+)/i) || bodyText.match(/([a-zA-Z0-9\s]+?\s+(?:vs|v)\s+[a-zA-Z0-9\s]+)/i);
          let finalTitle = vsMatch ? vsMatch[1] : (targetTeams || pageTitle.split(/[,|]/)[0]);
          payload.title = finalTitle.replace(/live score/i, '').replace(/live/i, '').replace(/cricket/i, '').trim().toUpperCase();

          let venueMatch = bodyText.match(/Venue\s*:\s*([^•|{]+)/i);
          if (venueMatch) payload.venue = venueMatch[1].trim();

          let statusText = $ ? $('.cb-status-msg, .match-status, .info-status, .cb-text-complete').first().text().trim() : "";
          let titleWin = pageTitle.match(/([a-zA-Z\s\-]+won by\s\d+\s(?:runs|wickets|run|wicket))/i);
          if (!statusText && titleWin) statusText = titleWin[1].trim();
          if (statusText) payload.status = statusText;
          
          let statusLower = (statusText || "").toLowerCase();
          let isLiveScoreFormat = bodyText.match(/[A-Z]{2,4}\s\d+[\/\-]\d+/);
          
          if (statusLower.includes('won by') || statusLower.includes('tied') || statusLower.includes('abandoned')) {
              payload.match_state = "completed";
          } else if (isLiveScoreFormat && (bodyText.includes('CRR:') || bodyText.includes('REQ:') || bodyText.match(/Players Entering/i))) {
              payload.match_state = "live";
          } else {
              payload.match_state = "future";
          }
      } catch (e) { payload.match_state = "standby"; }

      // 2. EXPLICIT TOSS HUNTER
      try {
          let tossMatch = bodyText.match(/Toss\s*:\s*([A-Za-z\s]+)/i);
          if (!tossMatch) tossMatch = bodyText.match(/([A-Za-z\s\.\-]+(?:won the toss|opt(?:ed|s)? to)\s(?:bat|bowl|field))/i);
          if (tossMatch) payload.toss = tossMatch[1].trim();
          else payload.toss = "Tracking Toss Data...";
      } catch (e) { payload.toss = "Toss Error"; }

      if (payload.match_state === "live") {
          
          // 3. SCORE & RR
          try {
              let scoreRegex = /([A-Z]{2,4}\s\d+[\/\-]\d+\s*\(?\d+\.\d+\)?)/;
              let scoreMatch = pageTitle.match(scoreRegex) || bodyText.match(scoreRegex);
              if (scoreMatch) {
                  let rawScore = scoreMatch[1];
                  let parts = rawScore.match(/([A-Z]{2,4})\s*(\d+)[\/\-](\d+)\s*\(?([\d\.]+)\)?/);
                  if (parts) payload.live_score = `${parts[1]} ${parts[2]}/${parts[3]} (${parts[4]})`;
                  else payload.live_score = rawScore.replace('-', '/');
              }
              
              let crrMatch = bodyText.match(/CRR:\s*([\d\.]+)/i);
              if (crrMatch) payload.current_rr = crrMatch[1];
              
              let reqMatch = bodyText.match(/(?:REQ|RRR|Req RR)\s*[:-]?\s*([\d\.]+)/i);
              if (reqMatch) payload.required_rr = reqMatch[1];
              else payload.required_rr = "1st Innings";
          } catch(e) {}

          // 4. EXACT BATTER EXTRACTION (No Alphabetical Sorting, No Last Wkt)
          try {
              let batIdx = bodyText.search(/Batter/i);
              let bowIdx = bodyText.search(/P'ship/i) !== -1 ? bodyText.search(/P'ship/i) : bodyText.search(/Bowler/i);
              
              if (batIdx !== -1 && bowIdx !== -1 && bowIdx > batIdx) {
                  let searchArea = bodyText.substring(batIdx, bowIdx);
                  // Hard block the "Last wkt" from entering the batter array
                  searchArea = searchArea.split(/Last wkt/i)[0]; 

                  let batterRegex = /([A-Za-z\s\.\-']+?)\s*(\[STRIKER\])?\s*(\d{1,3})\s*\(\s*(\d{1,3})\s*\)/g;
                  let matches = [...searchArea.matchAll(batterRegex)];
                  let validBatters = [];

                  matches.forEach(m => {
                      let rawName = m[1].replace(/[A-Z]{3,}/g, '').trim(); 
                      let words = rawName.split(/\s+/).filter(w => !['Batter', 'Batsman', 'SR', '4s', '6s'].includes(w));
                      let name = words.slice(-2).join(' '); // Keep last two words
                      
                      if (name.length > 2) {
                          let isStriker = m[2] ? true : false;
                          validBatters.push({ name: name, runs: m[3], balls: m[4], isStriker: isStriker });
                      }
                  });

                  if (validBatters.length > 0) {
                      payload.batter_1 = `${validBatters[0].name} ${validBatters[0].runs}(${validBatters[0].balls})` + (validBatters[0].isStriker ? " 🏏" : "");
                      if (validBatters.length > 1) {
                          payload.batter_2 = `${validBatters[1].name} ${validBatters[1].runs}(${validBatters[1].balls})` + (validBatters[1].isStriker ? " 🏏" : "");
                      } else {
                          payload.batter_2 = "Off-Strike";
                      }
                  } else { 
                      payload.batter_1 = "Target Engaged"; payload.batter_2 = "Off-Strike"; 
                  }
              }
          } catch(e) { payload.batter_1 = "Extractor Error"; payload.batter_2 = "Extractor Error"; }

          // 5. SURGICAL BOWLER EXTRACTION
          try {
              let bowIdx = bodyText.search(/Bowler/i);
              if (bowIdx !== -1) {
                  let bowArea = bodyText.substring(bowIdx, bowIdx + 150);
                  let bowMatch = bowArea.match(/([A-Z][a-zA-Z\s\.\-']{2,25}?)\s+(\d{1,2}[\-\/]\d{1,3}|\d{1,2}\.\d{1,2})/);
                  if (bowMatch && bowMatch[1]) {
                      let name = bowMatch[1].replace(/(Bowler|W-R|Overs|Econ|Recent|Match)/gi, '').trim();
                      payload.bowler = name || "Active Bowler";
                  }
              }
          } catch(e) { payload.bowler = "Extractor Error"; }

          // 6. LAST OVER
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
                  }
              }
          } catch(e) {}

          // 7. PURE MARKET ODDS SNIPER (NO MORE FAKE MATH)
          try {
              let isRealMarket = false;
              let favTeam = ""; let favPaise = 0; let layPaise = 0;
              
              // Looks for standard abbreviations followed immediately by two numbers (e.g., PBKS 38 39)
              let oddsRegex = /\b(CSK|LSG|MI|PBKS|DC|GT|KKR|RR|RCB|SRH)\b[^0-9a-zA-Z]{0,15}(\d{2})\s+(\d{2})\b/gi;
              let oddsMatches = [...bodyText.matchAll(oddsRegex)];
              
              if (oddsMatches.length > 0) {
                  let m = oddsMatches[0];
                  let p1 = parseInt(m[2]);
                  let p2 = parseInt(m[3]);
                  
                  if (Math.abs(p1 - p2) <= 3 && p1 > 0 && p2 < 100) {
                      favTeam = m[1].toUpperCase();
                      favPaise = p1;
                      layPaise = p2;
                      isRealMarket = true;
                  }
              }

              if (isRealMarket) {
                  payload.match_prediction = `[LIVE MARKET ODDS] ${favTeam} is Favorite at ${favPaise}-${layPaise} Paise | [DIRECTIVE] PLAY (Back) at ${favPaise}p. If market swings 10p, EAT (Lay) to Green Book.`;
              } else {
                  payload.match_prediction = `[AWAITING MARKET ODDS] No live line detected on screen. Hold positions.`;
              }

              // Keep Phase Targets active based purely on current RR
              if (payload.live_score.includes('/')) {
                  let scoreMatchClean = payload.live_score.match(/(\d+)[\/\-](\d+)\s*\(?([\d\.]+)\)?/);
                  if (scoreMatchClean) {
                      let runs = parseInt(scoreMatchClean[1]); let wkts = parseInt(scoreMatchClean[2]);
                      let oversSplit = scoreMatchClean[3].split('.');
                      let overs = parseInt(oversSplit[0]); let balls = oversSplit[1] ? parseInt(oversSplit[1]) : 0;
                      
                      let crr = parseFloat(payload.current_rr) || 8.5;
                      let projections = []; let milestones = [6, 10, 15, 20];
                      for (let m of milestones) {
                          if (overs < m) {
                              let oversLeft = m - (overs + (balls/6));
                              let projected = Math.floor(runs + (oversLeft * crr));
                              projections.push(`[${m}v: ${projected}]`);
                          }
                      }
                      if (payload.required_rr === "1st Innings" && projections.length > 0) {
                          payload.prediction = `TARGETS: ${projections.join(' ')}`;
                      } else {
                          payload.prediction = `CHASE PHASE | TARGETS LOCKED`;
                      }
                  }
              }

          } catch(e) { payload.match_prediction = "Error Fetching Odds"; }
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
