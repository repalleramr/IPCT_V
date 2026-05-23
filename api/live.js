const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async function (req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'OPTIONS') return res.status(200).end();

    let targetUrl = req.query.url || "https://crex.com/cricket-live-score/lsg-vs-pbks-68th-match-indian-premier-league-2026-match-updates-119A";
    
    let payload = {
        title: "LIVE MATCH", status: "Active", match_state: "live",
        batter_1: "Waiting...", batter_2: "Waiting...", bowler: "Waiting...",
        live_score: "N/A", current_rr: "0.0", toss: "Pending", venue: "TBD",
        prediction: "AI STANDBY", match_prediction: "Awaiting Market", fetch_code: "UREKHA"
    };

    try {
        const { data } = await axios.get(targetUrl, { 
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' } 
        });
        const $ = cheerio.load(data);

        // 1. Extract Batters (Top to Bottom order)
        let batters = [];
        $('.batter-name, .sc-font-bold').each((i, el) => {
            let name = $(el).text().trim();
            if (name.length > 2) batters.push(name);
        });

        // 2. Identify active striker via CSS class
        let activeIndex = -1;
        // Looking for the class Crex uses to highlight the active player
        $('.active-striker, .is-striker, .current-striker').each((i, el) => {
             // Find which index in the batter array this matches
             let activeName = $(el).text().trim();
             batters.forEach((b, idx) => { if(b.includes(activeName)) activeIndex = idx; });
        });

        // 3. Assign to slots (Locking them so they don't swap)
        let b1 = batters[0] || "Unknown";
        let b2 = batters[1] || "Unknown";

        if (activeIndex === 0) {
            payload.batter_1 = b1 + " 🏏";
            payload.batter_2 = b2;
        } else if (activeIndex === 1) {
            payload.batter_1 = b1;
            payload.batter_2 = b2 + " 🏏";
        } else {
            payload.batter_1 = b1;
            payload.batter_2 = b2;
        }

        // 4. Bowler
        payload.bowler = $('.bowler-name').first().text().trim() || "Active Bowler";

        // 5. Market Odds Extraction
        let oddsMatch = $('body').text().match(/([A-Z]{2,3})\s+(\d{2})\s+(\d{2})/i);
        if (oddsMatch) {
            payload.match_prediction = `[LIVE ODDS] ${oddsMatch[1]} BACK ${oddsMatch[2]} / LAY ${oddsMatch[3]} | Follow the spread.`;
        } else {
            payload.match_prediction = "[AWAITING MARKET ODDS]";
        }

        payload.live_score = $('.current-score').text() || "Live";
        payload.venue = $('.venue-name').text() || "Lucknow";

        return res.status(200).json({ success: true, match_info: payload });

    } catch (error) {
        return res.status(200).json({ success: false, error: error.message });
    }
};
