const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');

  if (req.method === 'OPTIONS') return res.status(200).end();

  let targetUrl = req.query.url || "";
  let targetTeams = (req.query.teams || "").toLowerCase().trim();
  let rawDateStr = req.query.time || ""; 
  
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

  let pageTitle = ""; let bodyText = ""; let $ = null; 

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
      const cxRes = await axios.get(`https://crex.com/fixtures/match-list?_t=${Date.now()}`, { headers, timeout: 3000 });
      const $temp = cheerio.load(cxRes.data);
      let crexUrl = "";
      $temp('a').each((i, el) => {
          let txt = $temp(el).text().toLowerCase(); let href = $temp(el).attr('href') || "";
          if (matchesTeams(txt + " " + href)) crexUrl = href.startsWith('http') ? href : 'https://crex.com' + href;
      });
      
      if (crexUrl) {
          const cRes = await axios.get(crexUrl, { headers, timeout: 3000 });
          $ = cheerio.load(cRes.data); $('script, style, noscript').remove();
          pageTitle = $('title').text() || ""; bodyText = $('body').text().replace(/\s+/g, ' ');
          payload.source_url = "CREX (Tier 1 Speed)"; htmlAcquired = true;
      }

      payload.fetch_code = htmlAcquired ? "UREKHA" : "OH";
      if (!htmlAcquired) return res.status(200).json({ success: true, match_info: payload });

      // Core Logic
      let isLiveScoreFormat = bodyText.match(/[A-Z]{2,4}\s\d+[\/\-]\d+/);
      payload.match_state = (isLiveScoreFormat && (bodyText.includes('CRR:') || bodyText.match(/Players Entering/i))) ? "live" : "future";

      if (payload.match_state === "live") {
          // Score
          let scoreMatch = pageTitle.match(/([A-Z]{2,4}\s\d+[\/\-]\d+)/);
          if (scoreMatch) payload.live_score = scoreMatch[1].replace('-', '/');
          
          // Players
          let titleBatterRegex = /\(([A-Za-z\s\.\-']+?\s*\d{1,3}\s*\(\s*\d{1,3}\s*\))(?:\s*,\s*([A-Za-z\s\.\-']+?\s*\d{1,3}\s*\(\s*\d{1,3}\s*\)))?\)/;
          let titleMatch = pageTitle.match(titleBatterRegex);
          if (titleMatch) {
              payload.striker = titleMatch[1] + " 🏏";
              payload.non_striker = titleMatch[2] || "Off-Strike";
          }

          // MARKET SNIPER (THE DAPPA ODDS)
          let oddsRegex = /([A-Z]{2,4})\s+(\d{2})\s+(\d{2})/i;
          let marketMatch = bodyText.match(oddsRegex);
          let favTeam = "", favPaise = 45, layPaise = 47;
          
          if (marketMatch && parseInt(marketMatch[2]) > 10) {
             favTeam = marketMatch[1]; favPaise = parseInt(marketMatch[2]); layPaise = parseInt(marketMatch[3]);
          } else {
             favTeam = "Balanced"; favPaise = 45; layPaise = 47;
          }

          payload.match_prediction = `[LIVE MARKET] ${favTeam} is Favorite at ${favPaise}-${layPaise} Paise | [DIRECTIVE] PLAY (Back) at ${favPaise}p. If market swings 10p, EAT (Lay) to Green Book.`;
      }
      return res.status(200).json({ success: true, match_info: payload });
  } catch (err) {
      return res.status(200).json({ success: false, error: err.message, match_info: payload });
  }
};
