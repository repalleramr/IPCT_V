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

  // ==============================================================
  // 1. THE URL HUNTER (Finds link dynamically if only ?teams= is passed)
  // ==============================================================
  if (!targetUrl && targetTeams) {
      let t1 = targetTeams.split(' vs ')[0]?.trim().split(' ')[0] || "unknown";
      let t2 = targetTeams.split(' vs ')[1]?.trim().split(' ')[0] || "unknown";
      
      const teamAliases = {
          "chennai": ["csk", "chennai"], "lucknow": ["lsg", "lucknow"],
          "mumbai": ["mi", "mumbai"], "punjab": ["pbks", "punjab"],
          "delhi": ["dc", "delhi"], "gujarat": ["gt", "gujarat"],
          "kolkata": ["kkr", "kolkata"], "rajasthan": ["rr", "rajasthan"],
          "royal": ["rcb", "bengaluru"], "sunrisers": ["srh", "hyderabad"]
      };

      const t1A = teamAliases[t1] || [t1];
      const t2A = teamAliases[t2] || [t2];

      const searchDirs = [
          'https://m.cricbuzz.com/cricket-match/live-scores',
          'https://m.cricbuzz.com/cricket-match/live-scores/upcoming',
          'https://m.cricbuzz.com/cricket-match/live-scores/recent'
      ];

      for (let dir of searchDirs) {
          try {
              const dRes = await axios.get(dir, { headers, timeout: 3000 });
              const $d = cheerio.load(dRes.data);
              $d('a').each((i, el) => {
                  let href = $d(el).attr('href');
                  let txt = ($d(el).text() + " " + $d(el).parent().parent().text()).toLowerCase();
                  if (href && (href.includes('/cricket-scores/') || href.includes('/live-cricket-scores/'))) {
                      let match1 = t1A.some(a => txt.includes(a));
                      let match2 = t2A.some(a => txt.includes(a));
                      if (match1 && match2) {
                          targetUrl = href.startsWith('http') ? href : 'https://m.cricbuzz.com' + href;
                      }
                  }
              });
          } catch (e) { /* Ignore directory failure, try next */ }
          if (targetUrl) break;
      }
  }

  // ==============================================================
  // 2. THE URL INTERCEPTOR (Forces Mobile Commentary Page)
  // ==============================================================
  if (targetUrl.includes('cricbuzz.com')) {
      targetUrl = targetUrl.replace('www.', 'm.').replace('/live-cricket-scorecard/', '/cricket-scores/');
  }

  let payload = {
        title: "YAHOO: Target Unknown", status: "YAHOO: Status Missing", match_state: "standby",
        live_score: "YAHOO: No Score", current_rr: "YAHOO: No CRR", required_rr: "YAHOO: No REQ",
        striker: "YAHOO: No Striker", non_striker: "YAHOO: No Non-Striker", bowler: "YAHOO: No Bowler",
        toss: "YAHOO: No Toss Data", venue: "YAHOO: Venue Hidden", last_over: ["Y", "A", "H", "O", "O", "!"],
        prediction: "YAHOO: AI Offline", source_url: targetUrl || "YAHOO: Match Link Not Found"
  };

  // If the Hunter failed to find a link, abort cleanly here.
  if (!targetUrl) {
      payload.status = "YAHOO: Match Not Found on Servers";
      payload.title = "UPLINK FAILED";
      return res.status(200).json({ success: true, match_info: payload }); // Returns 200 so UI doesn't crash
  }

  try {
    // ==============================================================
    // 3. BATTLEFIELD ASSESSMENT (Determine Timeline)
    // ==============================================================
    const response = await axios.get(targetUrl, { headers, timeout: 4500 });
    const $ = cheerio.load(response.data);
    const bodyText = $('body').text().replace(/\s+/g, ' ');
    const bodyLower = bodyText.toLowerCase();

    let cbTitle = $('title').text().split(',')[0];
    if (cbTitle) payload.title = cbTitle.trim();
    
    let venueMatch = bodyText.match(/Venue\s*:\s*([^•|{]+)/i);
    if (venueMatch) payload.venue = venueMatch[1].trim();

    let statusText = $('.cb-status-msg, .cb-text-complete, .ui-match-status').first().text().trim();
    if (statusText) payload.status = statusText;
    
    let state = "future";
    let statusLower = statusText.toLowerCase();

    // Determine exact match timeline
    if (statusLower.includes('won by') || statusLower.includes('tied') || statusLower.includes('abandoned')) {
        state = "completed";
    } else if (bodyLower.includes('crr:') || bodyLower.includes('req:') || $('.ui-bat-team-scores').length > 0) {
        state = "live";
    }

    payload.match_state = state;

    // ==============================================================
    // 4. TIMELINE-SPECIFIC SCRAPER ROUTING
    // ==============================================================

    // --- ROUTE A: COMPLETED MATCH ---
    if (state === "completed") {
        payload.live_score = $('.cb-font-20, .ui-bat-team-scores').first().text().trim() || "YAHOO: Final Score Missing";
        payload.toss = "Match Concluded";
        payload.striker = "N/A";
        payload.non_striker = "N/A";
        payload.bowler = "N/A";
        payload.last_over = ["E", "N", "D", "-", "-", "-"];
        let potm = bodyText.match(/player of the match\s*([^•]+)/i);
        payload.prediction = potm ? `POTM: ${potm[1].trim()}` : "YAHOO: POTM Hidden";
    } 
    
    // --- ROUTE B: LIVE MATCH ---
    else if (state === "live") {
        payload.live_score = $('.cb-font-20, .ui-bat-team-scores').first().text().trim() || "YAHOO: Score Hidden";
        
        let crrMatch = bodyText.match(/CRR:\s*([\d\.]+)/i);
        if (crrMatch) payload.current_rr = crrMatch[1];
        let reqMatch = bodyText.match(/REQ:\s*([\d\.]+)/i);
        if (reqMatch) payload.required_rr = reqMatch[1];

        let batsmen = [];
        $('.cb-min-inf').each((i, el) => {
            let text = $(el).text().trim();
            if (text && !text.includes('CRR')) batsmen.push(text);
        });
        if (batsmen[0]) payload.striker = batsmen[0];
        if (batsmen[1]) payload.non_striker = batsmen[1];

        let cbBowler = $('.cb-min-bowl-rw').find('a').first().text().trim();
        if (cbBowler) payload.bowler = cbBowler;

        let balls = [];
        $('.cb-min-rcnt span, .cb-rcnt-ovr span').each((i, el) => {
            let b = $(el).text().trim();
            if (b && b !== '|' && b.toLowerCase() !== 'recent:') balls.push(b);
        });
        if (balls.length > 0) payload.last_over = balls.slice(-6);

        // Fetch Toss from Match Facts page
        const factsUrl = targetUrl.replace('/cricket-scores/', '/cricket-match-facts/');
        try {
            const fRes = await axios.get(factsUrl, { headers, timeout: 3000 });
            let fText = cheerio.load(fRes.data)('body').text().replace(/\s+/g, ' ');
            let tossMatch = fText.match(/([A-Z][a-z]+\s[A-Za-z]+\swon the toss and (?:opted|elected|chose) to (?:bat|bowl) first)/i);
            if (tossMatch) payload.toss = tossMatch[1].trim();
        } catch(e) { payload.toss = "OH SORRY: Toss Page Blocked"; }

        if (payload.required_rr !== "YAHOO: No REQ") payload.prediction = "TRACKING CHASE PROBABILITY...";
        else if (payload.current_rr !== "YAHOO: No CRR") payload.prediction = `PROJECTED TARGET: ${Math.floor(parseFloat(payload.current_rr) * 20)} RUNS`;
    } 
    
    // --- ROUTE C: FUTURE MATCH ---
    else if (state === "future") {
        payload.live_score = "Match Not Started";
        payload.striker = "Waiting for Openers";
        payload.non_striker = "Waiting for Openers";
        payload.bowler = "Waiting for Bowler";
        payload.last_over = ["-", "-", "-", "-", "-", "-"];
        payload.prediction = "AWAITING START";
        
        let matchDate = bodyText.match(/Date\s*:\s*([^•|{]+)/i);
        if (matchDate) payload.status = `Starts: ${matchDate[1].trim()}`;

        let tossMatch = bodyText.match(/([A-Z][a-z]+\s[A-Za-z]+\swon the toss and (?:opted|elected|chose) to (?:bat|bowl) first)/i);
        if (tossMatch) {
            payload.toss = tossMatch[1].trim();
            payload.status = payload.toss;
        } else {
            payload.toss = "Awaiting Coin Drop";
        }
    }

    return res.status(200).json({ success: true, match_info: payload });

  } catch (err) {
    // ==============================================================
    // THE "OH SORRY" BLOCK (Triggers if Site Connection is Dead)
    // ==============================================================
    payload.status = "OH SORRY: Connection Blocked by Site";
    payload.live_score = "OH SORRY: Cannot Fetch";
    payload.striker = "OH SORRY";
    payload.non_striker = "OH SORRY";
    payload.bowler = "OH SORRY";
    payload.toss = "OH SORRY";
    payload.venue = "OH SORRY";
    payload.prediction = "OH SORRY: AI Offline";
    payload.last_over = ["O", "H", "S", "R", "R", "Y"];
    
    return res.status(200).json({ success: false, error: err.message, match_info: payload });
  }
};
