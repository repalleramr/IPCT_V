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

  const headers = { 
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Mobile/15E148 Safari/604.1',
    'Accept-Language': 'en-US,en;q=0.9'
  };

  try {
    // 1. DUAL-SITE EXTRACTION (Scorecard + Facts)
    const factsUrl = targetUrl.replace('/live-cricket-scorecard/', '/cricket-match-facts/');
    const [scRes, factsRes] = await Promise.allSettled([
        axios.get(targetUrl, { headers, timeout: 3500 }),
        axios.get(factsUrl, { headers, timeout: 3500 })
    ]);

    // 2. NUCLEAR TOSS SCAN (Check Facts first, then Scorecard)
    let combinedHtml = (factsRes.status === 'fulfilled' ? factsRes.value.data : "") + 
                       (scRes.status === 'fulfilled' ? scRes.value.data : "");
    
    if (combinedHtml) {
        const $ = cheerio.load(combinedHtml);
        let pageText = $('body').text().replace(/\s+/g, ' ');

        // FORCE SEARCH: Search for the toss pattern in raw text
        let tossMatch = pageText.match(/([A-Z][a-z]+\s[A-Za-z]+\swon the toss and[^•|!]+)/i);
        if (tossMatch) {
            payload.toss = tossMatch[1].trim();
            payload.status = payload.toss; // Injects toss into your Gold Status field
            payload.match_state = "pre-match";
        }

        // 3. SCORE & VENUE UPDATE
        let score = $('.cb-font-20').first().text().trim();
        if (score && /\d/.test(score)) {
            payload.live_score = score;
            payload.match_state = "live";
            payload.status = "LIVE: Dharamsala Operation";
        } else if (payload.match_state === "pre-match") {
            payload.live_score = "TOSS DECIDED";
        }
    }

    // 4. COUNTDOWN ENGINE (PBKS vs MI @ 7:30 PM)
    if (rawDateStr && payload.match_state !== "live") {
        let now = new Date();
        let target = new Date(`May 14, 2026 19:30:00 GMT+0530`);
        let diff = target - now;
        if (diff > 0) {
            let m = Math.floor(diff / 60000);
            payload.countdown = `T-MINUS ${m}m TO FIRST BALL`;
        } else { payload.countdown = "DEPLOYING NOW..."; }
    }

    return res.status(200).json({ success: true, match_info: payload });

  } catch (err) {
    return res.status(200).json({ success: false, error: "Satellite Sync Error" });
  }
};
