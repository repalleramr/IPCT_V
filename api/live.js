const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const targetUrl = req.query.url || "";
  const rawDateStr = req.query.time || "";

  let payload = {
    title: "PBKS vs MI",
    status: "Uplink Established",
    match_state: "standby",
    live_score: "Match Not Started",
    striker: "Awaiting Openers",
    bowler: "Awaiting Bowler",
    toss: "Awaiting Coin Drop",
    venue: "HPCA Stadium, Dharamsala", 
    last_over: ["-", "-", "-", "-", "-", "-"],
    countdown: null
  };

  const headers = { 'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36' };

  try {
    const cbRes = await axios.get(targetUrl, { headers, timeout: 4500 }).catch(() => null);
    
    if (cbRes) {
      const $ = cheerio.load(cbRes.data);
      
      // 1. IMPROVED TOSS HUNTER (2026 Layout)
      // We search all divs for the "won the toss" pattern
      $('div, span, p').each((i, el) => {
          let text = $(el).text().trim();
          if (text.toLowerCase().includes("won the toss") && text.length < 100) {
              payload.toss = text;
              payload.status = text; // Push toss result to the "Gold" text field in your UI
              payload.match_state = "pre-match";
          }
      });

      // 2. VENUE SCRAPER
      let venueInfo = $('.cb-nav-subhdr').text() || $('body').text();
      let venueMatch = venueInfo.match(/Venue\s*:\s*([^•|{]+)/i);
      if (venueMatch) payload.venue = venueMatch[1].trim();

      // 3. SCORE & STATE
      let score = $('.cb-font-20').first().text().trim();
      if (score && score.match(/\d/)) {
          payload.live_score = score;
          payload.match_state = "live";
      } else {
          // If match hasn't started, but toss is done, show this in the main box
          if (payload.match_state === "pre-match") {
              payload.live_score = "TOSS DECIDED";
          }
      }
    }

    // 4. COUNTDOWN (Target 7:30 PM)
    if (rawDateStr && payload.match_state !== "live") {
        let now = new Date();
        let target = new Date(`${rawDateStr}, 2026 19:30:00 GMT+0530`);
        let diff = target - now;
        if (diff > 0) {
            let h = Math.floor(diff / 3600000);
            let m = Math.floor((diff % 3600000) / 60000);
            payload.countdown = `T-MINUS ${h}h ${m}m TO OPERATION`;
        } else {
            payload.countdown = "FIRST BALL DEPLOYING...";
        }
    }

    return res.status(200).json({ success: true, match_info: payload });

  } catch (err) {
    return res.status(200).json({ success: false, error: "Sync Interrupted" });
  }
};
