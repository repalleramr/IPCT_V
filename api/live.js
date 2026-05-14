const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const targetUrl = req.query.url || "";
  const teamsParam = (req.query.teams || "").toLowerCase();

  let payload = {
        title: "IPL LIVE INTEL",
        status: "Scanning Fields...",
        match_state: "standby",
        live_score: "Awaiting Data",
        striker: "-",
        bowler: "-",
        toss: "Awaiting Coin Drop",
        venue: "Detecting Venue...",
        last_over: [],
        source: "searching"
  };

  const headers = { 'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36' };

  try {
    // ==============================================================
    // SELLER 1: CRICBUZZ DIRECT (Scorecard + Match Facts)
    // ==============================================================
    if (targetUrl.includes('cricbuzz.com')) {
        const factsUrl = targetUrl.replace('/live-cricket-scorecard/', '/cricket-match-facts/');
        const [scRes, factsRes] = await Promise.allSettled([
            axios.get(targetUrl, { headers, timeout: 3000 }),
            axios.get(factsUrl, { headers, timeout: 3000 })
        ]);

        if (scRes.status === 'fulfilled') {
            const $ = cheerio.load(scRes.value.data);
            payload.live_score = $('.cb-font-20').first().text().trim() || payload.live_score;
            payload.venue = $('.cb-nav-subhdr').text().split(',')[1]?.trim() || payload.venue;
            
            // Extract Players
            $('.cb-min-inf').each((i, el) => { if (i === 0) payload.striker = $(el).text().trim(); });
            payload.bowler = $('.cb-min-bowl-rw').find('a').first().text().trim() || payload.bowler;
            
            // Extract Recent Over
            $('.cb-min-rcnt span').each((i, el) => {
                let b = $(el).text().trim();
                if (b && b !== '|') payload.last_over.push(b);
            });
            payload.last_over = payload.last_over.slice(-6);
            
            if (payload.live_score.match(/\d/)) {
                payload.match_state = "live";
                payload.source = "cricbuzz-live";
            }
        }

        if (factsRes.status === 'fulfilled') {
            const $f = cheerio.load(factsRes.value.data);
            let pageText = $f('body').text().replace(/\s+/g, ' ');
            let tossMatch = pageText.match(/([A-Z][a-z]+\s[A-Za-z]+\swon the toss and (?:opted|elected|chose) to (?:bat|bowl) first)/i);
            if (tossMatch) {
                payload.toss = tossMatch[1].trim();
                payload.status = payload.toss;
            }
        }
    }

    // ==============================================================
    // SELLER 2: ESPN CRICINFO API (Deep JSON Hunt)
    // ==============================================================
    if (payload.source === "searching" || payload.toss === "Awaiting Coin Drop") {
        const espn = await axios.get('https://hs-consumer-api.espncricinfo.com/v1/pages/matches/current', { headers, timeout: 3000 });
        const match = espn.data.matches.find(m => {
            const txt = (m.title + " " + m.teams.map(t => t.team.name).join(" ")).toLowerCase();
            return teamsParam ? teamsParam.split(' vs ').every(t => txt.includes(t.trim())) : true;
        });

        if (match) {
            if (match.status === "Live" || match.status === "In Progress") {
                payload.match_state = "live";
                payload.live_score = `${match.teams[0].score || '0/0'} (${match.teams[0].overs || '0'})`;
                payload.status = match.statusText;
                payload.source = "espn-api";
            }
            if (match.tossResults && match.tossResults.text) {
                payload.toss = match.tossResults.text;
                if (payload.match_state === "standby") payload.status = payload.toss;
            }
        }
    }

    // ==============================================================
    // SELLER 3: GOOGLE SPORTS/GENERIC REGEX (The "Last Ditch" Scrape)
    // ==============================================================
    if (payload.source === "searching") {
        // If everything else fails, we attempt to find ANY score pattern on the target page
        const backupRes = await axios.get(targetUrl, { headers, timeout: 3000 });
        const $b = cheerio.load(backupRes.data);
        const bodyText = $b('body').text();
        
        const scorePattern = bodyText.match(/\d+\/\d+\s\(\d+\.\d+\sOvers\)/);
        if (scorePattern) {
            payload.live_score = scorePattern[0];
            payload.match_state = "live";
            payload.source = "regex-fallback";
        }
    }

    // --- FINAL STATUS NORMALIZATION ---
    if (payload.match_state === "live") {
        payload.status = "LIVE TELEMETRY ACTIVE";
    }

    return res.status(200).json({ success: true, match_info: payload });

  } catch (err) {
    return res.status(200).json({ success: false, error: "Total Uplink Failure: " + err.message });
  }
};
