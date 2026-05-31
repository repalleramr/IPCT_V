// =========================================================================================
// CREX LIVE SCRAPER - GT vs RCB
// Version: 21.0.0
// Clean section parsing, stronger bowler extraction, odds scan from visible text + scripts
// =========================================================================================

const axios = require('axios');
const cheerio = require('cheerio');
const vm = require('vm');

// =========================================================================================
// BASIC HELPERS
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

function pad2(value) {
    const s = String(value ?? '').trim();
    if (/^\d$/.test(s)) return `0${s}`;
    return s;
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
            if (depth === 0) return source.slice(start, i + 1);
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

function normalizeTeamToken(name) {
    const n = cleanText(name).toLowerCase();
    if (n.includes('gujarat') || n.includes('titans') || n === 'gt') return 'GT';
    if (n.includes('rcb') || n.includes('royal challengers') || n.includes('bengaluru') || n.includes('bangalore')) return 'RCB';
    return cleanText(name).toUpperCase();
}

function htmlToLines(html) {
    let s = String(html || '');

    s = s
        .replace(/<\s*br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|li|tr|td|th|h1|h2|h3|h4|h5|h6|section|article|header|footer|table|tbody|thead|tfoot|ul|ol)>/gi, '\n')
        .replace(/<[^>]+>/g, ' ');

    return s
        .split(/\n+/g)
        .map(cleanText)
        .filter(Boolean);
}

function dedupeByKey(items, keyFn) {
    const seen = new Set();
    const out = [];
    for (const item of items) {
        const key = keyFn(item);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(item);
    }
    return out;
}

function sectionBetween(lines, startRegex, endRegex) {
    const start = lines.findIndex(line => startRegex.test(line));
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

function joinSection(lines) {
    return lines.map(cleanText).filter(Boolean).join(' ');
}

function extractTitle($, lines) {
    const title = cleanText($('title').text());
    if (title && !/Please enable JavaScript/i.test(title) && title.length < 140) {
        return title;
    }

    for (const line of lines.slice(0, 25)) {
        if (/GT\s+vs\s+RCB|RCB\s+vs\s+GT/i.test(line) && /Final|T20|IPL/i.test(line)) {
            return cleanText(line);
        }
    }

    return 'GT vs RCB, Final T20';
}

function extractVenue(state, lines) {
    const fromState = cleanText(findFirstValueByKeys(state, ['venue', 'stadium', 'ground', 'venue_name', 'venuename']) || '');
    if (fromState) return fromState;

    for (const line of lines) {
        if (/Narendra Modi Stadium/i.test(line)) return 'Narendra Modi Stadium, Ahmedabad';
    }

    return 'Narendra Modi Stadium, Ahmedabad';
}

function extractToss(lines, fallbackText) {
    for (const line of lines) {
        if (/toss/i.test(line) && /(opt(?:ed|s)? to|chose to|elect(?:ed|s)? to|decided to)\s+(bat|bowl|field)/i.test(line)) {
            return cleanText(line);
        }
    }

    const m = cleanText(fallbackText).match(/(.*toss.*(?:opt(?:ed|s)? to|chose to|elect(?:ed|s)? to|decided to)\s+(?:bat|bowl|field).*)/i);
    return m ? cleanText(m[1]) : 'UNAVAILABLE';
}

function extractScoreLine(lines) {
    for (const line of lines) {
        if (/need\s+\d+\s+runs?\s+in\s+\d+\s+balls?/i.test(line)) continue;

        const m = line.match(/\b(GT|RCB)\s+(\d{1,3})\s*[-/]\s*(\d{1,2})\s*\(?(\d+(?:\.\d+)?)\)?\b/i);
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

function extractNeedLine(lines) {
    for (const line of lines) {
        const m = line.match(/\b(GT|RCB)\s+need\s+(\d+)\s+runs?\s+in\s+(\d+)\s+balls?/i);
        if (m) {
            return {
                team: m[1].toUpperCase(),
                runsNeeded: toInt(m[2]),
                balls: toInt(m[3]),
                raw: cleanText(line)
            };
        }
    }
    return null;
}

function extractCRR(lines, state) {
    for (const line of lines) {
        const m = line.match(/CRR\s*[:\-]?\s*(\d+(?:\.\d+)?)/i);
        if (m) return m[1];
    }

    const direct = findFirstValueByKeys(state, ['current_rr', 'crr', 'currentrunrate', 'current_run_rate']);
    if (direct !== undefined && direct !== null && direct !== '') {
        const n = toFloat(direct);
        if (n !== null) return n.toFixed(2);
    }

    return '0.00';
}

function extractRRR(lines, state) {
    for (const line of lines) {
        const m = line.match(/RRR\s*[:\-]?\s*(\d+(?:\.\d+)?)/i);
        if (m) return m[1];
    }

    const direct = findFirstValueByKeys(state, ['required_rr', 'rrr', 'requiredrunrate', 'required_run_rate']);
    if (direct !== undefined && direct !== null && direct !== '') {
        const n = toFloat(direct);
        if (n !== null) return n.toFixed(2);
    }

    return '1st Innings';
}

function extractBatsmen(lines, state, fallbackText) {
    const scorecard = sectionBetween(
        lines,
        /^(Match info|Live|Scorecard)$/i,
        /^(Bowler|Commentary|Projected Score|P'ship|Last Wkt|Last Wicket)$/i
    );

    let text = joinSection(scorecard);
    if (!text) {
        const direct = cleanText(findFirstValueByKeys(state, ['batsmen', 'batters', 'currentbatsmen', 'current_batsmen', 'batter']) || '');
        text = direct || cleanText(fallbackText);
    }

    const regex = /([A-Z][A-Za-z.'\-]+(?:\s+[A-Z][A-Za-z.'\-]+){1,2})\s+(\d+)\s*\(\s*(\d+)\s*\)/g;
    const items = [];
    let m;

    while ((m = regex.exec(text)) !== null) {
        const name = cleanText(m[1]);
        const runs = toInt(m[2]);
        const balls = toInt(m[3]);

        if (!name || runs === null || balls === null) continue;
        if (/^(Over|Batter|Batters|Bowler|Match|Commentary|Projected|Last|CRR|RRR)$/i.test(name)) continue;

        items.push({ name, runs, balls });
    }

    return dedupeByKey(items, x => x.name.toLowerCase()).slice(0, 2);
}

function extractBowlerFromText(text) {
    // Handles both "Rashid Khan 2-14" and "Rashid Khan 2-14(3.5)"
    const regex = /([A-Z][A-Za-z.'\-]+(?:\s+[A-Z][A-Za-z.'\-]+){1,2})\s+(\d+\s*-\s*\d+(?:\(\d+(?:\.\d+)?\))?|\d+\s*\/\s*\d+(?:\(\d+(?:\.\d+)?\))?)/g;

    const hits = [];
    let m;
    while ((m = regex.exec(text)) !== null) {
        const name = cleanText(m[1]);
        const fig = cleanText(m[2]).replace(/\s+/g, '');
        if (!name || !fig) continue;
        if (/^(Over|Batter|Batters|Bowler|Commentary|Projected|Last|CRR|RRR|Match)$/i.test(name)) continue;
        if (!/\d+[-/]\d+/.test(fig)) continue;
        hits.push(`${name} (${fig})`);
    }

    return hits[0] || '';
}

function extractBowler(lines, state, fallbackText) {
    // Primary: dedicated Bowler block with name on its own line, figure on next line.
    for (let i = 0; i < lines.length; i++) {
        if (!/^Bowler$/i.test(cleanText(lines[i]))) continue;

        let name = '';
        let figure = '';

        for (let j = i + 1; j < Math.min(i + 14, lines.length); j++) {
            const t = cleanText(lines[j]);

            if (
                !t ||
                /^(Econ|Overs|SR|CRR|RRR|P'ship|Partnership|Last Wkt|Last Wicket|Commentary|Projected Score|Match info|Live|Scorecard)$/i.test(t)
            ) {
                continue;
            }

            if (!name && /^[A-Z][A-Za-z.'\-]+(?:\s+[A-Z][A-Za-z.'\-]+){1,2}$/.test(t)) {
                name = t;
                continue;
            }

            if (!figure && /^\d+\s*[-/]\s*\d+(?:\(\d+(?:\.\d+)?\))?$/.test(t)) {
                figure = t.replace(/\s+/g, '');
                break;
            }
        }

        if (name && figure) {
            return `${name} (${figure})`;
        }
    }

    // Secondary: try to parse from the bowler section text
    const bowlerSection = sectionBetween(
        lines,
        /^Bowler$/i,
        /^(Commentary|Projected Score|P'ship|Last Wkt|Last Wicket)$/i
    );
    const sectionText = joinSection(bowlerSection);
    const fromSection = extractBowlerFromText(sectionText);
    if (fromSection) return fromSection;

    // Tertiary: state object
    const direct = cleanText(findFirstValueByKeys(state, ['bowler', 'currentbowler', 'lastbowler', 'bowling']) || '');
    if (direct) {
        const fromState = extractBowlerFromText(direct);
        if (fromState) return fromState;
    }

    // Final fallback: full text
    const fromFallback = extractBowlerFromText(cleanText(fallbackText));
    if (fromFallback) return fromFallback;

    return 'UNAVAILABLE';
}

function extractLastOver(lines, state, fallbackText) {
    const joined = lines.join(' ');

    // Capture explicit over blocks like:
    // Over 12 0 4 1 1 0 1 = 7
    const overRegex = /Over\s+\d+\s+((?:(?:Wd|Nb|W|[0-6])\s+){1,12})=\s*\d+/gi;
    const matches = [...joined.matchAll(overRegex)];

    if (matches.length) {
        const raw = matches[matches.length - 1][1];
        const balls = raw
            .trim()
            .split(/\s+/)
            .filter(t => /^(Wd|Nb|W|[0-6])$/i.test(t));
        if (balls.length >= 2) return balls.slice(-6);
    }

    // State array fallback
    let found = null;
    walkObject(state, (node) => {
        if (found) return;
        if (!Array.isArray(node)) return;

        const balls = node
            .map(item => {
                if (typeof item === 'string') return cleanText(item);
                if (typeof item === 'number') return String(item);
                if (isObject(item)) return cleanText(item.result || item.ball || item.short || item.text || item.value || item.runs || item.outcome || '');
                return '';
            })
            .filter(Boolean)
            .filter(t => /^(Wd|Nb|W|[0-6])$/i.test(t));

        if (balls.length >= 2) found = balls.slice(-6);
    });

    if (found) return found;

    // Loose fallback
    const loose = cleanText(fallbackText);
    const looseMatches = [...loose.matchAll(/Over\s+\d+\s+((?:[WdNbW0-6]\s*){2,12})/gi)];
    if (looseMatches.length) {
        const raw = looseMatches[looseMatches.length - 1][1];
        const balls = raw.split(/\s+/).filter(t => /^(Wd|Nb|W|[0-6])$/i.test(t));
        if (balls.length >= 2) return balls.slice(-6);
    }

    return ['-', '-', '-', '-', '-', '-'];
}

function extractOddsFromText(text) {
    // Accept only tiny market chips near team labels.
    // Example expected: "RCB 04 05"
    const lines = Array.isArray(text) ? text : String(text || '').split(/\n+/g);

    for (const rawLine of lines) {
        const line = cleanText(rawLine);
        if (!line) continue;

        // Preferred exact team chip pattern
        let m = line.match(/\b(RCB|GT)\b[^0-9]{0,35}(\d{1,2})\s+(\d{1,2})\b/i);
        if (m) {
            const a = toInt(m[2]);
            const b = toInt(m[3]);
            if (a !== null && b !== null && a <= 20 && b <= 20) {
                return {
                    favTeam: m[1].toUpperCase(),
                    backPaise: pad2(Math.min(a, b)),
                    layPaise: pad2(Math.max(a, b))
                };
            }
        }

        // Slightly looser fallback
        m = line.match(/\b(RCB|GT)\b.*?\b(0?\d)\s+(0?\d)\b/i);
        if (m) {
            const a = toInt(m[2]);
            const b = toInt(m[3]);
            if (a !== null && b !== null && a <= 20 && b <= 20) {
                return {
                    favTeam: m[1].toUpperCase(),
                    backPaise: pad2(Math.min(a, b)),
                    layPaise: pad2(Math.max(a, b))
                };
            }
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

        const backN = toInt(back);
        const layN = toInt(lay);

        if (backN !== null && layN !== null && backN <= 20 && layN <= 20) {
            found = {
                favTeam: cleanText(fav) || '',
                backPaise: pad2(Math.min(backN, layN)),
                layPaise: pad2(Math.max(backN, layN))
            };
        }
    });

    return found;
}

function getMatchState(statusText) {
    const t = cleanText(statusText).toLowerCase();
    if (t.includes('yet to begin') || t.includes('starts at') || t.includes('scheduled')) return 'future';
    if (t.includes('won by') || t.includes('tied') || t.includes('abandoned') || t.includes('result')) return 'completed';
    return 'live';
}

function parseWickets(liveScore) {
    const m = cleanText(liveScore).match(/\b\d+\s*[-/]\s*(\d+)\s*\(/);
    return m ? (toInt(m[1]) || 0) : 0;
}

function buildPrediction(matchState, isSecondInnings, currentRR, wickets) {
    const crr = toFloat(currentRR) || 0;
    const wk = toInt(wickets) || 0;

    let tactic = '🟡 HOLD - STANDARD ACCUMULATION';

    if (wk >= 6 || (wk >= 4 && crr < 7.4)) {
        tactic = '🔴 EAT (LAY) - COLLAPSING PATTERN';
    } else if (crr >= 9.6 && wk <= 2) {
        tactic = '🟢 PLAY (BACK) - HIGH AGGRESSION';
    }

    if (matchState === 'future') return 'MATCH NOT STARTED';
    if (matchState === 'completed') return 'MATCH COMPLETED';
    if (isSecondInnings) return `CHASE ORACLE | PHASE MARKETS CLOSED\nTACTIC: ${tactic}`;
    return `LIVE ORACLE | PHASE MARKETS CLOSED\nTACTIC: ${tactic}`;
}

function isSecondInningsFromStatus(statusText, requiredRR) {
    if (requiredRR === '1st Innings') return false;
    if (/need\s+\d+\s+runs?\s+in\s+\d+\s+balls?/i.test(statusText)) return true;
    return false;
}

function buildLedgerAnalysis(ledgerExposureTeam1, ledgerExposureTeam2, odds, clientStringTeam1, clientStringTeam2) {
    if (!odds) return '[ENTRY PROTOCOL] No active ledger. Wait for entry signals.';

    const canonicalFav = normalizeTeamToken(odds.favTeam || '');
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

    if (ledgerExposureTeam1 === 0 && ledgerExposureTeam2 === 0) {
        return '[ENTRY PROTOCOL] No active ledger. Wait for entry signals.';
    }

    if (mappedFavExposure > 0 && mappedOppExposure < 0) {
        const liabilityTarget = Math.abs(mappedOppExposure);
        const layTaxCost = liabilityTarget * (toInt(odds.layPaise) / 100);
        const finalNetSecuredProfit = mappedFavExposure - layTaxCost;

        if (finalNetSecuredProfit > 0) {
            return `🟢 [GREEN BOOK AVAILABLE]\nTo clear -${Math.abs(mappedOppExposure).toFixed(0)} on ${oppTeamName}:\n> LAY ${odds.favTeam} at ${odds.layPaise}p.\n> FINAL BOOK: +${finalNetSecuredProfit.toFixed(0)}`;
        }
        return `🟡 [HEDGE PENDING] Wait for ${odds.favTeam} odds to improve.`;
    }

    if (mappedFavExposure < 0 && mappedOppExposure > 0) {
        const backCoverStake = Math.abs(mappedFavExposure) / (toInt(odds.backPaise) / 100);
        const finalNetSecuredProfit = mappedOppExposure - backCoverStake;

        if (finalNetSecuredProfit > 0) {
            return `🟢 [GREEN BOOK AVAILABLE]\nTo clear -${Math.abs(mappedFavExposure).toFixed(0)} on ${odds.favTeam}:\n> BACK ${odds.favTeam} at ${odds.backPaise}p.\n> FINAL BOOK: +${finalNetSecuredProfit.toFixed(0)}`;
        }
        return `🟡 [HEDGE PENDING] Wait for ${odds.favTeam} odds to drift.`;
    }

    if (mappedFavExposure >= 0 && mappedOppExposure >= 0) {
        return `✅ [BOOK SCAN OK] ${odds.favTeam} @ ${odds.backPaise}-${odds.layPaise}p`;
    }

    return '✅ [BOOK SCAN OK] Odds unavailable';
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

    const exactFinalUrl = 'https://crex.com/cricket-live-score/gt-vs-rcb-final-indian-premier-league-2026-match-updates-11XM';

    let operationalTargetUrl = req.query.url || exactFinalUrl;
    operationalTargetUrl = String(operationalTargetUrl).replace('crex.live', 'crex.com');

    const ledgerExposureTeam1 = parseFloat(req.query.e1) || 0;
    const ledgerExposureTeam2 = parseFloat(req.query.e2) || 0;
    const clientStringTeam1 = (req.query.t1 || 'GUJARAT TITANS').trim();
    const clientStringTeam2 = (req.query.t2 || 'ROYAL CHALLENGERS BENGALURU').trim();

    const SECURE_BROWSER_HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache'
    };

    const payload = {
        title: 'GT vs RCB, Final T20',
        status: 'Initializing...',
        match_state: 'standby',
        winner: 'PENDING',
        live_score: 'NO SCORE',
        current_rr: '0.00',
        required_rr: '0.00',
        bat_1: 'UNAVAILABLE',
        bat_2: 'UNAVAILABLE',
        bowler: 'UNAVAILABLE',
        toss: 'UNAVAILABLE',
        venue: 'Narendra Modi Stadium, Ahmedabad',
        last_over: ['-', '-', '-', '-', '-', '-'],
        prediction: 'AWAITING DATA',
        match_prediction: 'UNAVAILABLE',
        ledger_analysis: 'AWAITING LEDGER SYNC',
        source_url: 'CREX (Pin-to-Pin DOM Engine)',
        fetch_code: 'OH'
    };

    let htmlData = null;

    try {
        const fetchUrl = operationalTargetUrl.includes('?')
            ? `${operationalTargetUrl}&_t=${Date.now()}`
            : `${operationalTargetUrl}?_t=${Date.now()}`;

        const response = await axios.get(fetchUrl, {
            headers: SECURE_BROWSER_HEADERS,
            timeout: 9000,
            maxRedirects: 3
        });

        if (response.data && String(response.data).length > 500) {
            htmlData = String(response.data);
            payload.fetch_code = 'UREKHA';
        } else {
            throw new Error('Empty payload returned from CREX');
        }
    } catch (networkError) {
        payload.status = 'UPLINK FAILURE: TIMEOUT OR BLOCK';
        payload.live_score = 'ERROR: Node Unreachable';
        return res.status(200).json({
            success: false,
            error: networkError.message,
            match_info: payload
        });
    }

    const $ = cheerio.load(htmlData);
    const bodyHtml = $('body').html() || htmlData;
    const lines = htmlToLines(bodyHtml);
    const fallbackText = cleanText($('body').text() || htmlData);

    // Structured state if available
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

    // Core fields
    payload.title = extractTitle($, lines);

    const needObj = extractNeedLine(lines);
    payload.status = needObj ? needObj.raw : (cleanText(payload.status) === 'Initializing...' ? 'Live Match Active' : cleanText(payload.status));
    if (needObj) payload.status = needObj.raw;

    payload.match_state = getMatchState(payload.status);

    if (payload.match_state === 'completed') {
        const winMatch = payload.status.match(/^(.*?)\s+won by/i);
        if (winMatch) payload.winner = cleanText(winMatch[1]).toUpperCase();
    }

    payload.venue = extractVenue(state, lines);
    payload.toss = extractToss(lines, fallbackText);

    const scoreObj = extractScoreLine(lines);
    if (scoreObj) {
        payload.live_score = `${scoreObj.team} ${scoreObj.runs}/${scoreObj.wickets} (${scoreObj.overs})`;
    } else {
        const stateLive = cleanText(findFirstValueByKeys(state, ['live_score', 'livescore', 'scoreline', 'score_text']) || '');
        if (stateLive && /\d/.test(stateLive)) payload.live_score = stateLive;
    }

    payload.current_rr = extractCRR(lines, state);
    payload.required_rr = extractRRR(lines, state);

    const batsmen = extractBatsmen(lines, state, fallbackText);
    if (batsmen.length >= 1) payload.bat_1 = `${batsmen[0].name} ${batsmen[0].runs}(${batsmen[0].balls})`;
    if (batsmen.length >= 2) payload.bat_2 = `${batsmen[1].name} ${batsmen[1].runs}(${batsmen[1].balls})`;

    payload.bowler = extractBowler(lines, state, fallbackText);

    const lastOver = extractLastOver(lines, state, fallbackText);
    if (lastOver && lastOver.length) {
        payload.last_over = lastOver.slice(-6);
        while (payload.last_over.length < 6) payload.last_over.unshift('-');
    }

    // Odds: scan visible text first, then scripts/state
    const pageTextLines = [
        ...lines,
        ...scripts.map(cleanText).filter(Boolean)
    ];

    let odds = extractOddsFromText(pageTextLines) || extractOddsFromState(state);

    if (odds && odds.favTeam && odds.backPaise && odds.layPaise) {
        payload.match_prediction = `[LIVE MARKET ODDS] ${odds.favTeam} is Favorite at ${odds.backPaise}-${odds.layPaise} Paise`;
    } else {
        payload.match_prediction = '[LIVE MARKET ODDS] Unavailable';
    }

    const wickets = parseWickets(payload.live_score);
    const secondInnings = isSecondInningsFromStatus(payload.status, payload.required_rr);
    payload.prediction = buildPrediction(payload.match_state, secondInnings, payload.current_rr, wickets);
    payload.ledger_analysis = buildLedgerAnalysis(ledgerExposureTeam1, ledgerExposureTeam2, odds, clientStringTeam1, clientStringTeam2);

    return res.status(200).json({
        success: true,
        match_info: payload
    });
};
