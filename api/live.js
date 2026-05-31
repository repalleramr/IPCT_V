// =========================================================================================
// MI6 QUANTUM ORACLE - CREX LIVE PIN-TO-PIN EXTRACTOR
// Version: 17.0.0 | Structured JSON Scrape + Safe Fallbacks
// =========================================================================================

const axios = require('axios');
const cheerio = require('cheerio');
const vm = require('vm');

// =========================================================================================
// [SECTION 1] BASIC HELPERS
// =========================================================================================

function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
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

function safeJsonLikeParse(text) {
    try {
        return vm.runInNewContext(`(${text})`, Object.create(null), { timeout: 1000 });
    } catch (e1) {
        try {
            return JSON.parse(text);
        } catch (e2) {
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
            for (let i = 0; i < node.length; i++) {
                walk(node[i], path.concat(i));
            }
            return;
        }

        for (const [k, v] of Object.entries(node)) {
            walk(v, path.concat(k));
        }
    }

    walk(root);
}

function findFirstValueByKeys(root, keys) {
    let found = undefined;

    walkObject(root, (node) => {
        if (found !== undefined) return;
        for (const [k, v] of Object.entries(node)) {
            const lk = String(k).toLowerCase();
            if (keys.some(key => lk === key || lk.includes(key))) {
                if (v !== undefined && v !== null) {
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

        if (hitCount >= 2) {
            found = node;
        }
    });

    return found;
}

function formatBatter(obj) {
    if (!isObject(obj)) return null;

    const name = cleanText(
        obj.name || obj.playerName || obj.fullName || obj.displayName || obj.batterName || obj.title
    );

    const runs = obj.runs ?? obj.run ?? obj.r ?? obj.score;
    const balls = obj.balls ?? obj.ball ?? obj.bf ?? obj.b;
    const isStriker = Boolean(
        obj.isStriker ||
        obj.striker ||
        obj.onStrike ||
        obj.on_strike ||
        obj.strike === true
    );

    if (!name || runs === undefined || balls === undefined) return null;

    return {
        text: `${name} ${runs}(${balls})`,
        isStriker
    };
}

function formatBowler(obj) {
    if (!isObject(obj)) return null;

    const name = cleanText(
        obj.name || obj.playerName || obj.fullName || obj.displayName || obj.bowlerName || obj.title
    );

    const wickets = obj.wickets ?? obj.wkts ?? obj.wicket ?? obj.w;
    const runs = obj.runs ?? obj.r ?? obj.conceded ?? obj.oppRuns;

    if (!name) return null;

    if (wickets !== undefined && runs !== undefined) {
        return `${name} (${wickets}/${runs})`;
    }

    if (obj.overs !== undefined) {
        return `${name} (${obj.overs})`;
    }

    return name;
}

function extractRecentBallsFromArray(arr) {
    if (!Array.isArray(arr)) return null;

    const normalized = arr.map(item => {
        if (typeof item === 'string') return cleanText(item);
        if (typeof item === 'number') return String(item);
        if (isObject(item)) {
            return cleanText(
                item.result ||
                item.ball ||
                item.short ||
                item.text ||
                item.value ||
                item.runs ||
                item.outcome
            );
        }
        return '';
    }).filter(Boolean);

    const compact = normalized.filter(t => /^(W|Wd|Nb|-|[0-6])$/i.test(t));
    if (compact.length >= 2) {
        return compact.slice(-6);
    }

    if (normalized.length >= 2) {
        return normalized.slice(-6);
    }

    return null;
}

function findLastOver(root) {
    let candidate = null;

    walkObject(root, (node) => {
        if (candidate) return;

        if (Array.isArray(node)) {
            const maybe = extractRecentBallsFromArray(node);
            if (maybe && maybe.length >= 2 && maybe.length <= 6) {
                candidate = maybe;
                return;
            }
        }
    });

    return candidate;
}

function extractLiveScoreFromText(text) {
    const t = cleanText(text);
    const m = t.match(/\b(GT|RCB)\s+(\d+)[\/\-](\d+)\s*\(([\d\.]+)\)/i);
    if (m) {
        return {
            team: m[1].toUpperCase(),
            runs: toInt(m[2]),
            wickets: toInt(m[3]),
            overs: m[4]
        };
    }
    return null;
}

function extractOddsFromObject(root) {
    let result = null;

    walkObject(root, (node) => {
        if (result) return;
        if (!isObject(node)) return;

        const keys = Object.keys(node).map(k => k.toLowerCase());

        const hasBack = keys.some(k => k === 'back' || k.includes('backprice') || k.includes('back_paise') || k.includes('backodds'));
        const hasLay = keys.some(k => k === 'lay' || k.includes('layprice') || k.includes('lay_paise') || k.includes('layodds'));

        if (!hasBack || !hasLay) return;

        let fav =
            node.favourite ||
            node.favorite ||
            node.fav ||
            node.team ||
            node.teamName ||
            node.name ||
            node.runner ||
            node.selection;

        const back =
            node.back ?? node.backPrice ?? node.back_price ?? node.backOdds ?? node.backodds ?? node.back_paise;

        const lay =
            node.lay ?? node.layPrice ?? node.lay_price ?? node.layOdds ?? node.layodds ?? node.lay_paise;

        const backN = toInt(back);
        const layN = toInt(lay);

        if (backN && layN) {
            result = {
                favTeam: cleanText(fav || ''),
                backPaise: Math.min(backN, layN),
                layPaise: Math.max(backN, layN)
            };
        }
    });

    return result;
}

function extractOddsFromText(text) {
    const t = cleanText(text);

    let m = t.match(/(RCB|Royal\s+Challengers|Bengaluru|Bangalore)\D{0,18}(\d{1,3})\D{0,10}(\d{1,3})/i);
    if (m) {
        const a = toInt(m[2]);
        const b = toInt(m[3]);
        if (a && b) {
            return {
                favTeam: 'RCB',
                backPaise: Math.min(a, b),
                layPaise: Math.max(a, b)
            };
        }
    }

    m = t.match(/(GT|Gujarat\s+Titans|Titans)\D{0,18}(\d{1,3})\D{0,10}(\d{1,3})/i);
    if (m) {
        const a = toInt(m[2]);
        const b = toInt(m[3]);
        if (a && b) {
            return {
                favTeam: 'GT',
                backPaise: Math.min(a, b),
                layPaise: Math.max(a, b)
            };
        }
    }

    return null;
}

function extractTossFromText(text) {
    const t = cleanText(text);
    if (!/toss/i.test(t)) return null;
    if (/(opt(?:ed|s)? to|chose to|elect(?:ed|s)? to|decided to)\s+(bat|bowl|field)/i.test(t)) {
        return t;
    }
    const m = t.match(/(.*toss.*(?:opt(?:ed|s)? to|chose to|elect(?:ed|s)? to|decided to)\s+(?:bat|bowl|field).*)/i);
    return m ? cleanText(m[1]) : null;
}

function normalizeTeamToken(name) {
    const n = cleanText(name).toLowerCase();
    if (n.includes('gujarat') || n === 'gt') return 'GT';
    if (n.includes('rcb') || n.includes('royal challengers') || n.includes('bengaluru') || n.includes('bangalore')) return 'RCB';
    return cleanText(name).toUpperCase();
}

function chooseBestStateObject(state) {
    const candidates = [
        state,
        state?.matchData,
        state?.data,
        state?.pageData,
        state?.props?.pageProps,
        state?.props,
        state?.initialState
    ].filter(Boolean);

    let best = candidates[0] || state;

    const scoreObject = (obj) => {
        if (!isObject(obj)) return 0;
        let score = 0;
        const keys = Object.keys(obj).map(k => k.toLowerCase());

        const boosts = [
            'matchdata',
            'inningsdata',
            'commentary',
            'batsmen',
            'batters',
            'bowler',
            'live',
            'score',
            'odds',
            'toss',
            'venue'
        ];

        for (const b of boosts) {
            if (keys.some(k => k === b || k.includes(b))) score += 10;
        }

        return score;
    };

    let bestScore = scoreObject(best);
    for (const c of candidates) {
        const s = scoreObject(c);
        if (s > bestScore) {
            best = c;
            bestScore = s;
        }
    }

    return best;
}

function getStringFromAny(obj, keys) {
    const value = findFirstValueByKeys(obj, keys);
    if (typeof value === 'string') return cleanText(value);
    return null;
}

function getNumberFromAny(obj, keys) {
    const value = findFirstValueByKeys(obj, keys);
    if (value === undefined || value === null) return null;
    const n = typeof value === 'number' ? value : parseFloat(value);
    return Number.isFinite(n) ? n : null;
}

function buildLiveScoreFromState(root) {
    const direct = getStringFromAny(root, ['live_score', 'livescore', 'scoreline', 'score_text', 'displayscore', 'score']);
    if (direct && /\d/.test(direct)) {
        const scoreMatch = extractLiveScoreFromText(direct);
        if (scoreMatch) {
            return `${scoreMatch.team} ${scoreMatch.runs}/${scoreMatch.wickets} (${scoreMatch.overs})`;
        }
        return direct;
    }

    const team =
        getStringFromAny(root, ['battingteam', 'batting_team', 'team']) ||
        getStringFromAny(root, ['batteam', 'innningsteam', 'inningsteam']);

    const runs =
        getNumberFromAny(root, ['runs', 'score', 'totalruns', 'total_runs', 'currentruns', 'current_runs']);

    const wickets =
        getNumberFromAny(root, ['wickets', 'wkts', 'wicket', 'currentwickets', 'current_wickets']);

    const overs =
        getStringFromAny(root, ['overs', 'over', 'currentover', 'current_over', 'overscompleted', 'overs_completed']);

    if (team && runs !== null && wickets !== null && overs) {
        return `${team.toUpperCase()} ${runs}/${wickets} (${overs})`;
    }

    return null;
}

function getCurrentRR(root, liveScoreText, oversText) {
    const direct = getNumberFromAny(root, ['current_rr', 'crr', 'currentrunrate', 'current_run_rate']);
    if (direct !== null) return direct.toFixed(2);

    const m = cleanText(liveScoreText || '').match(/\(([\d\.]+)\)/);
    if (m) {
        const overs = parseFloat(m[1]);
        const scoreMatch = cleanText(liveScoreText || '').match(/\b(\d+)\/(\d+)\b/);
        if (overs > 0 && scoreMatch) {
            const runs = parseInt(scoreMatch[1], 10);
            const balls = Math.floor(overs) * 6 + Math.round((overs - Math.floor(overs)) * 10);
            if (balls > 0) {
                return ((runs / balls) * 6).toFixed(2);
            }
        }
    }

    return '0.00';
}

function getRequiredRR(root) {
    const direct = getNumberFromAny(root, ['required_rr', 'rrr', 'requiredrunrate', 'required_run_rate']);
    if (direct !== null) return direct.toFixed(2);
    return null;
}

function getBatters(root) {
    const candidateArrays = [];

    walkObject(root, (node) => {
        if (!Array.isArray(node)) return;
        if (node.length < 1) return;

        const first = node[0];
        if (isObject(first)) {
            const hasName = 'name' in first || 'playerName' in first || 'fullName' in first || 'displayName' in first;
            const hasRuns = 'runs' in first || 'run' in first || 'r' in first || 'score' in first;
            const hasBalls = 'balls' in first || 'ball' in first || 'bf' in first || 'b' in first;
            if (hasName && hasRuns && hasBalls) {
                candidateArrays.push(node);
            }
        }
    });

    for (const arr of candidateArrays) {
        const formatted = arr.map(formatBatter).filter(Boolean);
        if (formatted.length >= 1) {
            formatted.sort((a, b) => Number(b.isStriker) - Number(a.isStriker));
            return formatted;
        }
    }

    return [];
}

function getBowler(root) {
    let found = null;

    walkObject(root, (node) => {
        if (found) return;
        if (!isObject(node)) return;

        const hasLikelyBowlerKeys = Object.keys(node).some(k => {
            const lk = k.toLowerCase();
            return lk.includes('bowler') || lk.includes('currentbowler') || lk.includes('lastbowler') || lk.includes('attack');
        });

        if (hasLikelyBowlerKeys) {
            const formatted = formatBowler(node);
            if (formatted) found = formatted;
        }
    });

    if (found) return found;

    walkObject(root, (node) => {
        if (found) return;
        if (!isObject(node)) return;

        const formatted = formatBowler(node);
        if (formatted && /[\w.]+\s+\(\d+\/\d+\)/.test(formatted)) {
            found = formatted;
        }
    });

    return found;
}

function getVenue(root) {
    const venue =
        getStringFromAny(root, ['venue', 'stadium', 'ground', 'venue_name', 'venueName']) ||
        null;
    return venue;
}

function getToss(root, fallbackText) {
    const direct =
        getStringFromAny(root, ['toss']) ||
        null;

    if (direct && /bat|bowl|field|won the toss|opt/i.test(direct)) return direct;

    const fromText = extractTossFromText(fallbackText);
    return fromText || null;
}

function getStatus(root, fallbackText) {
    const direct =
        getStringFromAny(root, ['status', 'matchstatus', 'match_state', 'state', 'matchstate']) ||
        null;

    if (direct) return direct;

    const text = cleanText(fallbackText);
    const patterns = [
        /need\s+\d+\s+runs?\s+in\s+\d+\s+balls?/i,
        /innings break/i,
        /won by/i,
        /yet to begin/i,
        /starts at/i
    ];

    for (const p of patterns) {
        const m = text.match(p);
        if (m) return m[0];
    }

    return 'Live Match Active';
}

function determineMatchState(statusText) {
    const t = cleanText(statusText).toLowerCase();

    if (t.includes('yet to begin') || t.includes('starts at')) return 'future';
    if (t.includes('won by') || t.includes('tied') || t.includes('abandoned') || t.includes('result')) return 'completed';
    return 'live';
}

function derivePrediction(liveScore, currentRR, wickets, requiredRR, isSecondInnings) {
    const crr = toFloat(currentRR) || 0;
    const wk = toInt(wickets) || 0;
    const rrr = toFloat(requiredRR) || 0;

    let tactic = '🟡 HOLD - STANDARD ACCUMULATION';

    if (wk >= 6 || (wk >= 4 && crr < 7.4)) {
        tactic = '🔴 EAT (LAY) - COLLAPSING PATTERN';
    } else if (crr >= 9.6 && wk <= 2) {
        tactic = '🟢 PLAY (BACK) - HIGH AGGRESSION';
    }

    if (isSecondInnings) {
        return `CHASE ORACLE | PHASE MARKETS CLOSED\nTACTIC: ${tactic}`;
    }

    return `LIVE ORACLE | PHASE MARKETS CLOSED\nTACTIC: ${tactic}`;
}

function deriveOdds(root, fallbackText, activeTeam) {
    let odds = extractOddsFromObject(root);

    if (!odds) {
        odds = extractOddsFromText(fallbackText);
    }

    if (!odds) return null;

    let favTeam = cleanText(odds.favTeam || '');
    if (!favTeam) favTeam = activeTeam || 'UNKNOWN';

    return {
        favTeam,
        backPaise: odds.backPaise,
        layPaise: odds.layPaise
    };
}

function parseRecentCommentaryBalls(root) {
    const recent = getStringFromAny(root, ['recent_balls', 'recentballs', 'last_over', 'lastover', 'over_balls', 'overballs']);
    if (recent && /\d|W|Wd|Nb|-/.test(recent)) {
        const parts = recent.split(/\s+/).filter(Boolean);
        const compact = parts.filter(t => /^(W|Wd|Nb|-|[0-6])$/i.test(t));
        if (compact.length >= 2) return compact.slice(-6);
    }

    let commentaryArray = null;
    walkObject(root, (node) => {
        if (commentaryArray) return;
        if (!Array.isArray(node)) return;

        const hasCommentaryLikeObjects = node.some(item => isObject(item) && (
            'commentary' in item ||
            'text' in item ||
            'ball' in item ||
            'over' in item
        ));

        if (hasCommentaryLikeObjects) commentaryArray = node;
    });

    if (Array.isArray(commentaryArray)) {
        const recentBalls = [];
        for (const item of commentaryArray) {
            if (!isObject(item)) continue;
            const txt = cleanText(item.text || item.commentary || item.ball || item.short || '');
            if (!txt) continue;

            const m = txt.match(/\b(Wd|Nb|W|[0-6])\b/);
            if (m) recentBalls.push(m[1]);
        }

        if (recentBalls.length >= 2) {
            return recentBalls.slice(-6);
        }
    }

    return null;
}

// =========================================================================================
// [SECTION 2] MAIN HANDLER
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

    let payload = {
        title: "GT VS RCB | GRAND FINAL",
        status: "Initializing...",
        match_state: "standby",
        winner: "PENDING",
        live_score: "NO SCORE",
        current_rr: "0.00",
        required_rr: "0.00",
        bat_1: "NO STRIKER",
        bat_2: "NO NON-STRIKER",
        bowler: "NO BOWLER",
        toss: "NO TOSS DATA",
        venue: "Narendra Modi Stadium, Ahmedabad",
        last_over: ["-", "-", "-", "-", "-", "-"],
        prediction: "AI STANDBY",
        match_prediction: "AWAITING CORE INITIALIZATION",
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
    const pageTitle = cleanText($('title').text());

    // =========================================================================================
    // [SECTION 3] STRUCTURED STATE EXTRACTION FROM SCRIPTS
    // =========================================================================================

    let parsedState = null;
    const allScripts = $('script')
        .map((_, el) => $(el).html() || '')
        .get()
        .filter(Boolean);

    for (const scriptText of allScripts) {
        if (
            scriptText.includes('window.__INITIAL_STATE__') ||
            scriptText.includes('__INITIAL_STATE__') ||
            scriptText.includes('matchData') ||
            scriptText.includes('inningsData')
        ) {
            const marker = scriptText.includes('window.__INITIAL_STATE__')
                ? 'window.__INITIAL_STATE__'
                : '__INITIAL_STATE__';

            const objText = extractBalancedObject(scriptText, marker);
            if (objText) {
                parsedState = safeJsonLikeParse(objText);
                if (parsedState) break;
            }
        }
    }

    const state = chooseBestStateObject(parsedState || {});
    const fallbackText = cleanText(htmlData);

    // =========================================================================================
    // [SECTION 4] CORE FIELD EXTRACTION
    // =========================================================================================

    payload.title =
        getStringFromAny(state, ['title']) ||
        pageTitle ||
        payload.title;

    payload.status =
        getStatus(state, fallbackText) ||
        payload.status;

    payload.match_state = determineMatchState(payload.status);

    if (payload.match_state === 'completed') {
        const winMatch = payload.status.match(/^(.*?)\s+won by/i);
        if (winMatch) payload.winner = cleanText(winMatch[1]).toUpperCase();
    }

    payload.venue =
        getVenue(state) ||
        payload.venue;

    payload.toss =
        getToss(state, fallbackText) ||
        payload.toss;

    // live score
    const liveScoreFromState = buildLiveScoreFromState(state);
    const liveScoreFromTitle = extractLiveScoreFromText(pageTitle);
    const liveScore = liveScoreFromState ||
        (liveScoreFromTitle ? `${liveScoreFromTitle.team} ${liveScoreFromTitle.runs}/${liveScoreFromTitle.wickets} (${liveScoreFromTitle.overs})` : null);

    payload.live_score = liveScore || payload.live_score;

    // current / required run rate
    payload.current_rr = getCurrentRR(state, payload.live_score) || payload.current_rr;
    payload.required_rr = getRequiredRR(state) || (payload.match_state === 'live' ? "1st Innings" : payload.required_rr);

    const batsmen = getBatters(state);
    if (batsmen.length > 0) {
        const striker = batsmen.find(b => b.isStriker) || batsmen[0];
        const nonStriker = batsmen.find(b => b !== striker) || batsmen[1];

        payload.bat_1 = striker ? `${striker.text} 🏏` : payload.bat_1;
        payload.bat_2 = nonStriker ? nonStriker.text : payload.bat_2;
    }

    const bowler = getBowler(state);
    if (bowler) payload.bowler = bowler;

    const recentBalls = parseRecentCommentaryBalls(state);
    if (recentBalls && recentBalls.length >= 2) {
        payload.last_over = recentBalls;
        while (payload.last_over.length < 6) payload.last_over.push('-');
    }

    // =========================================================================================
    // [SECTION 5] ODDS EXTRACTION
    // =========================================================================================

    const odds = deriveOdds(state, fallbackText, normalizeTeamToken(payload.live_score.split(' ')[0]));

    if (odds && odds.backPaise > 0 && odds.layPaise > 0) {
        payload.match_prediction = `[LIVE MARKET ODDS] ${odds.favTeam || 'UNKNOWN'} is Favorite at ${odds.backPaise}-${odds.layPaise} Paise`;
    } else {
        payload.match_prediction = `[LIVE MARKET ODDS] Unavailable`;
    }

    // =========================================================================================
    // [SECTION 6] SIMPLE LIVE TACTIC / LEDGER ANALYSIS
    // =========================================================================================

    const wicketsMatch = payload.live_score.match(/\/(\d+)\s*\(/);
    const wickets = wicketsMatch ? toInt(wicketsMatch[1]) || 0 : 0;
    const crr = toFloat(payload.current_rr) || 0;
    const isSecondInnings = payload.match_state === 'live' && payload.required_rr !== '1st Innings';

    payload.prediction = derivePrediction(payload.live_score, payload.current_rr, wickets, payload.required_rr, isSecondInnings);

    const canonicalFav = normalizeTeamToken(odds?.favTeam || '');
    const canonicalT1 = normalizeTeamToken(clientStringTeam1);
    const canonicalT2 = normalizeTeamToken(clientStringTeam2);

    let hedgeAdvice = '';
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

    if (ledgerExposureTeam1 === 0 && ledgerExposureTeam2 === 0) {
        hedgeAdvice = `[ENTRY PROTOCOL] No active ledger. Wait for entry signals.`;
    } else if (odds && mappedFavExposure > 0 && mappedOppExposure < 0) {
        const liabilityTarget = Math.abs(mappedOppExposure);
        const layTaxCost = liabilityTarget * (odds.layPaise / 100);
        const finalNetSecuredProfit = mappedFavExposure - layTaxCost;

        if (finalNetSecuredProfit > 0) {
            hedgeAdvice = `🟢 [GREEN BOOK AVAILABLE]\nTo clear -${Math.abs(mappedOppExposure).toFixed(0)} on ${oppTeamName}:\n> LAY ${odds.favTeam} at ${odds.layPaise}p.\n> FINAL BOOK: +${finalNetSecuredProfit.toFixed(0)}`;
        } else {
            hedgeAdvice = `🟡 [HEDGE PENDING] Wait for ${odds.favTeam} odds to drop lower to secure net profit.`;
        }
    } else if (odds && mappedFavExposure < 0 && mappedOppExposure > 0) {
        const backCoverStake = Math.abs(mappedFavExposure) / (odds.backPaise / 100);
        const finalNetSecuredProfit = mappedOppExposure - backCoverStake;

        if (finalNetSecuredProfit > 0) {
            hedgeAdvice = `🟢 [GREEN BOOK AVAILABLE]\nTo clear -${Math.abs(mappedFavExposure).toFixed(0)} on ${odds.favTeam}:\n> BACK ${odds.favTeam} at ${odds.backPaise}p.\n> FINAL BOOK: +${finalNetSecuredProfit.toFixed(0)}`;
        } else {
            hedgeAdvice = `🟡 [HEDGE PENDING] Wait for ${odds.favTeam} odds to drift higher to secure net profit.`;
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
