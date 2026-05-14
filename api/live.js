const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const targetUrl = req.query.url || "";
  const rawDateStr = req.query.time || "";

  // ==========================================
  // 1. THE MASTER LEDGER (Internal Database)
  // ==========================================
  const ledger = [
    { id: "152140", date: "May 13", teams: "RCB vs KKR", venue: "Raipur" },
    { id: "152141", date: "May 14", teams: "PBKS vs MI", venue: "Dharamsala" },
    { id: "152142", date: "May 15", teams: "LSG vs CSK", venue: "Lucknow" }
  ];

  // Auto-detect match from URL or Ledger
  let currentMatch = ledger.find(m => targetUrl.includes(m.id)) || { teams: "IPL 2026", venue: "India" };

  let payload = {
    title: currentMatch.teams,
    status: "Initializing Uplink...",
    match_state: "standby",
    live_score: "Awaiting Data",
    striker: "Scanning...",
    bowler: "Scanning...",
    toss: "Awaiting Coin Drop",
    venue: currentMatch.venue,
    last_over: ["-", "-", "-", "-", "-", "-"],
    countdown: null
  };

  const headers = { 'User-Agent': 'Mozilla/5.0 (Linux; Android 10)' };

  try {
    // ==========================================
    // 2. SOURCE 1: DIRECT CRICBUZZ SCRAPE
    // ==========================================
    const cbRes = await axios.get(targetUrl, { headers, timeout: 3500 }).catch(() => null);
    if (cbRes) {
      const $ = cheerio.load(cbRes.data);
      let rawBody = $('body').text();

      // Scrape Score
      payload.live_score = $('.cb-font-20').first().text() || payload.live_score;
      
      // Scrape Status/Toss
      let statusText = $('.cb-text-complete, .cb-status-msg').text().trim();
      if (statusText) payload.status = statusText;

      // Scrape Players
      $('.cb-min-inf').each((i, el) => {
        if (i === 0) payload.striker = $(el).text();
      });
      payload.bowler = $('.cb-min-bowl-rw').find('a').first().text() || payload.bowler;

      // Check Completion
      if (statusText.toLowerCase().includes('won by')) payload.match_state = "completed";
    }

    // ==========================================
    // 3. SOURCE 2: ESPN BACKUP (If Source 1 Fails)
    // ==========================================
    if (payload.match_state === "standby" && payload.live_score === "Awaiting Data") {
      const espn = await axios.get('https://hs-consumer-api.espncricinfo.com/v1/pages/matches/current', { headers, timeout: 3000 }).catch(() => null);
      if (espn && espn.data.matches) {
        const m = espn.data.matches.find(match => 
          currentMatch.teams.toLowerCase().includes(match.teams[0].team.abbreviation.toLowerCase())
        );
        if (m) {
          payload.status = m.statusText;
          payload.live_score = `${m.teams[0].score || '0/0'} v ${m.teams[1].score || ''}`;
          if (m.status === "Live") payload.match_state = "live";
          if (m.statusText.toLowerCase().includes('won')) payload.match_state = "completed";
        }
      }
    }

    // ==========================================
    // 4. COUNTDOWN ENGINE (From Ledger/Time)
    // ==========================================
    if (rawDateStr && payload.match_state === "standby") {
        let now = new Date();
        let target = new Date(`${rawDateStr}, 2026 19:30:00 GMT+0530`);
        let diff = target - now;
        if (diff > 0) {
            let h = Math.floor(diff / 3600000);
            let m = Math.floor((diff % 3600000) / 60000);
            payload.countdown = `T-MINUS ${h}h ${m}m TO OPERATION`;
        } else {
            payload.countdown = "DEPLOYING NOW...";
        }
    }

    // Final UI Polish
    if (payload.match_state === "completed") {
        payload.live_score = "Match Ended";
        payload.last_over = ["E", "N", "D", "E", "D", "!"];
    }

    return res.status(200).json({ success: true, match_info: payload });

  } catch (err) {
    return res.status(200).json({ success: false, error: "Network Jam" });
  }
};
