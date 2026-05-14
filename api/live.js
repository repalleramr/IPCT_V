const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  let targetTeams = (req.query.teams || "").toLowerCase().trim();
  let rawDateStr = (req.query.time || "").toLowerCase(); 

  if (!targetTeams) return res.status(200).json({ success: false, error: "Awaiting Target Intel..." });

  // ==============================================================
  // 1. THE AUDITED MASTER LEDGER (MAY 11 - MAY 31)
  // FIXED: RCB vs KKR Venue (Raipur)
  // ==============================================================
  const MASTER_LEDGER = {
      "may 11": { id: "may 11", expected: ["punjab", "delhi"], venue: "HPCA Stadium, Dharamsala" },
      "may 12": { id: "may 12", expected: ["gujarat", "sunrisers"], venue: "Narendra Modi Stadium, Ahmedabad" },
      "may 13": { id: "may 13", expected: ["bengaluru", "kolkata", "rcb", "kkr"], venue: "Shaheed Veer Narayan Singh Stadium, Raipur" },
      "may 14": { id: "may 14", expected: ["punjab", "mumbai"], venue: "HPCA Stadium, Dharamsala" },
      "may 15": { id: "may 15", expected: ["lucknow", "chennai"], venue: "Ekana Stadium, Lucknow" },
      "may 16": { id: "may 16", expected: ["kolkata", "gujarat"], venue: "Eden Gardens, Kolkata" },
      "may 17 3:30": { id: "may 17", expected: ["punjab", "bengaluru"], venue: "HPCA Stadium, Dharamsala" },
      "may 17 7:30": { id: "may 17", expected: ["delhi", "rajasthan"], venue: "Arun Jaitley Stadium, Delhi" },
      "may 18": { id: "may 18", expected: ["chennai", "sunrisers"], venue: "MA Chidambaram Stadium, Chennai" },
      "may 19": { id: "may 19", expected: ["rajasthan", "lucknow"], venue: "Sawai Mansingh Stadium, Jaipur" },
      "may 20": { id: "may 20", expected: ["kolkata", "mumbai"], venue: "Eden Gardens, Kolkata" },
      "may 21": { id: "may 21", expected: ["gujarat", "chennai"], venue: "Narendra Modi Stadium, Ahmedabad" },
      "may 22": { id: "may 22", expected: ["sunrisers", "bengaluru"], venue: "Rajiv Gandhi Stadium, Hyderabad" },
      "may 23": { id: "may 23", expected: ["lucknow", "punjab"], venue: "Ekana Stadium, Lucknow" },
      "may 24 3:30": { id: "may 24", expected: ["mumbai", "rajasthan"], venue: "Wankhede Stadium, Mumbai" },
      "may 24 7:30": { id: "may 24", expected: ["kolkata", "delhi"], venue: "Eden Gardens, Kolkata" },
      "may 26": { id: "may 26", expected: ["qualifier 1"], venue: "Narendra Modi Stadium, Ahmedabad" },
      "may 27": { id: "may 27", expected: ["eliminator"], venue: "Narendra Modi Stadium, Ahmedabad" },
      "may 29": { id: "may 29", expected: ["qualifier 2"], venue: "MA Chidambaram Stadium, Chennai" },
      "may 31": { id: "may 31", expected: ["final"], venue: "MA Chidambaram Stadium, Chennai" }
  };

  // Find Match in Ledger
  let ledgerKey = "";
  Object.keys(MASTER_LEDGER).forEach(key => {
      if (requestTime.includes(key.split(' ')[0] + " " + key.split(' ')[1])) {
          if (key.includes("3:30") && requestTime.includes("3:30")) ledgerKey = key;
          else if (key.includes("7:30") && requestTime.includes("7:30")) ledgerKey = key;
          else if (!key.includes(":")) ledgerKey = key;
      }
  });
  let mission = MASTER_LEDGER[ledgerKey] || { id: "", expected: [], venue: "Location Secure" };

  // Team Matching Logic
  const teamAliases = {
    "chennai": ["csk", "chennai"], "delhi": ["dc", "delhi"], "gujarat": ["gt", "gujarat"],
    "kolkata": ["kkr", "kolkata"], "lucknow": ["lsg", "lucknow"], "mumbai": ["mi", "mumbai"],
    "punjab": ["pbks", "punjab"], "rajasthan": ["rr", "rajasthan"], "sunrisers": ["srh", "sunrisers"],
    "royal": ["rcb", "bengaluru", "royal challengers"]
  };
  let t1 = targetTeams.split(' vs ')[0]?.trim().split(' ')[0] || "";
  let t2 = targetTeams.split(' vs ')[1]?.trim().split(' ')[0] || "";
  const tA = [...(teamAliases[t1] || []), ...(teamAliases[t2] || []), ...(mission.expected || [])];

  let payload = {
        title: "IPL LIVE INTEL", status: null, match_state: "standby", live_score: "Intel Unavailable",
        toss: "Awaiting Coin Drop", venue: mission.venue, source_url: null, countdown: null, last_over: ["-","-","-","-","-","-"]
  };

  try {
    const { data: cbHtml } = await axios.get('https://m.cricbuzz.com/cricket-match/live-scores/recent-matches', { timeout: 4000 });
    const $ = cheerio.load(cbHtml);
    let targetUrl = null;

    $('a').each((i, el) => {
        let href = $(el).attr('href') || "";
        let txt = $(el).text().toLowerCase();
        if (href.includes('/cricket-scores/') && tA.some(a => txt.includes(a))) {
            targetUrl = 'https://m.cricbuzz.com' + href.replace('/cricket-scores/', '/live-cricket-scorecard/');
            return false;
        }
    });

    if (targetUrl) {
        payload.source_url = targetUrl;
        const { data: scoreHtml } = await axios.get(targetUrl, { timeout: 4000 });
        const $s = cheerio.load(scoreHtml);
        
        let title = $s('title').text().replace(/^[0-9]+/, '').trim();
        if (title.toLowerCase().includes('won by')) {
            payload.status = title.split('|')[0].trim();
            payload.match_state = "completed";
            payload.title = "MISSION ACCOMPLISHED";
            payload.live_score = "Match Ended";
        } else {
            payload.status = $s('.cb-status-msg, .ui-match-status').first().text().trim() || "Uplink Established";
        }
    }

    // Countdown Logic (IST)
    if (rawDateStr && payload.match_state !== "completed") {
        let day = parseInt(rawDateStr.split(' ')[1]);
        let hrs = rawDateStr.includes("7:30") ? 19 : 15;
        let mins = 30;
        let targetDate = new Date(`May ${day}, 2026 ${hrs}:${mins}:00 GMT+0530`);
        let diffMs = targetDate - new Date();
        
        if (diffMs > 0) {
            let totalHrs = Math.floor(diffMs / 3600000);
            let d = Math.floor(totalHrs / 24);
            let h = totalHrs % 24;
            let m = Math.floor((diffMs % 3600000) / 60000);
            payload.countdown = `T-MINUS ${d > 0 ? d + 'd ' : ''}${h}h ${m}m TO OPERATION`;
            payload.match_state = "countdown";
            payload.live_score = "Awaiting Deployment";
            payload.status = "Pre-Match Standby";
        }
    }

    return res.status(200).json({ success: true, match_info: payload });
  } catch (err) {
    return res.status(200).json({ success: false, error: err.message });
  }
};
