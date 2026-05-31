// =========================================================================================
// CREX LIVE PIN-TO-PIN EXTRACTOR
// Version: 18.0.0 | Direct Visible-Text Scrape + Structured JSON Fallbacks
// Purpose: Fix live score, batsmen, bowler, last balls, and real market odds
// =========================================================================================

const axios = require('axios');
const cheerio = require('cheerio');
const vm = require('vm');

// =========================================================================================
// HELPERS
// =========================================================================================

function cleanText(value) {
    return String(value || '')
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function toInt(value) {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : null;
}

function toFloat(value) {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : null;
}

function isObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function padPaise(value) {
    const n = String(value || '').trim();
    if (/^\d$/.test(n)) return `0${n}`;
    return n;
}

function safeParseJsObject(text) {
    try {
        return vm.runInNewContext(`(${text})`, Object.create(null), { timeout: 1000 });
    } catch (_) {
        try {
            return JSON.parse(text);
        } catch (_) {
            return null;
        }
    }
}

function extractBalancedObject(source, marker) {
    const idx = source.indexOf(marker);
    if (idx === -1) return null;

    const start = source.indexOf('{', idx);
    if (start === -1) return null;

    let depth = 0;
    let inString = false;
    let quote = '';
    let escape = false;

    for (let i = start; i < source.length; i++) {
        const ch = source[i];

        if (inString) {
            if (escape) {
                escape = false;
            } else if (ch === '\\') {
                escape = true;
            } else if (ch === quote) {
                inString = false;
                quote = '';
            }
            continue;
        }

        if (ch === '"' || ch === "'" || ch === '`') {
            inString = true;
            quote = ch;
            continue;
        }

        if (ch === '{') depth++;
        if (ch === '}') {
            depth--;
            if (depth === 0) {
                return source.slice(start, i + 1);
            }
        }
    }

    return null;
}

function walkObject(root, visitor) {
    const seen = new Set();

    function walk(node, path = []) {
        if (node === null || node === undefined) return;
        if (typeof node !== 'object') return;
        if (seen.has(node)) return;
        seen.add(node);

        visitor(node, path);

        if (Array.isArray(node)) {
            for (let i = 0; i < node.length; i++) walk(node[i], path.concat(i));
            return;
        }

        for (const [k, v] of Object.entries(node)) {
            walk(v, path.concat(k));
        }
    }

    walk(root);
}

function findFirstValueByKeys(root, keys) {
    let found;

    walkObject(root, (node) => {
        if (found !== undefined) return;

        for (const [k, v] of Object.entries(node)) {
            const lk = String(k).toLowerCase();
            if (keys.some(key => lk === key || lk.includes(key))) {
                if (v !== undefined && v !== null && v !== '') {
                    found = v;
                    return;
                }
            }
        }
    });

    return found;
}

function findFirstObjectByKeys(root, keys) {
    let found = null;

    walkObject(root, (node) => {
        if (found) return;
        if (!isObject(node)) return;

        const hitCount = Object.keys(node).reduce((acc, k) => {
            const lk = String(k).toLowerCase();
            return acc + (keys.some(key => lk === key || lk.includes(key)) ? 1 : 0);
        }, 0);

        if (hitCount >= 2) found = node;
    });

    return found;
}

function normalizeTeamToken(name) {
    const n = cleanText(name).toLowerCase();

    if (n.includes('gujarat') || n === 'gt' || n.includes('titans')) return 'GT';
    if (n.includes('rcb') || n.includes('royal challengers') || n.includes('bengaluru') || n.includes('bangalore')) return 'RCB';

    return cleanText(name).toUpperCase();
}

function getAllTextLines($) {
    const body = $('body').clone();

    body.find('script,style,noscript').remove();

    const raw = cleanText(body.text());
    return raw
        .split(/\n| {2,}/g)
        .map(s => cleanText(s))
        .filter(Boolean);
}

function findLine(lines, regex) {
    return lines.find(line => regex.test(line)) || '';
}

function findLineIndex(lines, regex) {
    for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) return i;
    }
    return -1;
}

function sectionBetween(lines, startRegex, endRegex) {
    const start = findLineIndex(lines, startRegex);
    if (start === -1) return [];

    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
        if (endRegex.test(lines[i])) {
            end = i;
            break;
        }
    }

    return lines.slice(start + 1, end);
}

function extractScoreLine(lines) {
    for (const line of lines) {
        const m = line.match(/\b(GT|RCB)\s+(\d+)\s*[-/]\s*(\d+)\s*\(?(\d+\.\d+|\d+)\)?/i);
        if (m) {
            return {
                team: m[1].toUpperCase(),
                runs: toInt(m[2]),
                wickets: toInt(m[3]),
                overs: m[4]
            };
        }
    }
    return null;
}

function extractCRR(lines) {
    for (const line of lines) {
        const m = line.match(/CRR\s*[:\-]?\s*(\d+(?:\.\d+)?)/i);
        if (m) return m[1];
    }
    return null;
}

function extractRRR(lines) {
    for (const line of lines) {
        const m = line.match(/RRR\s*[:\-]?\s*(\d+(?:\.\d+)?)/i);
        if (m) return m[1];
    }
    return null;
}

function extractNeedLine(lines) {
    for (const line of lines) {
        if (/need\s+\d+\s+runs?\s+in\s+\d+\s+balls?/i.test(line)) return cleanText(line);
    }
    return '';
}

function extractToss(lines, fallbackText) {
    for (const line of lines) {
        if (/toss/i.test(line) && /(opt(?:ed|s)? to|chose to|elect(?:ed|s)? to|decided to)\s+(bat|bowl|field)/i.test(line)) {
            return cleanText(line);
        }
    }

    const m = cleanText(fallbackText).match(/(.*toss.*(?:opt(?:ed|s)? to|chose to|elect(?:ed|s)? to|decided to)\s+(?:bat|bowl|field).*)/i);
    return m ? cleanText(m[1]) : '';
}

function extractVenue(lines, state) {
    const direct = cleanText(
        findFirstValueByKeys(state, ['venue', 'stadium', 'ground', 'venue_name', 'venuename']) || ''
    );
    if (direct) return direct;

    for (const line of lines) {
        if (/Narendra Modi Stadium/i.test(line)) return cleanText(line);
    }
    return '';
}

function extractTitle($, lines) {
    const pageTitle = cleanText($('title').text());
    if (pageTitle) return pageTitle;

    const topLine = lines.find(l => /vs|final|match/i.test(l)) || '';
    return cleanText(topLine) || 'GT VS RCB | GRAND FINAL';
}

function extractBatsmenFromState(state) {
    const candidates = [];

    walkObject(state, (node) => {
        if (!Array.isArray(node)) return;
        if (node.length < 1) return;

        const first = node[0];
        if (!isObject(first)) return;

        const hasName = 'name' in first || 'playerName' in first || 'fullName' in first || 'displayName' in first;
        const hasRuns = 'runs' in first || 'run' in first || 'score' in first || 'r' in first;
        const hasBalls = 'balls' in first || 'ball' in first || 'bf' in first || 'b' in first;

        if (hasName && hasRuns && hasBalls) candidates.push(node);
    });

    for (const arr of candidates) {
        const rows = arr.map((obj) => {
            if (!isObject(obj)) return null;

            const name = cleanText(obj.name || obj.playerName || obj.fullName || obj.displayName || obj.batterName || obj.title);
            const runs = obj.runs ?? obj.run ?? obj.score ?? obj.r;
            const balls = obj.balls ?? obj.ball ?? obj.bf ?? obj.b;

            if (!name || runs === undefined || balls === undefined) return null;

            const striker = Boolean(obj.isStriker || obj.striker || obj.onStrike || obj.on_strike || obj.strike === true);
            return { name, runs, balls, striker };
        }).filter(Boolean);

        if (rows.length) return rows;
    }

    return [];
}

function extractBatsmenFromLines(lines) {
    const section = sectionBetween(
        lines,
        /^(batter|batters|batsman|batsmen)\b/i,
        /^(bowler|partnership|p'ship|last wkt|last wicket|recent|scorecard)\b/i
    );

    const rows = [];

    for (const line of section) {
        const m = line.match(/^([A-Za-z][A-Za-z .'\-]{1,45}?)\s*([#*✎✓]?)\s*(\d+)\s*\(\s*(\d+)\s*\)/);
        if (m) {
            rows.push({
                name: cleanText(m[1]),
                runs: toInt(m[3]),
                balls: toInt(m[4]),
                striker: Boolean(m[2])
            });
        }
    }

    return rows;
}

function extractBowlerFromState(state) {
    let found = '';

    walkObject(state, (node) => {
        if (found) return;
        if (!isObject(node)) return;

        const keys = Object.keys(node).map(k => k.toLowerCase());
        const looksLikeBowler =
            keys.some(k => k.includes('bowler')) ||
            (keys.some(k => k.includes('wkts')) && keys.some(k => k.includes('runs'))) ||
            (keys.some(k => k.includes('wickets')) && keys.some(k => k.includes('runs')));

        if (!looksLikeBowler) return;

        const name = cleanText(node.name || node.playerName || node.fullName || node.displayName || node.bowlerName || node.title);
        if (!name) return;

        const wr = node.wickets ?? node.wkts ?? node.wicket;
        const runs = node.runs ?? node.r ?? node.conceded;

        if (wr !== undefined && runs !== undefined) {
            found = `${name} ${wr}-${runs}`;
        } else if (node.overs !== undefined) {
            found = `${name} ${cleanText(node.overs)}`;
        }
    });

    return found;
}

function extractBowlerFromLines(lines) {
    const section = sectionBetween(
        lines,
        /^(bowler)\b/i,
        /^(over|overs|next over|recent|innings|batter|batters|partnership|p'ship)\b/i
    );

    for (const line of section) {
        const m = line.match(/^([A-Za-z][A-Za-z .'\-]{1,45}?)\s+(\d+\s*[-/]\s*\d+)\b/);
        if (m) {
            return `${cleanText(m[1])} ${cleanText(m[2]).replace(/\s+/g, '')}`;
        }
    }

    return '';
}

function extractLastOverFromLines(lines) {
    // Tries to capture the visible over-ball row like: 2 1 0 2
    for (const line of lines) {
        if (/Over\s+\d+/i.test(line) || /Overs?\s*>/i.test(line) || /last over/i.test(line)) {
            const tokens = cleanText(line).split(/\s+/).filter(Boolean);

            const balls = tokens.filter(t => /^(W|Wd|Nb|-|[0-6])$/i.test(t));
            if (balls.length >= 2) {
                return balls.slice(-6);
            }

            const digitTokens = tokens.filter(t => /^[0-6]$/.test(t));
            if (digitTokens.length >= 2) {
                return digitTokens.slice(-6);
            }
        }
    }

    return [];
}

function extractOddsFromLines(lines) {
    // Priority: direct visible market row around team name + two chip values.
    for (const line of lines) {
        const normalized = cleanText(line);

        if (!/(RCB|GT|Royal Challengers|Gujarat Titans|Bengaluru|Bangalore|Titans)/i.test(normalized)) continue;
        if (/(Batter|Bowler|CRR|RRR|Target|Runs|Over|Overs|Partnership|wkt|wickets|economy|econ)/i.test(normalized)) continue;

        // Example: "Royal Challengers Benga... RCB 04 05"
        const m = normalized.match(/\b(RCB|GT|Royal Challengers|Gujarat Titans|Bengaluru|Bangalore|Titans)\b.*?(\d{1,3})\s+(\d{1,3})\b/i);
        if (m) {
            const team = /RCB|Royal Challengers|Bengaluru|Bangalore/i.test(m[1]) ? 'RCB' : 'GT';
            return {
                favTeam: team,
                backPaise: padPaise(m[2]),
                layPaise: padPaise(m[3])
            };
        }

        // Alternate: "RCB 04 05"
        const m2 = normalized.match(/\b(RCB|GT)\b\s+(\d{1,3})\s+(\d{1,3})\b/i);
        if (m2) {
            return {
                favTeam: m2[1].toUpperCase(),
                backPaise: padPaise(m2[2]),
                layPaise: padPaise(m2[3])
            };
        }
    }

    return null;
}

function extractOddsFromState(state) {
    let found = null;

    walkObject(state, (node) => {
        if (found) return;
        if (!isObject(node)) return;

        const keys = Object.keys(node).map(k => k.toLowerCase());
        const hasBack = keys.some(k => k === 'back' || k.includes('backprice') || k.includes('back_paise') || k.includes('backodds'));
        const hasLay = keys.some(k => k === 'lay' || k.includes('layprice') || k.includes('lay_paise') || k.includes('layodds'));

        if (!hasBack || !hasLay) return;

        const fav =
            node.favourite ||
            node.favorite ||
            node.fav ||
            node.team ||
            node.teamName ||
            node.name ||
            node.runner ||
            node.selection ||
            '';

        const back = node.back ?? node.backPrice ?? node.back_price ?? node.backOdds ?? node.backodds ?? node.back_paise;
        const lay = node.lay ?? node.layPrice ?? node.lay_price ?? node.layOdds ?? node.layodds ?? node.lay_paise;

        const backText = String(back ?? '').trim();
        const layText = String(lay ?? '').trim();

        if (backText && layText) {
            found = {
                favTeam: cleanText(fav) || '',
                backPaise: padPaise(backText),
                layPaise: padPaise(layText)
            };
        }
    });

    return found;
}

function deriveMatchState(statusText) {
    const t = cleanText(statusText).toLowerCase();
    if (t.includes('yet to begin') || t.includes('starts at') || t.includes('scheduled')) return 'future';
    if (t.includes('won by') || t.includes('tied') || t.includes('abandoned') || t.includes('result')) return 'completed';
    return 'live';
}

function buildMatchPrediction(odds, fallbackText) {
    if (odds && odds.favTeam && odds.backPaise && odds.layPaise) {
        return `[LIVE MARKET ODDS] ${odds.favTeam} is Favorite at ${odds.backPaise}-${odds.layPaise} Paise`;
    }

    // No synthetic probability fallback. Better to be blank than wrong.
    if (/odds|market/i.test(fallbackText)) return `[LIVE MARKET ODDS] Unavailable`;
    return `[LIVE MARKET ODDS] Unavailable`;
}

function buildTactic(currentRR, wickets) {
    const crr = toFloat(currentRR) || 0;
    const wk = toInt(wickets) || 0;

    if (wk >= 6 || (wk >= 4 && crr < 7.4)) return '🔴 EAT (LAY) - COLLAPSING PATTERN';
    if (crr >= 9.6 && wk <= 2) return '🟢 PLAY (BACK) - HIGH AGGRESSION';
    return '🟡 HOLD - STANDARD ACCUMULATION';
}

function buildPrediction(matchState, isSecondInnings, currentRR, wickets) {
    const tactic = buildTactic(currentRR, wickets);

    if (matchState === 'future') {
        return 'MATCH NOT STARTED';
    }

    if (matchState === 'completed') {
        return 'MATCH COMPLETED';
    }

    if (isSecondInnings) {
        return `CHASE ORACLE | PHASE MARKETS CLOSED\nTACTIC: ${tactic}`;
    }

    return `LIVE ORACLE | PHASE MARKETS CLOSED\nTACTIC: ${tactic}`;
}

function parseCurrentWicketsFromScore(liveScore) {
    const m = cleanText(liveScore).match(/\b\d+\s*[-/]\s*(\d+)\s*\(/);
    return m ? toInt(m[1]) || 0 : 0;
}

function scoreFromNeedLine(line) {
    const m = cleanText(line).match(/\b([A-Z]{2,3})\s+need\s+(\d+)\s+runs?\s+in\s+(\d+)\s+balls?/i);
    if (!m) return null;
    return {
        team: m[1].toUpperCase(),
        runsNeeded: toInt(m[2]),
        balls: toInt(m[3])
    };
}

function inferSecondInnings(statusText, requiredRR) {
    if (!requiredRR) return /need\s+\d+\s+runs?\s+in\s+\d+\s+balls?/i.test(statusText);
    return true;
}

function fallbackLiveScoreFromLines(lines) {
    for (const line of lines) {
        const m = line.match(/\b(RCB|GT)\s+(\d+)\s*[-/]\s*(\d+)\s*(\d+\.\d+|\d+)\b/i);
        if (m) {
            return `${m[1].toUpperCase()} ${m[2]}/${m[3]} (${m[4]})`;
        }
    }
    return '';
}

// =========================================================================================
// MAIN HANDLER
// =========================================================================================

module.exports = async function (req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const exactFinalUrl = "https://crex.live/cricket-live-score/gt-vs-rcb-final-indian-premier-league-2026-match-updates-11XM";

    let operationalTargetUrl = req.query.url || exactFinalUrl;
    operationalTargetUrl = String(operationalTargetUrl).replace('crex.com', 'crex.live');

    const ledgerExposureTeam1 = parseFloat(req.query.e1) || 0;
    const ledgerExposureTeam2 = parseFloat(req.query.e2) || 0;
    const clientStringTeam1 = (req.query.t1 || "GUJARAT TITANS").trim();
    const clientStringTeam2 = (req.query.t2 || "ROYAL CHALLENGERS BENGALURU").trim();

    const SECURE_BROWSER_HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache'
    };

    const payload = {
        title: "GT VS RCB | GRAND FINAL",
        status: "Initializing...",
        match_state: "standby",
        winner: "PENDING",
        live_score: "NO SCORE",
        current_rr: "0.00",
        required_rr: "0.00",
        bat_1: "UNAVAILABLE",
        bat_2: "UNAVAILABLE",
        bowler: "UNAVAILABLE",
        toss: "UNAVAILABLE",
        venue: "Narendra Modi Stadium, Ahmedabad",
        last_over: ["-", "-", "-", "-", "-", "-"],
        prediction: "AWAITING DATA",
        match_prediction: "UNAVAILABLE",
        ledger_analysis: "AWAITING LEDGER SYNC",
        source_url: "CREX (Pin-to-Pin DOM Engine)",
        fetch_code: "OH"
    };

    let htmlData = null;

    try {
        const fetchUrl = operationalTargetUrl.includes('?')
            ? `${operationalTargetUrl}&_t=${Date.now()}`
            : `${operationalTargetUrl}?_t=${Date.now()}`;

        const response = await axios.get(fetchUrl, {
            headers: SECURE_BROWSER_HEADERS,
            timeout: 8000,
            maxRedirects: 3
        });

        if (response.data && String(response.data).length > 500) {
            htmlData = String(response.data);
            payload.fetch_code = "UREKHA";
        } else {
            throw new Error("Empty payload returned from CREX");
        }
    } catch (networkError) {
        payload.status = "UPLINK FAILURE: TIMEOUT OR BLOCK";
        payload.live_score = "ERROR: Node Unreachable";
        return res.status(200).json({
            success: false,
            error: networkError.message,
            match_info: payload
        });
    }

    const $ = cheerio.load(htmlData);
    const lines = getAllTextLines($);
    const fallbackText = cleanText($('body').text() || htmlData);

    // =========================================================================================
    // STRUCTURED SCRIPT STATE PARSING
    // =========================================================================================

    let parsedState = null;
    const scripts = $('script')
        .map((_, el) => $(el).html() || '')
        .get()
        .filter(Boolean);

    for (const scriptText of scripts) {
        if (
            scriptText.includes('window.__INITIAL_STATE__') ||
            scriptText.includes('__INITIAL_STATE__') ||
            scriptText.includes('__NEXT_DATA__') ||
            scriptText.includes('matchData') ||
            scriptText.includes('inningsData')
        ) {
            const marker =
                scriptText.includes('window.__INITIAL_STATE__') ? 'window.__INITIAL_STATE__' :
                scriptText.includes('__NEXT_DATA__') ? '__NEXT_DATA__' :
                '__INITIAL_STATE__';

            const objText = extractBalancedObject(scriptText, marker);
            if (objText) {
                parsedState = safeParseJsObject(objText);
                if (parsedState) break;
            }
        }
    }

    const state = parsedState || {};

    // =========================================================================================
    // CORE FIELD EXTRACTION
    // =========================================================================================

    payload.title = extractTitle($, lines);

    const needLine = extractNeedLine(lines);
    const scoreLine = extractScoreLine(lines) || null;

    const statusFromNeed = needLine || cleanText(findFirstValueByKeys(state, ['status', 'matchstatus', 'match_state']) || '');
    payload.status = statusFromNeed || payload.status;

    payload.match_state = deriveMatchState(payload.status);

    if (payload.match_state === 'completed') {
        const winMatch = payload.status.match(/^(.*?)\s+won by/i);
        if (winMatch) payload.winner = cleanText(winMatch[1]).toUpperCase();
    }

    payload.venue = extractVenue(lines, state) || payload.venue;
    payload.toss = extractToss(lines, fallbackText) || payload.toss;

    // Live score: prefer visible line, then state, then fallback line parsing.
    const stateLiveScore =
        cleanText(findFirstValueByKeys(state, ['live_score', 'livescore', 'scoreline', 'score_text']) || '');

    if (scoreLine) {
        payload.live_score = `${scoreLine.team} ${scoreLine.runs}/${scoreLine.wickets} (${scoreLine.overs})`;
    } else if (stateLiveScore && /\d/.test(stateLiveScore)) {
        payload.live_score = stateLiveScore;
    } else {
        payload.live_score = fallbackLiveScoreFromLines(lines) || payload.live_score;
    }

    // Current / required run rate.
    const crr = extractCRR(lines) || cleanText(findFirstValueByKeys(state, ['current_rr', 'crr', 'currentrunrate']) || '');
    const rrr = extractRRR(lines) || cleanText(findFirstValueByKeys(state, ['required_rr', 'rrr', 'requiredrunrate']) || '');

    payload.current_rr = crr || payload.current_rr;

    if (rrr) {
        payload.required_rr = rrr;
    } else if (/need\s+\d+\s+runs?\s+in\s+\d+\s+balls?/i.test(payload.status)) {
        payload.required_rr = payload.required_rr || '0.00';
    } else if (payload.match_state === 'live') {
        payload.required_rr = '1st Innings';
    }

    // Batsmen: visible section first, then state.
    const batsmenFromLines = extractBatsmenFromLines(lines);
    const batsmenFromState = extractBatsmenFromState(state);

    const batsmen = batsmenFromLines.length ? batsmenFromLines : batsmenFromState;

    if (batsmen.length) {
        const striker = batsmen.find(b => b.striker) || batsmen[0];
        const other = batsmen.find(b => b !== striker) || batsmen[1];

        if (striker) payload.bat_1 = `${striker.name} ${striker.runs}(${striker.balls})`;
        if (other) payload.bat_2 = `${other.name} ${other.runs}(${other.balls})`;
    }

    // Bowler: visible section first, then state.
    payload.bowler = extractBowlerFromLines(lines) || extractBowlerFromState(state) || payload.bowler;

    // Last over balls: from visible row or state arrays.
    let lastOver = extractLastOverFromLines(lines);

    if (!lastOver.length) {
        walkObject(state, (node) => {
            if (lastOver.length) return;
            if (!Array.isArray(node)) return;

            const balls = node
                .map(item => {
                    if (typeof item === 'string') return cleanText(item);
                    if (typeof item === 'number') return String(item);
                    if (isObject(item)) {
                        return cleanText(item.result || item.ball || item.short || item.text || item.value || item.runs || item.outcome || '');
                    }
                    return '';
                })
                .filter(Boolean)
                .filter(t => /^(W|Wd|Nb|-|[0-6])$/i.test(t));

            if (balls.length >= 2) lastOver = balls.slice(-6);
        });
    }

    if (lastOver.length) {
        payload.last_over = lastOver;
        while (payload.last_over.length < 6) payload.last_over.push('-');
    }

    // =========================================================================================
    // REAL ODDS EXTRACTION
    // =========================================================================================

    let odds =
        extractOddsFromLines(lines) ||
        extractOddsFromState(state);

    // Do not invent odds from run-rate math. If direct data is missing, keep unavailable.
    if (odds && odds.favTeam && odds.backPaise && odds.layPaise) {
        payload.match_prediction = `[LIVE MARKET ODDS] ${odds.favTeam} is Favorite at ${odds.backPaise}-${odds.layPaise} Paise`;
    } else {
        payload.match_prediction = `[LIVE MARKET ODDS] Unavailable`;
    }

    // =========================================================================================
    // SIMPLE DIRECTIONAL TACTIC
    // =========================================================================================

    const wickets = parseCurrentWicketsFromScore(payload.live_score);
    const isSecondInnings = inferSecondInnings(payload.status, payload.required_rr);

    payload.prediction = buildPrediction(payload.match_state, isSecondInnings, payload.current_rr, wickets);

    // =========================================================================================
    // LEDGER ANALYSIS
    // =========================================================================================

    const canonicalFav = normalizeTeamToken(odds?.favTeam || '');
    const canonicalT1 = normalizeTeamToken(clientStringTeam1);
    const canonicalT2 = normalizeTeamToken(clientStringTeam2);

    let mappedFavExposure = 0;
    let mappedOppExposure = 0;
    let oppTeamName = '';

    if (canonicalFav && canonicalFav === canonicalT1) {
        mappedFavExposure = ledgerExposureTeam1;
        mappedOppExposure = ledgerExposureTeam2;
        oppTeamName = clientStringTeam2;
    } else if (canonicalFav && canonicalFav === canonicalT2) {
        mappedFavExposure = ledgerExposureTeam2;
        mappedOppExposure = ledgerExposureTeam1;
        oppTeamName = clientStringTeam1;
    }

    let hedgeAdvice = '';

    if (ledgerExposureTeam1 === 0 && ledgerExposureTeam2 === 0) {
        hedgeAdvice = `[ENTRY PROTOCOL] No active ledger. Wait for entry signals.`;
    } else if (odds && mappedFavExposure > 0 && mappedOppExposure < 0) {
        const liabilityTarget = Math.abs(mappedOppExposure);
        const layTaxCost = liabilityTarget * (toInt(String(odds.layPaise)) / 100);
        const finalNetSecuredProfit = mappedFavExposure - layTaxCost;

        if (finalNetSecuredProfit > 0) {
            hedgeAdvice = `🟢 [GREEN BOOK AVAILABLE]\nTo clear -${Math.abs(mappedOppExposure).toFixed(0)} on ${oppTeamName}:\n> LAY ${odds.favTeam} at ${odds.layPaise}p.\n> FINAL BOOK: +${finalNetSecuredProfit.toFixed(0)}`;
        } else {
            hedgeAdvice = `🟡 [HEDGE PENDING] Wait for ${odds.favTeam} odds to improve.`;
        }
    } else if (odds && mappedFavExposure < 0 && mappedOppExposure > 0) {
        const backCoverStake = Math.abs(mappedFavExposure) / (toInt(String(odds.backPaise)) / 100);
        const finalNetSecuredProfit = mappedOppExposure - backCoverStake;

        if (finalNetSecuredProfit > 0) {
            hedgeAdvice = `🟢 [GREEN BOOK AVAILABLE]\nTo clear -${Math.abs(mappedFavExposure).toFixed(0)} on ${odds.favTeam}:\n> BACK ${odds.favTeam} at ${odds.backPaise}p.\n> FINAL BOOK: +${finalNetSecuredProfit.toFixed(0)}`;
        } else {
            hedgeAdvice = `🟡 [HEDGE PENDING] Wait for ${odds.favTeam} odds to drift.`;
        }
    } else if (odds) {
        hedgeAdvice = `✅ [BOOK SCAN OK] ${odds.favTeam} @ ${odds.backPaise}-${odds.layPaise}p`;
    } else {
        hedgeAdvice = `✅ [BOOK SCAN OK] Odds unavailable`;
    }

    payload.ledger_analysis = hedgeAdvice;

    return res.status(200).json({
        success: true,
        match_info: payload
    });
};
