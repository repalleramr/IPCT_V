// =========================================================================================
// CREX LIVE PIN-TO-PIN EXTRACTOR
// Version: 19.0.0 | Clean Visible-Text Scorecard Parser + Odds Chip Reader
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

function linesFromHtml(html) {
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

function findScoreLine(lines) {
    for (const line of lines) {
        if (/need\s+\d+\s+runs?\s+in\s+\d+\s+balls?/i.test(line)) continue;

        const m = line.match(/\b(GT|RCB)\s+(\d{1,3})\s*[-/]\s*(\d{1,2})\s*\(?(\d{1,2}(?:\.\d)?)\)?\b/i);
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

function findNeedLine(lines) {
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

function findTitle($, lines) {
    const raw = cleanText($('title').text());

    if (raw && raw.length <= 80 && !/CREX Home|Commentary|Scorecard|Stats|Rankings|News/i.test(raw)) {
        return raw;
    }

    for (const line of lines.slice(0, 20)) {
        if (/GT\s+vs\s+RCB|RCB\s+vs\s+GT/i.test(line) && /Final|T20/i.test(line)) {
            return cleanText(line);
        }
    }

    return 'GT vs RCB, Final T20';
}

function findVenue(root, lines) {
    const direct = cleanText(findFirstValueByKeys(root, ['venue', 'stadium', 'ground', 'venue_name', 'venuename']) || '');
    if (direct) return direct;

    for (const line of lines) {
        if (/Narendra Modi Stadium/i.test(line)) return 'Narendra Modi Stadium, Ahmedabad';
    }
    return 'Narendra Modi Stadium, Ahmedabad';
}

function findToss(lines, fallbackText) {
    for (const line of lines) {
        if (/toss/i.test(line) && /(opt(?:ed|s)? to|chose to|elect(?:ed|s)? to|decided to)\s+(bat|bowl|field)/i.test(line)) {
            return cleanText(line);
        }
    }

    const m = cleanText(fallbackText).match(/(.*toss.*(?:opt(?:ed|s)? to|chose to|elect(?:ed|s)? to|decided to)\s+(?:bat|bowl|field).*)/i);
    return m ? cleanText(m[1]) : 'UNAVAILABLE';
}

function extractBatterRowsFromText(text) {
    const rows = [];
    const seen = new Set();

    const regex = /([A-Z][A-Za-z.'\-]+(?:\s+[A-Z][A-Za-z.'\-]+){0,2})\s*(\d+)\s*\(\s*(\d+)\s*\)/g;
    let m;

    while ((m = regex.exec(text)) !== null) {
        const name = cleanText(m[1]);
        const runs = toInt(m[2]);
        const balls = toInt(m[3]);
        const key = `${name}|${runs}|${balls}`;

        if (!name || runs === null || balls === null) continue;
        if (/^Over\s+\d+/i.test(name)) continue;
        if (seen.has(key)) continue;

        seen.add(key);
        rows.push({ name, runs, balls });
    }

    return rows;
}

function extractBatsmen(lines, root, fallbackText) {
    const scorecardSection = sectionBetween(
        lines,
        /^(batter|batters|batsman|batsmen)\b/i,
        /^(bowler|partnership|p'ship|last wkt|last wicket|recent|commentary|overs|match info|scorecard)\b/i
    );

    let rows = [];

    if (scorecardSection.length) {
        const joined = scorecardSection.join(' ');
        rows = extractBatterRowsFromText(joined);
    }

    if (!rows.length) {
        const directText = cleanText(
            findFirstValueByKeys(root, ['batsmen', 'batters', 'currentbatsmen', 'current_batsmen', 'batter']) || ''
        );
        if (directText) rows = extractBatterRowsFromText(directText);
    }

    if (!rows.length) {
        rows = extractBatterRowsFromText(fallbackText);
    }

    return rows.slice(0, 2);
}

function extractBowlerFromText(text) {
    const seen = new Set();
    const rows = [];

    const regex = /([A-Z][A-Za-z.'\-]+(?:\s+[A-Z][A-Za-z.'\-]+){0,2})\s+(\d+\s*[-/]\s*\d+)\b/g;
    let m;

    while ((m = regex.exec(text)) !== null) {
        const name = cleanText(m[1]);
        const fig = cleanText(m[2]).replace(/\s+/g, '');
        const key = `${name}|${fig}`;

        if (!name || seen.has(key)) continue;
        if (/^(Over|Batter|Bowler|CRR|RRR|Target)$/i.test(name)) continue;
        if (!/^\d+[-/]\d+$/.test(fig)) continue;

        seen.add(key);
        rows.push(`${name} (${fig})`);
    }

    return rows[0] || '';
}

function extractBowler(lines, root, fallbackText) {
    const bowlerSection = sectionBetween(
        lines,
        /^(bowler)\b/i,
        /^(commentary|overs|match info|scorecard|partnership|p'ship|batter|batters|last wkt|last wicket)\b/i
    );

    if (bowlerSection.length) {
        const joined = bowlerSection.join(' ');
        const found = extractBowlerFromText(joined);
        if (found) return found;
    }

    const directText = cleanText(
        findFirstValueByKeys(root, ['bowler', 'currentbowler', 'lastbowler', 'bowling']) || ''
    );
    if (directText) {
        const found = extractBowlerFromText(directText);
        if (found) return found;
    }

    const fallback = extractBowlerFromText(fallbackText);
    if (fallback) return fallback;

    return 'UNAVAILABLE';
}

function extractLastOver(lines, root, fallbackText) {
    const text = lines.join(' ');

    const overPattern = /Over\s+\d+\s+((?:(?:Wd|Nb|W|[0-6])\s+){1,12})=\s*\d+/gi;
    const matches = [...text.matchAll(overPattern)];

    if (matches.length) {
        const last = matches[matches.length - 1][1];
        const balls = last
            .trim()
            .split(/\s+/)
            .filter(t => /^(Wd|Nb|W|[0-6])$/i.test(t));
        if (balls.length >= 2) return balls.slice(-6);
    }

    // Try direct state arrays
    let found = null;
    walkObject(root, (node) => {
        if (found) return;
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
            .filter(t => /^(Wd|Nb|W|[0-6])$/i.test(t));

        if (balls.length >= 2) found = balls.slice(-6);
    });

    if (found) return found;

    const fallbackMatches = [...cleanText(fallbackText).matchAll(/Over\s+\d+\s+((?:[WdNbW0-6]\s*){2,12})/gi)];
    if (fallbackMatches.length) {
        const last = fallbackMatches[fallbackMatches.length - 1][1];
        const balls = last.split(/\s+/).filter(t => /^(Wd|Nb|W|[0-6])$/i.test(t));
        if (balls.length >= 2) return balls.slice(-6);
    }

    return ['-', '-', '-', '-', '-', '-'];
}

function extractOdds(lines, root) {
    // 1) Look for the visible market chips, like: RCB 04 05
    for (const line of lines) {
        const normalized = cleanText(line);

        const chipMatch = normalized.match(/\b(RCB|GT)\b[^0-9]{0,30}(\d{1,2})\s+(\d{1,2})\b/i);
        if (chipMatch) {
            const a = toInt(chipMatch[2]);
            const b = toInt(chipMatch[3]);

            // Visible market chip values are tiny numbers; this avoids grabbing score digits.
            if (a !== null && b !== null && a <= 20 && b <= 20) {
                return {
                    favTeam: chipMatch[1].toUpperCase(),
                    backPaise: pad2(Math.min(a, b)),
                    layPaise: pad2(Math.max(a, b))
                };
            }
        }

        const teamChipMatch = normalized.match(/\b(RCB|GT|Royal Challengers|Gujarat Titans|Bengaluru|Bangalore|Titans)\b.*?\b(0?\d)\s+(0?\d)\b/i);
        if (teamChipMatch) {
            const a = toInt(teamChipMatch[2]);
            const b = toInt(teamChipMatch[3]);
            if (a !== null && b !== null && a <= 20 && b <= 20) {
                const team = /RCB|Royal Challengers|Bengaluru|Bangalore/i.test(teamChipMatch[1]) ? 'RCB' : 'GT';
                return {
                    favTeam: team,
                    backPaise: pad2(Math.min(a, b)),
                    layPaise: pad2(Math.max(a, b))
                };
            }
        }
    }

    // 2) Try state objects if available, but only accept explicit odds data.
    let found = null;

    walkObject(root, (node) => {
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

function extractStatus(lines) {
    const needLine = findNeedLine(lines);
    if (needLine) return needLine.raw;

    for (const line of lines) {
        if (/innings break/i.test(line)) return 'Innings Break';
        if (/won by/i.test(line)) return cleanText(line);
        if (/yet to begin/i.test(line)) return cleanText(line);
    }

    return 'Live Match Active';
}

function getMatchState(statusText) {
    const t = cleanText(statusText).toLowerCase();
    if (t.includes('yet to begin') || t.includes('starts at') || t.includes('scheduled')) return 'future';
    if (t.includes('won by') || t.includes('tied') || t.includes('abandoned')) return 'completed';
    return 'live';
}

function getCRR(lines, root) {
    for (const line of lines) {
        const m = line.match(/CRR\s*[:\-]?\s*(\d+(?:\.\d+)?)/i);
        if (m) return m[1];
    }

    const direct = findFirstValueByKeys(root, ['current_rr', 'crr', 'currentrunrate', 'current_run_rate']);
    if (direct !== undefined && direct !== null && direct !== '') {
        const n = toFloat(direct);
        if (n !== null) return n.toFixed(2);
    }

    return '0.00';
}

function getRRR(lines, root, statusText) {
    for (const line of lines) {
        const m = line.match(/RRR\s*[:\-]?\s*(\d+(?:\.\d+)?)/i);
        if (m) return m[1];
    }

    const direct = findFirstValueByKeys(root, ['required_rr', 'rrr', 'requiredrunrate', 'required_run_rate']);
    if (direct !== undefined && direct !== null && direct !== '') {
        const n = toFloat(direct);
        if (n !== null) return n.toFixed(2);
    }

    if (/need\s+\d+\s+runs?\s+in\s+\d+\s+balls?/i.test(statusText)) return 'LIVE';
    return '1st Innings';
}

function derivePrediction(matchState, isSecondInnings, currentRR, wickets) {
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

function parseWicketsFromLiveScore(liveScore) {
    const m = cleanText(liveScore).match(/\b\d+\s*[-/]\s*(\d+)\s*\(/);
    return m ? (toInt(m[1]) || 0) : 0;
}

function isSecondInnings(statusText, rrrValue) {
    if (rrrValue === '1st Innings') return false;
    if (rrrValue === 'LIVE') return true;
    return /need\s+\d+\s+runs?\s+in\s+\d+\s+balls?/i.test(statusText);
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

    const exactFinalUrl = 'https://crex.live/cricket-live-score/gt-vs-rcb-final-indian-premier-league-2026-match-updates-11XM';

    let operationalTargetUrl = req.query.url || exactFinalUrl;
    operationalTargetUrl = String(operationalTargetUrl).replace('crex.com', 'crex.live');

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
    const lines = linesFromHtml(bodyHtml);
    const fallbackText = cleanText($('body').text() || htmlData);

    // =========================================================================================
    // OPTIONAL STRUCTURED STATE PARSING
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
    // FIELD EXTRACTION
    // =========================================================================================

    payload.title = findTitle($, lines);

    const statusObj = findNeedLine(lines);
    payload.status = statusObj ? statusObj.raw : extractStatus(lines);
    payload.match_state = getMatchState(payload.status);

    if (payload.match_state === 'completed') {
        const winMatch = payload.status.match(/^(.*?)\s+won by/i);
        if (winMatch) payload.winner = cleanText(winMatch[1]).toUpperCase();
    }

    payload.venue = findVenue(state, lines);
    payload.toss = findToss(lines, fallbackText);

    const scoreObj = findScoreLine(lines);
    if (scoreObj) {
        payload.live_score = `${scoreObj.team} ${scoreObj.runs}/${scoreObj.wickets} (${scoreObj.overs})`;
    } else {
        const stateScore = cleanText(findFirstValueByKeys(state, ['live_score', 'livescore', 'scoreline', 'score_text']) || '');
        if (stateScore && /\d/.test(stateScore)) payload.live_score = stateScore;
    }

    payload.current_rr = getCRR(lines, state);

    const rrrValue = getRRR(lines, state, payload.status);
    payload.required_rr = rrrValue;

    const batters = extractBatsmen(lines, state, fallbackText);
    if (batters.length) {
        payload.bat_1 = `${batters[0].name} ${batters[0].runs}(${batters[0].balls})`;
        if (batters[1]) {
            payload.bat_2 = `${batters[1].name} ${batters[1].runs}(${batters[1].balls})`;
        }
    }

    payload.bowler = extractBowler(lines, state, fallbackText);

    const lastOver = extractLastOver(lines, state, fallbackText);
    if (lastOver && lastOver.length) {
        payload.last_over = lastOver.slice(-6);
        while (payload.last_over.length < 6) payload.last_over.unshift('-');
    }

    // =========================================================================================
    // ODDS
    // =========================================================================================

    const odds = extractOdds(lines, state);

    if (odds && odds.favTeam && odds.backPaise && odds.layPaise) {
        payload.match_prediction = `[LIVE MARKET ODDS] ${odds.favTeam} is Favorite at ${odds.backPaise}-${odds.layPaise} Paise`;
    } else {
        payload.match_prediction = `[LIVE MARKET ODDS] Unavailable`;
    }

    // =========================================================================================
    // SIMPLE TACTIC / LEDGER ANALYSIS
    // =========================================================================================

    const wickets = parseWicketsFromLiveScore(payload.live_score);
    const secondInnings = isSecondInnings(payload.status, payload.required_rr);
    payload.prediction = derivePrediction(payload.match_state, secondInnings, payload.current_rr, wickets);

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
        hedgeAdvice = '[ENTRY PROTOCOL] No active ledger. Wait for entry signals.';
    } else if (odds && mappedFavExposure > 0 && mappedOppExposure < 0) {
        const liabilityTarget = Math.abs(mappedOppExposure);
        const layTaxCost = liabilityTarget * (toInt(odds.layPaise) / 100);
        const finalNetSecuredProfit = mappedFavExposure - layTaxCost;

        if (finalNetSecuredProfit > 0) {
            hedgeAdvice = `🟢 [GREEN BOOK AVAILABLE]\nTo clear -${Math.abs(mappedOppExposure).toFixed(0)} on ${oppTeamName}:\n> LAY ${odds.favTeam} at ${odds.layPaise}p.\n> FINAL BOOK: +${finalNetSecuredProfit.toFixed(0)}`;
        } else {
            hedgeAdvice = `🟡 [HEDGE PENDING] Wait for ${odds.favTeam} odds to improve.`;
        }
    } else if (odds && mappedFavExposure < 0 && mappedOppExposure > 0) {
        const backCoverStake = Math.abs(mappedFavExposure) / (toInt(odds.backPaise) / 100);
        const finalNetSecuredProfit = mappedOppExposure - backCoverStake;

        if (finalNetSecuredProfit > 0) {
            hedgeAdvice = `🟢 [GREEN BOOK AVAILABLE]\nTo clear -${Math.abs(mappedFavExposure).toFixed(0)} on ${odds.favTeam}:\n> BACK ${odds.favTeam} at ${odds.backPaise}p.\n> FINAL BOOK: +${finalNetSecuredProfit.toFixed(0)}`;
        } else {
            hedgeAdvice = `🟡 [HEDGE PENDING] Wait for ${odds.favTeam} odds to drift.`;
        }
    } else if (odds) {
        hedgeAdvice = `✅ [BOOK SCAN OK] ${odds.favTeam} @ ${odds.backPaise}-${odds.layPaise}p`;
    } else {
        hedgeAdvice = '✅ [BOOK SCAN OK] Odds unavailable';
    }

    payload.ledger_analysis = hedgeAdvice;

    return res.status(200).json({
        success: true,
        match_info: payload
    });
};
