const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const targetUrl = req.query.url || "";
  const rawDateStr = req.query.time || "";

  // 1. MASTER LEDGER (Now used as the Emergency Backup)
  const ledger = [
    { id: "152141", teams: "PBKS vs MI", venue: "HPCA Stadium, Dharamsala" },
    { id: "152140", teams: "RCB vs KKR", venue: "Shaheed Veer Narayan Singh Stadium, Raipur" }
  ];

  let payload = {
    title: "IPL 2026",
    status: "Uplink Established",
    match_state: "standby",
    live_score: "Match Not Started",
    striker: "Awaiting Openers",
    bowler: "Awaiting Bowler",
    toss: "Awaiting Coin Drop",
    venue: "Scanning Stadium...", // Professional standby message
    last_over: ["-", "-", "-", "-", "-", "-"],
    countdown: null
  };

  const headers = { 'User-Agent': 'Mozilla/5.0 (Linux; Android 10)' };

  try {
    const cbRes = await axios.get(targetUrl, { headers, timeout: 4000 }).catch(() => null);
    
    if (cbRes) {
      const $ = cheerio.load(cbRes.data);
      let pageText = $('body').text().replace(/\s+/g, ' ');

      // A. THE VENUE HUNTER (Rips directly from the page)
      // Checks for "Venue: [Stadium Name]" or locations in the header
      let venueMatch = pageText.match(/Venue\s*:\s*([^•|{]+)/i);
      if (venueMatch) {
          payload.venue = venueMatch[1].trim();
      } else {
          // If scraping fails, check the Ledger
          let matchEntry = ledger.find(m => targetUrl.includes(m.id));
          if (matchEntry) payload.venue = matchEntry.venue;
          else payload.venue = "HPCA Stadium, Dharamsala"; // Logic: Today is PBKS vs MI
      }

      // B. DATA RECOVERY (Score, Toss, Status)
      payload.live_score = $('.cb-font-20').first().text() || payload.live_score;
      payload.status = $('.cb-text-complete, .cb-status-msg, .ui-match-status').first().text().trim() || "Standby";
      
      // Toss Extraction
      if (pageText.includes("won the toss")) {
          let tossText = pageText.match(/([A-Za-z\s]+won the toss[^•]+)/i);
          if (tossText) payload.toss = tossText[1].trim();
      }

      if (payload.status.toLowerCase().includes('won by')) payload.match_state = "completed";
    }

    // C. COUNTDOWN (Targeting 7:30 PM IST)
    if (rawDateStr && payload.match_state === "standby") {
        let now = new Date();
        let target = new Date(`${rawDateStr}, 2026 19:30:00 GMT+0530`);
        let diff = target - now;
        if (diff > 0) {
            let h = Math.floor(diff / 3600000);
            let m = Math.floor((diff % 3600000) / 60000);
            payload.countdown = `T-MINUS ${h}h ${m}m TO OPERATION`;
        } else { payload.countdown = "FIRST BALL DEPLOYING..."; }
    }

    return res.status(200).json({ success: true, match_info: payload });

  } catch (err) {
    return res.status(200).json({ success: false, error: "Link Error" });
  }
};
