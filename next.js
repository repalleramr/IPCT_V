import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

// Force Vercel Edge Runtime for lowest latency
export const runtime = 'edge';
// Aggressive anti-caching for Next.js
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(req) {
  // CORS Preflight headers are handled natively in Next.js middleware or config, 
  // but we can enforce strict no-cache headers on the response.
  const responseHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
  };

  // Next.js URL parameter parsing
  const { searchParams } = new URL(req.url);
  let targetUrl = searchParams.get('url') || "";
  let targetTeams = (searchParams.get('teams') || "").toLowerCase().trim();
  let rawDateStr = searchParams.get('time') || "";
  let targetDate = rawDateStr.split('(')[0].trim().toLowerCase();
  let userPosition = (searchParams.get('position') || "NONE").toUpperCase().trim();

  const fetchHeaders = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 13; SM-G991U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
  };

  let payload = {
    title: "TARGET UNKNOWN", status: "Scanning Fields...", match_state: "standby", winner: "PENDING",
    live_score: "NO SCORE", current_rr: "NO CRR", required_rr: "NO REQ",
    striker: "NO STRIKER", non_striker: "NO NON-STRIKER", bowler: "NO BOWLER",
    toss: "NO TOSS DATA", venue: "VENUE HIDDEN", last_over: ["-", "-", "-", "-", "-", "-"],
    prediction: "AI OFFLINE", match_prediction: "", source_url: "Hunting...", fetch_code: "OH"
  };

  let pageTitle = ""; let bodyText = ""; let espnMatchData = null; let $ = null;

  // --- ALIASES AND VENUES (Condensed for space, keep your original arrays here) ---
  const teamAliases = { "chennai": ["csk", "chennai", "super kings"], "lucknow": ["lsg"], "mumbai": ["mi"], "punjab": ["pbks"], "delhi": ["dc"], "gujarat": ["gt"], "kolkata": ["kkr"], "rajasthan": ["rr"], "royal": ["rcb", "bengaluru"], "sunrisers": ["srh"] };
  const venueProfiles = { "wankhede": { type: "Batting Paradise", par: 195 }, "chidambaram": { type: "Spin/Slow", par: 165 } };
  const homeVenues = { "csk": "M.A. Chidambaram Stadium, Chennai", "mi": "Wankhede Stadium, Mumbai" };
  
  function escapeRegExp(str) { return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  // (Keep your extractCrexTrueOdds function here exactly as it was)
  function extractCrexTrueOdds(text) { return null; /* Add back your logic */ }

  let t1 = targetTeams.split(' vs ')[0]?.trim().split(' ')[0] || "unknown";
  let t2 = targetTeams.split(' vs ')[1]?.trim().split(' ')[0] || "unknown";
  const t1A = teamAliases[t1] || [t1]; const t2A = teamAliases[t2] || [t2];

  function matchesTeams(txt) {
    if (!txt) return false;
    return t1A.some(a => txt.includes(a)) && t2A.some(a => txt.includes(a));
  }

  try {
    let htmlAcquired = false; let timestampBuster = Date.now();

    // 1. CREX FETCH (Replacing Axios)
    if (!htmlAcquired) {
      try {
        let crexUrl = (targetUrl.includes('crex.com') || targetUrl.includes('crex.live')) ? targetUrl : "";
        if (!crexUrl && targetTeams) {
          const cxRes = await fetch(`https://crex.com/fixtures/match-list?_t=${timestampBuster}`, { headers: fetchHeaders, cache: 'no-store', signal: AbortSignal.timeout(2500) });
          const cxData = await cxRes.text();
          const $temp = cheerio.load(cxData);
          $temp('a').each((i, el) => {
            let txt = $temp(el).text().toLowerCase(); let href = $temp(el).attr('href') || "";
            if (txt.includes('ipl') && href.includes('score') && matchesTeams(txt + " " + href)) {
              crexUrl = href.startsWith('http') ? href : 'https://crex.com' + href;
            }
          });
        }
        if (crexUrl) {
          let fetchUrl = crexUrl.includes('?') ? `${crexUrl}&_t=${timestampBuster}` : `${crexUrl}?_t=${timestampBuster}`;
          const cRes = await fetch(fetchUrl, { headers: fetchHeaders, cache: 'no-store', signal: AbortSignal.timeout(3000) });
          const cData = await cRes.text();
          $ = cheerio.load(cData); $('script, style, noscript').remove();
          pageTitle = $('title').text() || ""; 
          bodyText = ($('body').html() || "").replace(/&nbsp;/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          payload.source_url = "CREX (Tier 1 Speed)"; htmlAcquired = true;
        }
      } catch (e) { }
    }

    // 2. CRICBUZZ FETCH (Replacing Axios)
    if (!htmlAcquired) {
      try {
        let cbUrl = targetUrl.includes('cricbuzz') ? targetUrl.replace('www.cricbuzz.com', 'm.cricbuzz.com') : "";
        if (cbUrl) {
          cbUrl = cbUrl.replace('www.', 'm.').replace('/live-cricket-scorecard/', '/cricket-scores/');
          let fetchUrl = cbUrl.includes('?') ? `${cbUrl}&_t=${timestampBuster}` : `${cbUrl}?_t=${timestampBuster}`;
          const cbRes = await fetch(fetchUrl, { headers: fetchHeaders, cache: 'no-store', signal: AbortSignal.timeout(3500) });
          const cbData = await cbRes.text();
          $ = cheerio.load(cbData); $('script, style, noscript').remove();
          pageTitle = $('title').text() || ""; 
          bodyText = ($('body').html() || "").replace(/&nbsp;/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          payload.source_url = "CRICBUZZ (Tier 2 Failsafe)"; htmlAcquired = true;
        }
      } catch (e) { }
    }

    payload.fetch_code = htmlAcquired ? "UREKHA" : "OH";

    if (!htmlAcquired) {
      payload.status = "UPLINK FAILED"; payload.title = "UPLINK FAILED";
      return NextResponse.json({ success: true, match_info: payload }, { headers: responseHeaders });
    }

    // ... [KEEP YOUR EXISTING PARSING LOGIC HERE FOR TITLE, TOSS, SCORE, BATTERS, LAST OVER] ...
    // (Title, Toss, and standard extraction stays exactly the same as your code)
    
    // Hardcoding a mock for brevity in this snippet. Ensure your extraction blocks remain here.
    payload.live_score = "CSK 145/3 (15.2)"; 
    payload.last_over = ["1", "4", "W", "0", "6", "1"]; 

    // ==========================================================
    // [TARGET #13] UPGRADED: AI MOMENTUM & DYNAMIC MARKET SNIPER
    // ==========================================================
    if (payload.match_state === "live") {
      try {
        if (payload.live_score.includes('/')) {
          let scoreMatchClean = payload.live_score.match(/(\d+)[\/\-](\d+)\s*\(?([\d\.]+)\)?/);
          let batTeam = payload.live_score.split(' ')[0] || "Batting Team";

          if (scoreMatchClean) {
            let runs = parseInt(scoreMatchClean[1]); 
            let wkts = parseInt(scoreMatchClean[2]);
            let oversSplit = scoreMatchClean[3].split('.');
            let overs = parseInt(oversSplit[0]); 
            let balls = oversSplit[1] ? parseInt(oversSplit[1]) : 0;
            let totalBalls = (overs * 6) + balls;

            // --- AI MOMENTUM CALCULATOR (EXPONENTIAL DECAY) ---
            let momentumScore = 0;
            let totalWeight = 0;
            let dotBalls = 0;

            payload.last_over.forEach((ball, index) => {
              let weight = Math.pow(1.3, index); // Newer balls get heavier weight
              totalWeight += weight;

              let ballImpact = 0;
              if (ball === 'W') { ballImpact = -15; } 
              else if (ball === 'Wd' || ball === 'Nb') { ballImpact = 1.5; } 
              else if (!isNaN(parseInt(ball))) {
                let val = parseInt(ball);
                if (val === 0) { dotBalls++; ballImpact = -2.5; } 
                else if (val === 4) { ballImpact = 8; } 
                else if (val === 6) { ballImpact = 14; } 
                else { ballImpact = val; }
              }
              momentumScore += (ballImpact * weight);
            });

            let aiMomentumIndex = totalWeight > 0 ? (momentumScore / totalWeight) : 0;

            let crr = parseFloat(payload.current_rr) || 8.5;
            let isChase = (payload.required_rr && !payload.required_rr.includes("REQ"));
            let rrrVal = isChase ? parseFloat(payload.required_rr) : 0;

            // --- AI WIN PROBABILITY ENGINE ---
            let batWinProb = 50;
            let ballsRemaining = 120 - totalBalls;

            if (isChase) {
              if (totalBalls === 0) { batWinProb = 50; }
              else {
                let baseProb = 50; 
                let rrDiff = crr - rrrVal;
                
                if (rrrVal > 10.5) baseProb -= (rrrVal - 10.5) * 8;
                else if (rrrVal < 8.5) baseProb += (8.5 - rrrVal) * 5;

                baseProb += (((totalBalls / 120) * 10) - wkts) * 3.5;
                baseProb += (rrDiff > 0) ? (rrDiff * 3) : (rrDiff * 5);
                baseProb += (aiMomentumIndex * 2.5); // AI Injection

                batWinProb = Math.max(5, Math.min(95, baseProb));
              }
            } else {
              if (totalBalls !== 0) {
                let projected = runs + ((ballsRemaining / 6) * (crr + (aiMomentumIndex * 0.5)));
                let baseProb = 50 + ((projected - 175) * 0.8) - (wkts * 3) + (aiMomentumIndex * 2.0);
                batWinProb = Math.max(5, Math.min(95, baseProb));
              }
            }

            // --- ODDS AND TACTIC GENERATION ---
            let maxProb = Math.max(batWinProb, 100 - batWinProb);
            if (maxProb > 55 && maxProb < 90) maxProb = 50 + ((maxProb - 50) * 0.75);

            let favPaise = Math.max(1, Math.round(((100 - maxProb) / maxProb) * 100));
            let layPaise = favPaise + 2;
            let favTeam = batWinProb > 50 ? batTeam : "Bowling Team";

            let matchupState = aiMomentumIndex < -1.5 ? "BOWLER_DOMINATING" : (aiMomentumIndex > 2.5 ? "BATTER_DOMINATING" : "NEUTRAL");

            let matchTactic = `[AI LIVE ODDS] ${favTeam} is Fav at ${favPaise}-${layPaise}\nWin Prob: ${maxProb.toFixed(0)}% | Momentum Idx: ${aiMomentumIndex.toFixed(2)} | Action: `;

            if (maxProb >= 95 || favPaise <= 5) {
                matchTactic += `🟢 BOOK SET. Market dead.`;
            } else if (favTeam === batTeam) {
                matchTactic += (aiMomentumIndex > 1.5 && wkts <= 4) ? `🟢 PLAY (Back) ${favTeam}.` : (aiMomentumIndex < -1.0 ? `🔴 EAT (Lay) ${favTeam}.` : `🟡 HOLD.`);
            } else {
                matchTactic += (aiMomentumIndex < -1.0) ? `🟢 PLAY (Back) ${favTeam}.` : (aiMomentumIndex > 2.0 ? `🔴 EAT (Lay) ${favTeam}.` : `🟡 SCALP ENTRY.`);
            }

            payload.match_prediction = matchTactic;
          }
        }
      } catch (e) { payload.match_prediction = "Core Error: " + e.message; }
    }

    return NextResponse.json({ success: true, match_info: payload }, { headers: responseHeaders });

  } catch (err) {
    payload.status = "FIREWALL BLOCKED CONNECTION";
    return NextResponse.json({ success: false, error: err.message, match_info: payload }, { headers: responseHeaders, status: 500 });
  }
}
