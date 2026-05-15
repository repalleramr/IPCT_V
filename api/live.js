const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  let targetUrl = req.query.url || "";
  
  if (targetUrl.includes('cricbuzz.com')) {
      targetUrl = targetUrl.replace('www.', 'm.').replace('/live-cricket-scorecard/', '/cricket-scores/');
  }

  // Base payload loaded with YAHOO fallbacks. 
  // If the scrapers find the data, these will be overwritten.
  let payload = {
        title: "YAHOO: Target Unknown",
        status: "YAHOO: Status Missing",
        match_state: "standby",
        live_score: "YAHOO: No Score",
        current_rr: "YAHOO: No CRR",
        required_rr: "YAHOO: No REQ",
        striker: "YAHOO: No Striker",
        non_striker: "YAHOO: No Non-Striker",
        bowler: "YAHOO: No Bowler",
        toss: "YAHOO: No Toss Data",
        venue: "YAHOO: Venue Hidden",
        last_over: ["Y", "A", "H", "O", "O", "!"],
        prediction: "YAHOO: AI Offline",
        source_url: targetUrl
  };

  const headers = { 'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36' };

  try {
    // ==============================================================
    // STEP 1: BATTLEFIELD ASSESSMENT (State Detection)
    // ==============================================================
    const response = await axios.get(targetUrl, { headers, timeout: 4500 });
    const $ = cheerio.load(response.data);
    const bodyText = $('body').text().replace(/\s+/g, ' ');
    const bodyLower = bodyText.toLowerCase();

    // Dynamically grab Title and Venue first
    let cbTitle = $('title').text().split(',')[0];
    if (cbTitle) payload.title = cbTitle.trim();
    
    let venueMatch = bodyText.match(/Venue\s*:\s*([^•|{]+)/i);
    if (venueMatch) payload.venue = venueMatch[1].trim();

    // Detect Timeline State
    let statusText = $('.cb-status-msg, .cb-text-complete, .ui-match-status').first().text().trim();
    if (statusText) payload.status = statusText;
    
    let state = "future";
    let statusLower = statusText.toLowerCase();

    if (statusLower.includes('won by') || statusLower.includes('tied') || statusLower.includes('abandoned')) {
        state = "completed";
    } else if (bodyLower.includes('crr:') || bodyLower.includes('req:') || $('.ui-bat-team-scores').length > 0) {
        state = "live";
    }

    payload.match_state = state;

    // ==============================================================
    // STEP 2: ROUTING TO SEPARATE SCRAPERS
    // ==============================================================

    // --------------------------------------------------
    // ROUTE A: MATCH COMPLETED
    // --------------------------------------------------
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
    
    // --------------------------------------------------
    // ROUTE B: MATCH LIVE (Currently Running)
    // --------------------------------------------------
    else if (state === "live") {
        payload.live_score = $('.cb-font-20, .ui-bat-team-scores').first().text().trim() || "YAHOO: Score Hidden";
        
        // Rates
        let crrMatch = bodyText.match(/CRR:\s*([\d\.]+)/i);
        if (crrMatch) payload.current_rr = crrMatch[1];
        let reqMatch = bodyText.match(/REQ:\s*([\d\.]+)/i);
        if (reqMatch) payload.required_rr = reqMatch[1];

        // Players
        let batsmen = [];
        $('.cb-min-inf').each((i, el) => {
            let text = $(el).text().trim();
            if (text && !text.includes('CRR')) batsmen.push(text);
        });
        if (batsmen[0]) payload.striker = batsmen[0];
        if (batsmen[1]) payload.non_striker = batsmen[1];

        let cbBowler = $('.cb-min-bowl-rw').find('a').first().text().trim();
        if (cbBowler) payload.bowler = cbBowler;

        // Ball by Ball
        let balls = [];
        $('.cb-min-rcnt span, .cb-rcnt-ovr span').each((i, el) => {
            let b = $(el).text().trim();
            if (b && b !== '|' && b.toLowerCase() !== 'recent:') balls.push(b);
        });
        if (balls.length > 0) {
            payload.last_over = balls.slice(-6);
        }

        // Deep Toss Extraction via Match Facts page
        const factsUrl = targetUrl.replace('/cricket-scores/', '/cricket-match-facts/');
        try {
            const fRes = await axios.get(factsUrl, { headers, timeout: 3000 });
            let fText = cheerio.load(fRes.data)('body').text().replace(/\s+/g, ' ');
            let tossMatch = fText.match(/([A-Z][a-z]+\s[A-Za-z]+\swon the toss and (?:opted|elected|chose) to (?:bat|bowl) first)/i);
            if (tossMatch) payload.toss = tossMatch[1].trim();
        } catch(e) { payload.toss = "OH SORRY: Toss Page Blocked"; }

        // AI Prediction Math
        if (payload.required_rr !== "YAHOO: No REQ") {
            payload.prediction = "TRACKING CHASE PROBABILITY...";
        } else if (payload.current_rr !== "YAHOO: No CRR") {
            let proj = Math.floor(parseFloat(payload.current_rr) * 20);
            payload.prediction = `PROJECTED TARGET: ${proj} RUNS`;
        }
    } 
    
    // --------------------------------------------------
    // ROUTE C: FUTURE MATCH (Upcoming)
    // --------------------------------------------------
    else if (state === "future") {
        payload.live_score = "Match Not Started";
        payload.striker = "Waiting for Openers";
        payload.non_striker = "Waiting for Openers";
        payload.bowler = "Waiting for Bowler";
        payload.last_over = ["-", "-", "-", "-", "-", "-"];
        payload.prediction = "AWAITING START";
        
        let matchDate = bodyText.match(/Date\s*:\s*([^•|{]+)/i);
        if (matchDate) payload.status = `Starts: ${matchDate[1].trim()}`;

        // Deep Toss check for pre-match window
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
    // THE "OH SORRY" BLOCK (Triggers if site completely blocks request)
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
