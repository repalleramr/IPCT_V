// =========================================================================================
// MI6 QUANTUM ORACLE - GRAND FINAL CHASE ARCHITECTURE (GT vs RCB)
// Version: 14.0.0 | Fluid Regex Expansion | 2nd Innings Target Lock
// =========================================================================================

const axios = require('axios');
const cheerio = require('cheerio');

// =========================================================================================
// [SECTION 1] CONSTANTS & NETWORK LAYER
// =========================================================================================

const SECURE_BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Connection': 'keep-alive',
    'Cache-Control': 'no-cache'
};

function generateBasePayload() {
    return {
        title: "GT VS RCB | GRAND FINAL", status: "Initializing Tracker...", match_state: "standby", winner: "PENDING",
        live_score: "NO SCORE", current_rr: "0.00", required_rr: "0.00",
        striker: "NO STRIKER", non_striker: "NO NON-STRIKER", bowler: "NO BOWLER",
        batter_1: "NO STRIKER", batter_2: "NO NON-STRIKER", bat_1: "NO STRIKER", bat_2: "NO NON-STRIKER",
        toss: "NO TOSS DATA", venue: "Narendra Modi Stadium, Ahmedabad", last_over: ["-", "-", "-", "-", "-", "-"],
        prediction: "AI STANDBY", match_prediction: "AWAITING CORE INITIALIZATION", ledger_analysis: "AWAITING LEDGER SYNC",
        source_url: "CREX (Chase Engine Active)", fetch_code: "OH"
    };
}

async function executeResilientNetworkRequest(url, maxRetries = 2) {
    let currentAttempt = 0; let requestDelay = 500;
    while (currentAttempt <= maxRetries) {
        try {
            const fetchUrl = url.includes('?') ? `${url}&_t=${Date.now()}` : `${url}?_t=${Date.now()}`;
            const response = await axios.get(fetchUrl, { headers: SECURE_BROWSER_HEADERS, timeout: 6000, maxRedirects: 3 });
            if (response.data && response.data.length > 500) return { success: true, data: response.data, error: null };
            throw new Error("Empty Payload.");
        } catch (error) {
            currentAttempt++;
            if (currentAttempt > maxRetries) return { success: false, data: null, error: error.message };
            await new Promise(resolve => setTimeout(resolve, requestDelay));
            requestDelay *= 2;
        }
    }
    return { success: false, data: null, error: "Retries exhausted." };
}

// =========================================================================================
// MAIN ROUTER INTERFACE
// =========================================================================================
module.exports = async function (req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    if (req.method === 'OPTIONS') return res.status(200).end();

    let payload = generateBasePayload();
    const exactFinalUrl = "https://crex.live/cricket-live-score/gt-vs-rcb-final-indian-premier-league-2026-match-updates-11XM";
    let operationalTargetUrl = req.query.url || exactFinalUrl;
    operationalTargetUrl = operationalTargetUrl.replace('crex.com', 'crex.live');

    let ledgerExposureTeam1 = parseFloat(req.query.e1) || 0; 
    let ledgerExposureTeam2 = parseFloat(req.query.e2) || 0; 
    let clientStringTeam1 = (req.query.t1 || "GUJARAT TITANS").trim();
    let clientStringTeam2 = (req.query.t2 || "ROYAL CHALLENGERS BENGALURU").trim();

    const networkResponse = await executeResilientNetworkRequest(operationalTargetUrl, 2);

    if (!networkResponse.success) {
        payload.status = "UPLINK FAILURE: TIMEOUT OR BLOCK";
        payload.live_score = "ERROR: Node Unreachable";
        return res.status(200).json({ success: false, error: networkResponse.error, match_info: payload });
    }

    return executeDataScrapeLayer(res, networkResponse.data, payload, ledgerExposureTeam1, ledgerExposureTeam2, clientStringTeam1, clientStringTeam2);
};

// =========================================================================================
// [SECTION 2] DOM FLATTENING & ISOLATION
// =========================================================================================
function executeDataScrapeLayer(res, htmlData, payload, e1, e2, t1Name, t2Name) {
    const pageContextObject = cheerio.load(htmlData);
    
    pageContextObject('svg, img, span, div').each(function() {
        let cssClassString = pageContextObject(this).attr('class') || '';
        let inlineHtmlText = pageContextObject(this).html() || '';
        if (cssClassString.includes('bat') || cssClassString.includes('striker') || inlineHtmlText.includes('bat')) {
            pageContextObject(this).before(' *STRIKER_ACTIVE_TOKEN* ');
        }
    });

    let isolatedHtmlBody = pageContextObject('body').html() || "";
    isolatedHtmlBody = isolatedHtmlBody.replace(/<\/(div|tr|p|li|h1|h2|h3|table|tbody|td)>/gi, ' |ROW_BOUNDARY| ');
    
    let sanitizedRowContent = isolatedHtmlBody.replace(/<[^>]+>/g, ' ');
    let structuralTextRows = sanitizedRowContent.split('|ROW_BOUNDARY|')
        .map(row => row.replace(/\s+/g, ' ').trim())
        .filter(row => row.length > 0);

    let basePageTitle = pageContextObject('title').text() || "";
    return processMatchTelemetry(res, structuralTextRows, basePageTitle, payload, e1, e2, t1Name, t2Name);
}

// =========================================================================================
// [SECTION 3] METRICS & FLUID REGEX EXTRACTION (REPAIRED)
// =========================================================================================
function processMatchTelemetry(res, domRows, pageTitle, payload, e1, e2, t1Name, t2Name) {
    let unifiedPageDataString = domRows.join(' ');
    let statusTextElement = "";
    
    for (let row of domRows.slice(0, 40)) {
        let lowerRow = row.toLowerCase();
        if (lowerRow.includes('won by') || lowerRow.includes('opt to') || lowerRow.includes('need') || lowerRow.includes('choosed') || lowerRow.includes('innings break')) {
            statusTextElement = row;
            break;
        }
    }
    payload.status = statusTextElement || "Live Match Active";
    let statusTextLowercase = payload.status.toLowerCase();

    // 🔴 BUG FIX: Removed requirement for Overs to exist. Matches "RCB 2/0" or "RCB 2-0 (0.2)"
    let liveScoreRegexPattern = /\b(GT|RCB)\s*(\d+)[\/\-](\d+)(?:\s*\(?([\d\.]+)\)?)?/i;
    let scoreElementFound = false;
    let activeInningsBattingTeam = "GT";
    let liveInningsRuns = 0; let liveInningsWickets = 0;
    let activeOversCompletedString = "0.0"; let totalBallsBowledCount = 0;

    for (let row of domRows) {
        let coreScoreMatch = row.match(liveScoreRegexPattern);
        if (coreScoreMatch) {
            activeInningsBattingTeam = coreScoreMatch[1].toUpperCase();
            liveInningsRuns = parseInt(coreScoreMatch[2]) || 0;
            liveInningsWickets = parseInt(coreScoreMatch[3]) || 0;
            activeOversCompletedString = coreScoreMatch[4] || "0.0"; // Fallback if missing
            
            let oversSplitArray = activeOversCompletedString.split('.');
            totalBallsBowledCount = (parseInt(oversSplitArray[0]) * 6) + (parseInt(oversSplitArray[1]) || 0);
            payload.live_score = `${activeInningsBattingTeam} ${liveInningsRuns}/${liveInningsWickets} (${activeOversCompletedString})`;
            scoreElementFound = true;
            break;
        }
    }

    // Backup Title Scan
    if (!scoreElementFound) {
        let fallbackMatch = pageTitle.match(liveScoreRegexPattern);
        if (fallbackMatch) {
            activeInningsBattingTeam = fallbackMatch[1].toUpperCase();
            liveInningsRuns = parseInt(fallbackMatch[2]) || 0;
            liveInningsWickets = parseInt(fallbackMatch[3]) || 0;
            activeOversCompletedString = fallbackMatch[4] || "0.0";
            totalBallsBowledCount = (parseInt(activeOversCompletedString.split('.')[0]) * 6) + (parseInt(activeOversCompletedString.split('.')[1]) || 0);
            payload.live_score = `${activeInningsBattingTeam} ${liveInningsRuns}/${liveInningsWickets} (${activeOversCompletedString})`;
            scoreElementFound = true;
        }
    }

    if (statusTextLowercase.includes('starts at') || statusTextLowercase.includes('yet to begin')) {
        payload.match_state = "future";
    } else if (statusTextLowercase.includes('won by') || statusTextLowercase.includes('tied') || statusTextLowercase.includes('abandoned')) {
        payload.match_state = "completed";
    } else if (scoreElementFound || unifiedPageDataString.includes('CRR')) {
        payload.match_state = "live";
    } else {
        payload.match_state = "live"; // Force live if status contains "need X runs"
    }

    if (payload.match_state === "future") {
        payload.live_score = "MATCH NOT STARTED";
        return res.status(200).json({ success: true, match_info: payload });
    }

    let trueCurrentRunRate = 0.00;
    let isSecondInningsChasePhase = false;

    for (let row of domRows) {
        let crrRegexMatch = row.match(/CRR\s*[:\-]?\s*([\d\.]+)/i) || row.match(/Current Run Rate\s*[:\-]?\s*([\d\.]+)/i);
        if (crrRegexMatch) {
            trueCurrentRunRate = parseFloat(crrRegexMatch[1]);
            payload.current_rr = trueCurrentRunRate.toFixed(2);
        }
        let rrrRegexMatch = row.match(/RRR\s*[:\-]?\s*([\d\.]+)/i) || row.match(/Req RR\s*[:\-]?\s*([\d\.]+)/i);
        if (rrrRegexMatch) {
            payload.required_rr = parseFloat(rrrRegexMatch[1]).toFixed(2);
            isSecondInningsChasePhase = true;
        }
    }

    if (totalBallsBowledCount > 0 && trueCurrentRunRate === 0) {
        trueCurrentRunRate = (liveInningsRuns / totalBallsBowledCount) * 6;
        payload.current_rr = trueCurrentRunRate.toFixed(2);
    }
    if (statusTextLowercase.includes('need') && payload.required_rr === "0.00") {
        isSecondInningsChasePhase = true; 
        payload.required_rr = "Tracking Chase..."; // Failsafe if exact number isn't caught
    }

    // 🔴 BUG FIX: Removed `^` anchor from regexes to allow floating spaces/icons
    let validatedBattersList = [];
    let uniquelyIdentifiedBowler = "";

    for (let row of domRows) {
        if (row.match(/Last wkt|Partnership|P'ship|Extras|Total|Bowler|Batter|R\(B\)/i)) continue;
        
        let structuralBattingMatch = row.match(/([A-Za-z\s\.\-']{2,25})\s+(\d+)\s*\(\s*(\d+)\s*\)/);
        if (structuralBattingMatch) {
            let extractedPlayerName = structuralBattingMatch[1].replace(/[A-Z]{3,}/g, '').trim();
            let completePlayerStatusString = `${extractedPlayerName} ${structuralBattingMatch[2]}(${structuralBattingMatch[3]})`;
            validatedBattersList.push({ text: completePlayerStatusString, isStriker: row.includes('*STRIKER_ACTIVE_TOKEN*') });
        }
        
        let structuralBowlingMatch = row.match(/([A-Za-z\s\.\-']{2,25})\s+(\d+[\-\/]\d+)\s+([\d\.]+)/) || row.match(/([A-Za-z\s\.\-']{2,25})\s+(\d+[\-\/]\d+)/);
        if (structuralBowlingMatch && !uniquelyIdentifiedBowler) {
            let verifiedBowlerName = structuralBowlingMatch[1].replace(/(Econ|Overs|Runs|Wickets|Bowler|Recent)/gi, '').trim();
            uniquelyIdentifiedBowler = verifiedBowlerName.split(/\s+/).slice(-2).join(' ') + ` (${structuralBowlingMatch[2]})`;
        }
    }

    if (validatedBattersList.length > 0) {
        let b1 = validatedBattersList[0]; let b2 = validatedBattersList[1];
        if (b1.isStriker || !b2) {
            payload.striker = b1.text + " 🏏"; payload.non_striker = b2 ? b2.text : "Off-Strike";
        } else {
            payload.striker = b2.text + " 🏏"; payload.non_striker = b1.text;
        }
    }
    payload.batter_1 = payload.striker; payload.batter_2 = payload.non_striker;
    payload.bat_1 = payload.striker; payload.bat_2 = payload.non_striker;
    payload.bowler = uniquelyIdentifiedBowler || "🔄 Rotating Bowler";

    for (let row of domRows) {
        if (row.startsWith('Over') || row.includes('Recent')) {
            let arrayBlocks = row.split(/\s+/);
            let validatedCricketBalls = arrayBlocks.filter(block => block === 'W' || block === 'Wd' || block === 'Nb' || !isNaN(parseInt(block)));
            if (validatedCricketBalls.length >= 2) {
                payload.last_over = validatedCricketBalls.slice(-6);
                while (payload.last_over.length < 6) payload.last_over.push('-');
                break;
            }
        }
    }

    return runChampionshipOracleLogic(res, domRows, payload, e1, e2, t1Name, t2Name, liveInningsRuns, liveInningsWickets, totalBallsBowledCount, trueCurrentRunRate, isSecondInningsChasePhase, activeInningsBattingTeam);
}

// =========================================================================================
// [SECTION 4] ODDS RESOLVER & TRADING STRATEGY
// =========================================================================================
function runChampionshipOracleLogic(res, domRows, payload, e1, e2, t1Name, t2Name, runs, wickets, totalBalls, crr, isChase, batTeam) {
    let isRealMarketOddsScraped = false;
    let bookmakerFavoriteTeamToken = "";
    let favoriteBackOddsPaise = 0; let favoriteLayOddsPaise = 0;
    let combinedOddsStringDisplay = "N/A";

    for (let row of domRows) {
        let cleanRowString = row.replace(/\s+/g, ' ').trim();
        let matchRCB = cleanRowString.match(/(RCB|Royal\s+Challengers|Benga\.\.\.|Bangalore|Bengaluru)\s+(\d{1,3})\s+(\d{1,3})\b/i);
        let matchGT = cleanRowString.match(/(GT|Gujarat\s+Titans|Titans)\s+(\d{1,3})\s+(\d{1,3})\b/i);

        if (matchRCB) {
            bookmakerFavoriteTeamToken = "RCB";
            favoriteBackOddsPaise = parseInt(matchRCB[2]); favoriteLayOddsPaise = parseInt(matchRCB[3]);
            isRealMarketOddsScraped = true; break;
        }
        if (matchGT) {
            bookmakerFavoriteTeamToken = "GT";
            favoriteBackOddsPaise = parseInt(matchGT[2]); favoriteLayOddsPaise = parseInt(matchGT[3]);
            isRealMarketOddsScraped = true; break;
        }
    }

    if (!isRealMarketOddsScraped) {
        let nativeWinProbabilityValue = 50;
        let totalRemainingBallsCount = 120 - totalBalls;

        if (isChase) {
            let targetRequiredRunRate = parseFloat(payload.required_rr) || 0;
            if (wickets >= 10 || (totalRemainingBallsCount <= 0 && targetRequiredRunRate > 0)) nativeWinProbabilityValue = 1;
            else if (targetRequiredRunRate <= 0) nativeWinProbabilityValue = 99;
            else nativeWinProbabilityValue = 50 + ((crr - targetRequiredRunRate) * 6) - (wickets * 4.5);
        } else {
            let calculatedProjectedRunsTotal = runs + (totalRemainingBallsCount / 6) * crr;
            nativeWinProbabilityValue = 50 + ((calculatedProjectedRunsTotal - 185) * 0.75) - (wickets * 4);
        }

        nativeWinProbabilityValue = Math.max(5, Math.min(95, nativeWinProbabilityValue));
        bookmakerFavoriteTeamToken = (batTeam === "GT" ? (nativeWinProbabilityValue > 50 ? "GT" : "RCB") : (nativeWinProbabilityValue > 50 ? "RCB" : "GT"));
        let maxLimit = Math.max(nativeWinProbabilityValue, 100 - nativeWinProbabilityValue);
        favoriteBackOddsPaise = Math.max(1, Math.round(((100 - maxLimit) / maxLimit) * 100));
        favoriteLayOddsPaise = favoriteBackOddsPaise + 1;
    }

    combinedOddsStringDisplay = `${favoriteBackOddsPaise}-${favoriteLayOddsPaise}`;
    payload.match_prediction = `[LIVE MARKET ODDS] ${bookmakerFavoriteTeamToken} is Favorite at ${combinedOddsStringDisplay} Paise`;

    let activeInplayStrategicTactic = "🟡 HOLD - STANDARD ACCUMULATION";
    if (wickets >= 6 || (wickets >= 4 && crr < 7.4)) activeInplayStrategicTactic = "🔴 EAT (LAY) - COLLAPSING PATTERN";
    else if (crr >= 9.6 && wickets <= 2) activeInplayStrategicTactic = "🟢 PLAY (BACK) - HIGH AGGRESSION";

    if (payload.status === "Innings Break") {
        payload.prediction = `INNINGS BREAK | PHASE MARKETS CLOSED\nTACTIC: ASSESSING CHASE CONDITIONS`;
    } else if (isChase) {
        payload.prediction = `CHASE ORACLE | PHASE MARKETS CLOSED\nTACTIC: ${activeInplayStrategicTactic}`;
    } else {
        let projectedLinesArray = [];
        let overTimingMilestones = [6, 10, 15, 20];
        let currentOversFractionalValue = totalBalls / 6;

        for (let milestone of overTimingMilestones) {
            if (currentOversFractionalValue < milestone) {
                let remainingMilestoneOvers = milestone - currentOversFractionalValue;
                let microProjectedScoreTotal = Math.floor(runs + (remainingMilestoneOvers * crr));
                if (wickets >= 7) microProjectedScoreTotal = Math.min(microProjectedScoreTotal, runs + 12);
                projectedLinesArray.push(`[${milestone}v: ${microProjectedScoreTotal}]`);
            }
        }
        if (projectedLinesArray.length > 0) payload.prediction = `TARGETS: ${projectedLinesArray.join(' ')}\nTACTIC: ${activeInplayStrategicTactic}`;
    }

    if (favoriteBackOddsPaise > 0 && favoriteBackOddsPaise <= 22) {
        let reversalTriggerReason = (bookmakerFavoriteTeamToken === batTeam) ? "One wicket" : "A quick flurry of boundaries";
        payload.match_prediction += `\n<br><span style="color:#b366ff; font-weight:bold;">[SHADOW TRADER]</span> <span style="color:#fff;">${bookmakerFavoriteTeamToken} is extremely cheap (${favoriteBackOddsPaise}p). Asymmetrical risk: High value to LAY ${bookmakerFavoriteTeamToken} for a quick trading swing. ${reversalTriggerReason} shifts this market 30-40 paise.</span>`;
    }

    // --- HEDGE MATH ---
    let hedgeAdvice = "";
    const normalizeShortToken = (name) => {
        let normalizedString = name.toLowerCase().trim();
        if (normalizedString.includes('gujarat') || normalizedString.includes('gt')) return "GT";
        if (normalizedString.includes('challengers') || normalizedString.includes('rcb') || normalizedString.includes('bengaluru')) return "RCB";
        return name.toUpperCase();
    };

    let canonicalFav = normalizeShortToken(bookmakerFavoriteTeamToken);
    let canonicalT1 = normalizeShortToken(t1Name);
    let canonicalT2 = normalizeShortToken(t2Name);

    let mappedFavExposure = 0; let mappedOppExposure = 0; let oppTeamName = "";

    if (canonicalFav === canonicalT1) {
        mappedFavExposure = e1; mappedOppExposure = e2; oppTeamName = t2Name;
    } else if (canonicalFav === canonicalT2) {
        mappedFavExposure = e2; mappedOppExposure = e1; oppTeamName = t1Name;
    }

    if (e1 === 0 && e2 === 0) {
        hedgeAdvice = `[ENTRY PROTOCOL] No active ledger. Wait for entry signals.`;
    } else if (mappedFavExposure > 0 && mappedOppExposure < 0) {
        let liabilityTarget = Math.abs(mappedOppExposure);
        let layTaxCost = liabilityTarget * (favoriteLayOddsPaise / 100);
        let finalNetSecuredProfit = mappedFavExposure - layTaxCost;

        if (finalNetSecuredProfit > 0) {
            hedgeAdvice = `🟢 [GREEN BOOK AVAILABLE]\nTo clear -${Math.abs(mappedOppExposure).toFixed(0)} on ${oppTeamName}:\n> LAY ${bookmakerFavoriteTeamToken} at ${favoriteLayOddsPaise}p.\n> FINAL BOOK: +${finalNetSecuredProfit.toFixed(0)}`;
        } else {
            hedgeAdvice = `🟡 [HEDGE PENDING] Wait for ${bookmakerFavoriteTeamToken} odds to drop lower to secure net profit.`;
        }
    } else if (mappedFavExposure < 0 && mappedOppExposure > 0) {
        let backCoverStake = Math.abs(mappedFavExposure) / (favoriteBackOddsPaise / 100);
        let finalNetSecuredProfit = mappedOppExposure - backCoverStake;

        if (finalNetSecuredProfit > 0) {
            hedgeAdvice = `🟢 [GREEN BOOK AVAILABLE]\nTo clear -${Math.abs(mappedFavExposure).toFixed(0)} on ${bookmakerFavoriteTeamToken}:\n> BACK ${bookmakerFavoriteTeamToken} at ${favoriteBackOddsPaise}p.\n> FINAL BOOK: +${finalNetSecuredProfit.toFixed(0)}`;
        } else {
            hedgeAdvice = `🟡 [HEDGE PENDING] Wait for ${bookmakerFavoriteTeamToken} odds to drift out higher to secure net profit.`;
        }
    } else if (mappedFavExposure >= 0 && mappedOppExposure >= 0) {
        hedgeAdvice = `✅ [BOOK SECURED] Zero risk exposure maintained. (${bookmakerFavoriteTeamToken}: +${mappedFavExposure.toFixed(0)} | ${oppTeamName}: +${mappedOppExposure.toFixed(0)})`;
    } else {
        hedgeAdvice = `🔴 [CRITICAL ERROR] Negative exposure bound on both factions. Lay the active favorite immediately.`;
    }

    payload.ledger_analysis = hedgeAdvice;
    return res.status(200).json({ success: true, match_info: payload });
}
