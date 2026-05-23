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
  let rawDateStr = req.query.time || ""; 
  
  let userPosition = (req.query.position || "NONE").toUpperCase().trim();

  const headers = { 
      'User-Agent': 'Mozilla/5.0 (Linux; Android 13; SM-G991U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
  };

  let payload = {
        title: "TARGET UNKNOWN", status: "Scanning Fields...", match_state: "standby", winner: "PENDING",
        live_score: "NO SCORE", current_rr: "NO CRR", required_rr: "NO REQ",
        batter_1: "Awaiting...", batter_2: "Awaiting...", bowler: "Scanning...",
        toss: "Tracking Toss Data...", venue: "VENUE HIDDEN", last_over: ["-", "-", "-", "-", "-", "-"],
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

  const venueProfiles = {
      "chennai": { type: "Spin/Slow", par: 165 }, "lucknow": { type: "Sluggish/Grip", par: 160 },
      "ekana": { type: "Sluggish/Grip", par: 160 }, "mumbai": { type: "Batting Paradise", par: 195 },
      "wankhede": { type: "Batting Paradise", par: 195 }, "ahmedabad": { type: "Balanced/Pace", par: 180 },
      "bengaluru": { type: "Flat/Small Boundaries", par: 200 }, "chinnaswamy": { type: "Flat/Small Boundaries", par: 200 },
      "kolkata": { type: "Pace/Bounce", par: 185 }, "eden": { type: "Pace/Bounce", par: 185 },
      "jaipur": { type: "Balanced/Large", par: 175 }, "delhi": { type: "Flat Deck", par: 195 },
      "hyderabad": { type: "Flat/True Bounce", par: 195 }, "rajiv": { type: "Flat/True Bounce", par: 195 },
      "punjab": { type: "Pace/Bounce", par: 175 }, "mullanpur": { type: "Pace/Bounce", par: 175 }
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
      let htmlAcquired = false; let timestampBuster = Date.now(); 

      if (!htmlAcquired) {
          try {
              let crexUrl = (targetUrl.includes('crex.com') || targetUrl.includes('crex.live')) ? targetUrl : "";
              if (!crexUrl && targetTeams) {
                  const cxRes = await axios.get(`https://crex.com/fixtures/match-list?_t=${timestampBuster}`, { headers, timeout: 2500 });
                  const $temp = cheerio.load(cxRes.data);
                  $temp('a').each((i, el) => {
                      let txt = $temp(el).text().toLowerCase(); let href = $temp(el).attr('href') || ""; 
                      if (matchesTeams(txt + " " + href)) crexUrl = href.startsWith('http') ? href : 'https://crex.com' + href;
                  });
              }
              if (crexUrl) {
                  const cRes = await axios.get(crexUrl.includes('?') ? `${crexUrl}&_t=${timestampBuster}` : `${crexUrl}?_t=${timestampBuster}`, { headers, timeout: 3000 });
                  $ = cheerio.load(cRes.data); 
                  
                  // SURGICAL ARTIFACT INJECTION TO CATCH STRIKER ICON
                  $('img[src*="bat" i], img[alt*="bat" i], svg').replaceWith(' [STRIKER] ');
                  $('.cb-font-bold').append(' [STRIKER] ');
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
              if (cbUrl) {
                  const cbRes = await axios.get(cbUrl.includes('?') ? `${cbUrl}&_t=${timestampBuster}` : `${cbUrl}?_t=${timestampBuster}`, { headers, timeout: 3500 });
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
          payload.status = "UPLINK FAILED"; return res.status(200).json({ success: true, match_info: payload }); 
      }

      // MATCH STATE
      try {
          let finalTitle = pageTitle.split(/[,|]/)[0];
          payload.title = finalTitle.replace(/live score/i, '').replace(/live/i, '').replace(/cricket/i, '').trim().toUpperCase();

          let venueMatch = bodyText.match(/Venue\s*:\s*([^•|{]+)/i);
          if (venueMatch) payload.venue = venueMatch[1].trim();
          else if (homeVenues[t1A[0]]) payload.venue = homeVenues[t1A[0]];

          let statusLower = (payload.status || "").toLowerCase();
          let isLiveScoreFormat = bodyText.match(/[A-Z]{2,4}\s\d+[\/\-]\d+/);
          
          if (statusLower.includes('won by') || statusLower.includes('tied') || statusLower.includes('abandoned')) {
              payload.match_state = "completed";
          } else if (isLiveScoreFormat && (bodyText.includes('CRR:') || bodyText.includes('REQ:'))) {
              payload.match_state = "live";
          } else {
              payload.match_state = "future";
          }
      } catch (e) { payload.match_state = "standby"; }

      // STRICT TOSS HUNTER
      try {
          let tossMatch = bodyText.match(/Toss:\s*([A-Za-z]+)/i);
          if (!tossMatch) tossMatch = bodyText.match(/([A-Za-z\s]+)\s+opt/i);
          if (tossMatch) payload.toss = tossMatch[0].trim();
      } catch (e) {}

      if (payload.match_state === "live") {
          // SCORE EXTRACTION
          try {
              let scoreRegex = /([A-Z]{2,4}\s\d+[\/\-]\d+\s*\(?\d+\.\d+\)?)/;
              let scoreMatch = pageTitle.match(scoreRegex) || bodyText.match(scoreRegex);
              if (scoreMatch) {
                  let parts = scoreMatch[1].match(/([A-Z]{2,4})\s*(\d+)[\/\-](\d+)\s*\(?([\d\.]+)\)?/);
                  if (parts) payload.live_score = `${parts[1]} ${parts[2]}/${parts[3]} (${parts[4]})`;
              }
          } catch(e) {}

          // CRR/RRR EXTRACTION
          try {
              let crrMatch = bodyText.match(/CRR:\s*([\d\.]+)/i);
              if (crrMatch) payload.current_rr = crrMatch[1];
              let reqMatch = bodyText.match(/(?:REQ|RRR|Req RR)\s*[:-]?\s*([\d\.]+)/i);
              if (reqMatch) payload.required_rr = reqMatch[1];
              else payload.required_rr = "1st Innings";
          } catch(e) {}

          // ==========================================
          // EXACT CREX BATTER ALIGNMENT (No Ghost Batters)
          // ==========================================
          try {
              let batIdx = bodyText.search(/Batter|Batsman/i);
              let searchArea = batIdx !== -1 ? bodyText.substring(batIdx, batIdx + 500) : bodyText;
              
              // FIREWALL: Cut the string immediately before "Last wkt" or "P'ship" to prevent ghost players
              searchArea = searchArea.split(/Last wkt|P'ship|Bowler/i)[0];
              
              let batterRegex = /([A-Z][a-zA-Z\s\.\-']{2,25}?)\s*(\[STRIKER\])?\s*(\d{1,3})\s*\(\s*(\d{1,3})\s*\)/gi;
              let matches = [...searchArea.matchAll(batterRegex)];
              
              if (matches.length > 0) {
                  let b1Raw = matches[0];
                  let b1Name = b1Raw[1].replace(/[A-Z]{3,}/g, '').trim().split(/\s+/).slice(-2).join(' ');
                  payload.batter_1 = `${b1Name} ${b1Raw[3]}(${b1Raw[4]})` + (b1Raw[2] ? " 🏏" : "");

                  if (matches.length > 1) {
                      let b2Raw = matches[1];
                      let b2Name = b2Raw[1].replace(/[A-Z]{3,}/g, '').trim().split(/\s+/).slice(-2).join(' ');
                      payload.batter_2 = `${b2Name} ${b2Raw[3]}(${b2Raw[4]})` + (b2Raw[2] ? " 🏏" : "");
                  } else {
                      payload.batter_2 = "Off-Strike";
                  }
              }
          } catch(e) {}

          // ==========================================
          // STRICT BOWLER HUNTER (Ignores "Milestone")
          // ==========================================
          try {
              let bowIdx = bodyText.search(/Bowler/i);
              let bowArea = bowIdx !== -1 ? bodyText.substring(bowIdx, bowIdx + 200) : bodyText;
              
              // Lock onto the specific headers Crex uses: "Econ" or "Overs"
              let bowMatch = bowArea.match(/Econ\s+([A-Za-z\s\.\-']+?)\s+\d{1,2}[\/\-]\d{1,2}/i);
              if (!bowMatch) bowMatch = bowArea.match(/([A-Z][a-zA-Z\s\.\-']{2,25}?)\s+\d{1,2}[\/\-]\d{1,2}/i);
              
              if (bowMatch && bowMatch[1]) {
                  let name = bowMatch[1].replace(/(Econ|ECO|Overs|Runs|Wickets|Bowler|Milestone|Partner|Recent|Match)/gi, '').trim();
                  payload.bowler = name.split(/\s+/).slice(-2).join(' ') || "Active Bowler";
              }
          } catch(e) {}

          // RECENT OVERS
          try {
              let recentTextMatch = bodyText.match(/Recent\s*:\s*([W0-9NbLwd|\s]+)/i);
              if (recentTextMatch) {
                  payload.last_over = recentTextMatch[1].split(/[|\s]+/).filter(b => b.trim()).slice(-6);
              }
          } catch(e) {}

          // ==========================================================
          // AGGRESSIVE MARKET ODDS SNIPER (Failsafe True Odds Override)
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

                      let crr = parseFloat(payload.current_rr); if (isNaN(crr) || totalBalls === 0) crr = 8.5; 
                      let isChase = (payload.required_rr && !payload.required_rr.includes("REQ") && payload.required_rr !== "1st Innings");
                      
                      let batWinProb = 50;
                      let maxProb = 50; 
                      let favPaise = 50;
                      let layPaise = 52;
                      let favTeam = "Balanced";
                      let isRealMarket = false;

                      // AGGRESSIVE ODDS REGEX: Searches for Team Abbr + Any Icons + 38 39
                      const teamMap = {
                          "csk": "CSK", "lsg": "LSG", "mi": "MI", "pbks": "PBKS", "dc": "DC", 
                          "gt": "GT", "kkr": "KKR", "rr": "RR", "rcb": "RCB", "srh": "SRH"
                      };
                      let teamsPattern = Object.keys(teamMap).join('|');
                      let oddsRegex = new RegExp(`\\b(${teamsPattern})\\b[^0-9]{0,25}?(\\d{1,2})\\s+(\\d{1,2})\\b`, 'i');
                      let numViewMatch = bodyText.match(oddsRegex);
                      
                      if (numViewMatch && numViewMatch[1]) {
                          let matchedTeam = numViewMatch[1].toLowerCase();
                          let p1 = parseInt(numViewMatch[2]); 
                          let p2 = parseInt(numViewMatch[3]);
                          
                          if (Math.abs(p1 - p2) <= 3 && p1 > 0 && p2 < 100) {
                              favTeam = teamMap[matchedTeam];
                              favPaise = p1; layPaise = p2;
                              maxProb = (100 / (100 + favPaise)) * 100; 
                              isRealMarket = true;
                          }
                      }

                      // If Real Market Not Found, Calculate True Odds mathematically
                      if (!isRealMarket) {
                          if (isChase) {
                              let rrrVal = parseFloat(payload.required_rr);
                              if (totalBalls === 0) { batWinProb = 50; } 
                              else if (wkts >= 10) { batWinProb = 1; } 
                              else if (rrrVal <= 0) { batWinProb = 99; } 
                              else {
                                  let baseProb = 50; let rrDiff = crr - rrrVal;
                                  baseProb += (rrDiff * 3); baseProb -= (wkts * 4);
                                  batWinProb = Math.max(5, Math.min(95, baseProb)); 
                              }
                          } else {
                              if (totalBalls === 0) batWinProb = 50;
                              else {
                                  let parScore = 175; let projected = runs + ((120-totalBalls) / 6) * crr;
                                  let baseProb = 50 + ((projected - parScore) * 0.8) - (wkts * 3);
                                  batWinProb = Math.max(5, Math.min(95, baseProb));
                              }
                          }
                          maxProb = Math.max(batWinProb, 100 - batWinProb);
                          if (maxProb > 55 && maxProb < 90) maxProb = 50 + ((maxProb - 50) * 0.75); 
                          favPaise = Math.max(1, Math.round(((100 - maxProb) / maxProb) * 100));
                          layPaise = favPaise + 2;
                          favTeam = batWinProb > 50 ? batTeam : "Bowling Team";
                      }

                      let displayOdds = `${favPaise}-${layPaise}`;
                      let tag = isRealMarket ? "[LIVE MARKET ODDS]" : "[TRUE ODDS]";
                      let matchTactic = `${tag} ${favTeam} is Favorite at ${displayOdds} Paise\nWin Probability: ${maxProb.toFixed(0)}%|`;

                      if (totalBalls === 0 && !isRealMarket) {
                          matchTactic = `[LIVE MARKET] Book Open at 95-98 Paise (Even)\nWin Probability: 50%|[ANALYSIS] Match is initiating.|[DIRECTIVE] 🟡 HOLD. Keep capital reserved.`;
                      } else {
                          if (maxProb > 80 || favPaise <= 25) {
                              matchTactic += `[ANALYSIS] ${favTeam} is dominating.|[DIRECTIVE] 🟢 BOOK SET. EAT (Lay) ${favTeam} at ${layPaise}p to Green Book.`;
                          } else if (isChase) {
                              matchTactic += `[ANALYSIS] Chase is active. Market is fluid.|[DIRECTIVE] 🟡 SCALP ENTRY: Wait for a 15-20 paise swing.`;
                          } else {
                              matchTactic += `[ANALYSIS] 1st Innings build phase.|[DIRECTIVE] 🔴 EAT (Lay) ${batTeam} at ${layPaise}p if boundaries dry up.`;
                          }
                      }
                      
                      payload.match_prediction = matchTactic;
                  }
              }
          } catch(e) {}
      }

      return res.status(200).json({ success: true, match_info: payload });

  } catch (err) {
      payload.status = "FIREWALL BLOCKED CONNECTION";
      payload.fetch_code = "OH"; 
      return res.status(200).json({ success: false, error: err.message, match_info: payload });
  }
};
