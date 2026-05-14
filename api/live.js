const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  let targetUrl = req.query.url || "";
  let rawDateStr = req.query.time || ""; 

  if (!targetUrl) return res.status(200).json({ success: false, error: "Awaiting Direct URL Intel..." });

  // 1. THE "NO-NULL" TACTICAL PAYLOAD
  let payload = {
        title: "IPL LIVE INTEL",
        status: "Uplink Established",
        match_state: "standby",
        live_score: "Match Not Started",
        overs: "0.0",
        target: "First Innings Setup",
        required_rr: "-",
        current_rr: "0.00",
        striker: "Awaiting Openers",
        non_striker: "Awaiting Openers",
        bowler: "Awaiting Opening Bowler",
        toss: "Awaiting Coin Drop",
        result: "Awaiting Result",
        venue: "Location Secure",
        last_ball: "Match Not Started",
        last_over: ["-", "-", "-", "-", "-", "-"],
        prediction: "Tracking...",
        countdown: null,
        source: "direct-uplink",
        source_url: targetUrl
  };

  const headers = { 'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36' };

  try {
    let fetchUrl = targetUrl;
    if (fetchUrl.includes('cricbuzz.com') && fetchUrl.includes('/cricket-scores/')) {
        fetchUrl = fetchUrl.replace('/cricket-scores/', '/live-cricket-scorecard/');
    }

    // ==============================================================
    // 2. THE DIRECT SCALPEL SCRAPER 
    // ==============================================================
    const [scRes, factsRes] = await Promise.allSettled([
        axios.get(fetchUrl, { headers, timeout: 4000 }),
        axios.get(fetchUrl.replace('/live-cricket-scorecard/', '/cricket-match-facts/'), { headers, timeout: 4000 })
    ]);

    if (factsRes.status === 'fulfilled') {
        const $f = cheerio.load(factsRes.value.data);
        $f('div, span, p').each((i, el) => {
            let text = $f(el).text().trim().replace(/\s+/g, ' ');
            if (text.match(/^Venue\s*:/i) && payload.venue === "Location Secure") {
                payload.venue = text.split(/Venue\s*:/i)[1].split(/•|Date|{/)[0].trim();
            }
            if (text.match(/^Toss\s*:/i) && payload.toss === "Awaiting Coin Drop") {
                payload.toss = text.split(/Toss\s*:/i)[1].split(/•|Date|Time|{/)[0].trim();
            }
        });
    }

    if (scRes.status === 'fulfilled') {
        const $m = cheerio.load(scRes.value.data);
        let rawBody = $m('body').text().replace(/\s+/g, ' ');

        let pageTitle = $m('title').text() || "";
        let titleStatus = "";
        pageTitle.split('|')[0].split('-').forEach(part => {
            if (part.toLowerCase().includes('won by') || part.toLowerCase().includes('tied')) {
                titleStatus = part.replace(/^[0-9]+/, '').trim();
            }
        });
        
        if (titleStatus) {
            payload.status = titleStatus;
            payload.match_state = "completed";
        } else if ($m('.cb-text-complete').length > 0) {
            payload.status = $m('.cb-text-complete').first().text().trim();
            payload.match_state = "completed";
        } else {
            payload.status = $m('.ui-match-status, .cb-status-msg').first().text().trim() || "Pre-Match Standby";
        }

        let scores = [];
        $m('.ui-bat-team-scores, .cb-min-bat-rw, .cb-font-20').each((i, el) => {
            let s = $m(el).text().trim();
            if (s.match(/\d+\/\d+/) && !scores.includes(s)) scores.push(s);
        });
        if (scores.length > 0) payload.live_score = scores.join(' v ');

        let crrMatch = rawBody.match(/CRR:\s*([\d\.]+)/i);
        if (crrMatch) payload.current_rr = crrMatch[1];
        let reqMatch = rawBody.match(/REQ:\s*([\d\.]+)/i);
        if (reqMatch) payload.required_rr = reqMatch[1];

        $m('.cb-min-inf.cb-text-link').each((i, el) => {
            let pName = $m(el).text().trim();
            if (i === 0 && pName) payload.striker = pName;
            if (i === 1 && pName) payload.non_striker = pName;
        });
        
        $m('.cb-min-bowl-rw .cb-text-link').each((i, el) => {
            let bName = $m(el).text().trim();
            if (i === 0 && bName) payload.bowler = bName;
        });

        let recentBalls = [];
        $m('.cb-min-rcnt span').each((i, el) => {
            let ballText = $m(el).text().trim();
            if (ballText && ballText !== '|') recentBalls.push(ballText);
        });
        if (recentBalls.length > 0) {
            payload.last_over = recentBalls.slice(-6);
        }
    }

    // ==============================================================
    // 3. THE 30-MINUTE TOSS PROTOCOL & FIREWALL
    // ==============================================================
    let lowerStatus = (payload.status || "").toLowerCase();
    let isCompleted = lowerStatus.includes('won by') || lowerStatus.includes('tied');

    if (lowerStatus.includes('abandoned')) payload.match_state = "abandoned"; 
    else if (lowerStatus.includes('delay') || lowerStatus.includes('rain')) payload.match_state = "delay"; 
    else if (isCompleted) payload.match_state = "completed"; 
    else if (payload.live_score !== "Match Not Started") payload.match_state = "live";

    let isTossComplete = payload.toss !== "Awaiting Coin Drop" && payload.toss.length > 5;
    if (payload.match_state === "standby" && isTossComplete) {
        payload.match_state = "pre-match";
        payload.status = payload.toss; 
    }

    if (payload.match_state === "completed") {
        payload.title = "MISSION ACCOMPLISHED";
        payload.result = payload.status; 
        payload.live_score = "Match Ended"; 
        payload.last_over = ["E", "N", "D", "E", "D", "!"];
        payload.striker = "-"; 
        payload.bowler = "Mission Concluded";
    }

    // ==============================================================
    // 4. DEEP-TIME COUNTDOWN ENGINE (AUTO-DEFAULT TO 7:30 PM)
    // ==============================================================
    if (rawDateStr && (payload.match_state === "standby" || payload.match_state === "pre-match" || payload.match_state === "delay")) {
        try {
            let monthStr = rawDateStr.split(' ')[0].trim(); 
            let dayStr = parseInt(rawDateStr.split(' ')[1]).toString(); 
            
            // AUTO-DEFAULT: Assume 7:30 PM if not specified
            let timeStr = "7:30 PM"; 
            let timeMatch = rawDateStr.match(/\((.*?)\)/);
            if (timeMatch) timeStr = timeMatch[1]; 
            else if (rawDateStr.includes("3:30")) timeStr = "3:30 PM";

            let isPM = timeStr.toUpperCase().includes("PM");
            let timeParts = timeStr.replace(/[a-zA-Z\s]/g, '').split(':');
            let hours = parseInt(timeParts[0]);
            if (isPM && hours !== 12) hours += 12;
            if (!isPM && hours === 12) hours = 0;
            let mins = parseInt(timeParts[1] || 0);
            
            let targetDate = new Date(`${monthStr} ${dayStr}, 2026 ${hours}:${mins}:00 GMT+0530`);
            let now = new Date(); 
            let diffMs = targetDate.getTime() - now.getTime();
            
            if (diffMs > 0) { 
                let totalMins = Math.floor(diffMs / 60000);
                let m = totalMins % 60;
                let totalHrs = Math.floor(totalMins / 60);
                let h = totalHrs % 24;
                let totalDays = Math.floor(totalHrs / 24);
                let d = totalDays % 7;
                let w = Math.floor(totalDays / 7);

                let cdStr = "T-MINUS ";
                if (w > 0) cdStr += `${w}w `;
                if (d > 0 || w > 0) cdStr += `${d}d `;
                cdStr += `${h}h ${m}m TO OPERATION`;

                if (payload.match_state === "pre-match" && totalHrs === 0) {
                    payload.countdown = `T-MINUS ${m}m TO FIRST BALL`;
                } else {
                    payload.countdown = cdStr;
                }
            } else if (diffMs <= 0 && payload.match_state !== "live" && payload.match_state !== "completed") {
                payload.countdown = "DEPLOYING NOW...";
            }
        } catch(e) {}
    }

    return res.status(200).json({ success: true, match_info: payload });

  } catch (err) {
    return res.status(200).json({ success: false, error: err.message });
  }
};
