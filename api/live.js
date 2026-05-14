const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async function (req, res) {
  // Setup CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const targetTeams = (req.query.teams || "").toLowerCase().trim();
    const rawDateStr = (req.query.time || "").toLowerCase().trim();

    if (!targetTeams) {
      return res.status(200).json({ success: false, error: "Awaiting Target Intel..." });
    }

    // 1. UPDATED MASTER LEDGER (Fixed Venues & Date Keys)
    const MASTER_LEDGER = {
      "may 11": { expected: ["punjab", "delhi"], venue: "HPCA Stadium, Dharamsala" },
      "may 12": { expected: ["gujarat", "sunrisers"], venue: "Narendra Modi Stadium, Ahmedabad" },
      "may 13": { expected: ["bengaluru", "kolkata", "rcb", "kkr"], venue: "Shaheed Veer Narayan Singh Stadium, Raipur" },
      "may 14": { expected: ["punjab", "mumbai"], venue: "HPCA Stadium, Dharamsala" },
      "may 15": { expected: ["lucknow", "chennai"], venue: "Ekana Stadium, Lucknow" },
      "may 16": { expected: ["kolkata", "gujarat"], venue: "Eden Gardens, Kolkata" },
      "may 17": { expected: ["punjab", "bengaluru", "delhi", "rajasthan"], venue: "Multiple Venues" },
      "may 18": { expected: ["chennai", "sunrisers"], venue: "MA Chidambaram Stadium, Chennai" },
      "may 19": { expected: ["rajasthan", "lucknow"], venue: "Sawai Mansingh Stadium, Jaipur" },
      "may 20": { expected: ["kolkata", "mumbai"], venue: "Eden Gardens, Kolkata" }
    };

    // Find the ledger entry
    let ledgerKey = "";
    for (let key of Object.keys(MASTER_LEDGER)) {
      if (rawDateStr.includes(key)) {
        ledgerKey = key;
        break;
      }
    }
    const mission = MASTER_LEDGER[ledgerKey] || { expected: [], venue: "Venue Secure" };

    const payload = {
      title: "IPL LIVE INTEL",
      status: "Uplink Established",
      match_state: "standby",
      live_score: "Intel Unavailable",
      toss: "Awaiting Coin Drop",
      venue: mission.venue,
      source_url: null,
      countdown: null,
      last_over: ["-", "-", "-", "-", "-", "-"]
    };

    // 2. SCRAPING ENGINE (Safe Call)
    try {
      const response = await axios.get('https://m.cricbuzz.com/cricket-match/live-scores/recent-matches', { timeout: 5000 });
      const $ = cheerio.load(response.data);
      let targetUrl = null;

      // Scan for the match link
      $('a').each((i, el) => {
        const href = $(el).attr('href') || "";
        const txt = $(el).text().toLowerCase();
        // Check if teams in the ledger are mentioned in the link text
        const matchFound = mission.expected.length > 0 && mission.expected.every(team => txt.includes(team));
        
        if (href.includes('/cricket-scores/') && matchFound) {
          targetUrl = 'https://m.cricbuzz.com' + href.replace('/cricket-scores/', '/live-cricket-scorecard/');
          return false;
        }
      });

      if (targetUrl) {
        payload.source_url = targetUrl;
        const scorecard = await axios.get(targetUrl, { timeout: 5000 });
        const $s = cheerio.load(scorecard.data);
        const pageTitle = $s('title').text().trim();

        if (pageTitle.toLowerCase().includes('won by')) {
          payload.status = pageTitle.split('|')[0].trim();
          payload.match_state = "completed";
          payload.title = "MISSION ACCOMPLISHED";
          payload.live_score = "Match Ended";
        } else {
          payload.status = $s('.cb-status-msg').first().text().trim() || "Live Tracking...";
        }
      }
    } catch (scrapeError) {
      console.error("Scrape failed, falling back to countdown only");
    }

    // 3. COUNTDOWN ENGINE (Safe Date Parsing)
    if (rawDateStr && payload.match_state !== "completed") {
      const dateMatch = rawDateStr.match(/may\s(\d+)/);
      if (dateMatch) {
        const day = parseInt(dateMatch[1]);
        const isEvening = rawDateStr.includes("7:30");
        const targetDate = new Date(2026, 4, day, isEvening ? 19 : 15, 30); // Month is 0-indexed (4 = May)
        const diffMs = targetDate.getTime() - (new Date().getTime() + 19800000); // Adjusting for IST

        if (diffMs > 0) {
          const h = Math.floor(diffMs / 3600000);
          const m = Math.floor((diffMs % 3600000) / 60000);
          payload.countdown = `T-MINUS ${h}h ${m}m TO OPERATION`;
          payload.match_state = "countdown";
          payload.status = "Pre-Match Standby";
        }
      }
    }

    return res.status(200).json({ success: true, match_info: payload });

  } catch (globalError) {
    // This prevents the 500 crash by returning the error as JSON
    return res.status(200).json({ 
      success: false, 
      error: "Internal Engine Error", 
      details: globalError.message 
    });
  }
};
