const axios = require("axios");
const cheerio = require("cheerio");

const AXIOS_OPTS = {
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  },
  timeout: 10000,
  validateStatus: (s) => s >= 200 && s < 400,
};

const TEAM_ALIASES = {
  csk: ["csk", "chennai super kings", "chennai"],
  mi: ["mi", "mumbai indians", "mumbai"],
  rcb: ["rcb", "royal challengers bengaluru", "royal challengers bangalore", "bengaluru", "bangalore"],
  kkr: ["kkr", "kolkata knight riders", "kolkata"],
  dc: ["dc", "delhi capitals", "delhi"],
  gt: ["gt", "gujarat titans", "gujarat"],
  lsg: ["lsg", "lucknow super giants", "lucknow"],
  pbks: ["pbks", "punjab kings", "punjab"],
  rr: ["rr", "rajasthan royals", "rajasthan"],
  srh: ["srh", "sunrisers hyderabad", "sunrisers", "hyderabad"],
};

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniq(arr) {
  return [...new Set(arr.filter(Boolean))];
}

function expandTeamTokens(teamText) {
  const n = normalize(teamText);
  const tokens = n.split(" ");

  const out = [n];
  for (const [key, vals] of Object.entries(TEAM_ALIASES)) {
    if (n === key || n.includes(key) || vals.some((v) => n.includes(v))) {
      out.push(key, ...vals);
    }
  }

  // keep useful tokens too
  out.push(...tokens);
  return uniq(out);
}

function parseTeamsFromQuery(req) {
  let query = req.query?.teams || "";
  if (!query && typeof req.url === "string" && req.url.includes("teams=")) {
    try {
      query = decodeURIComponent(req.url.split("teams=")[1].split("&")[0]);
    } catch {
      query = "";
    }
  }

  const cleaned = normalize(query.replace(/\+/g, " "));
  if (!cleaned || cleaned === "vs") return null;

  const parts = cleaned.split(" vs ");
  if (parts.length < 2) return null;

  return {
    raw: query,
    team1: parts[0].trim(),
    team2: parts[1].trim(),
  };
}

function scorePrediction({ scoreText, statusText }) {
  const score = normalize(scoreText);
  const status = normalize(statusText);

  if (status.includes("won") || status.includes("result") || status.includes("complete")) {
    return statusText || "Match completed";
  }

  // very simple live heuristic
  let prediction = "Balanced";

  const scoreMatch = score.match(/(\d+)\s*\/\s*(\d+)/);
  if (scoreMatch) {
    const runs = parseInt(scoreMatch[1], 10);
    const wickets = parseInt(scoreMatch[2], 10);

    if (runs >= 200) prediction = "Batting side heavy favorite";
    else if (runs >= 170) prediction = "Batting side slight edge";
    else if (runs <= 140) prediction = "Bowling side pressure building";
    else prediction = "Balanced contest";

    if (wickets >= 6) prediction = "Bowling side comeback possible";
  }

  return prediction;
}

module.exports = async function live(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store, max-age=0, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const parsed = parseTeamsFromQuery(req);
    if (!parsed) {
      return res.status(200).json({
        success: false,
        error: "Satellite waiting for target teams...",
      });
    }

    const t1Tokens = expandTeamTokens(parsed.team1);
    const t2Tokens = expandTeamTokens(parsed.team2);

    const recentUrl = "https://www.cricbuzz.com/cricket-match/live-scores/recent-matches";
    const { data: recentHtml } = await axios.get(recentUrl, AXIOS_OPTS);
    const $ = cheerio.load(recentHtml);

    let matchUrl = null;

    $("a").each((_, el) => {
      if (matchUrl) return false;

      const href = $(el).attr("href") || "";
      const text = normalize($(el).text() + " " + href);

      const hasT1 = t1Tokens.some((a) => a && text.includes(a));
      const hasT2 = t2Tokens.some((a) => a && text.includes(a));
      const looksLikeMatch = href.includes("scores") || href.includes("match") || href.includes("live");

      if (looksLikeMatch && hasT1 && hasT2) {
        matchUrl = href.startsWith("http") ? href : `https://www.cricbuzz.com${href}`;
        return false;
      }
    });

    // fallback: scan with looser matching
    if (!matchUrl) {
      $("a").each((_, el) => {
        if (matchUrl) return false;

        const href = $(el).attr("href") || "";
        const text = normalize($(el).text() + " " + href);

        const hasEither =
          t1Tokens.some((a) => a && text.includes(a)) ||
          t2Tokens.some((a) => a && text.includes(a));

        if (hasEither && (href.includes("scores") || href.includes("match") || href.includes("live"))) {
          matchUrl = href.startsWith("http") ? href : `https://www.cricbuzz.com${href}`;
          return false;
        }
      });
    }

    if (!matchUrl) {
      return res.status(200).json({
        success: false,
        error: `Target ${parsed.team1} vs ${parsed.team2} not found.`,
      });
    }

    const { data: matchHtml } = await axios.get(matchUrl, AXIOS_OPTS);
    const $m = cheerio.load(matchHtml);

    const statusText =
      $m(".cb-text-complete, .cb-status-msg, .cb-text-live, .cb-mini-status").first().text().trim() ||
      "Live telemetry active";

    const scoreText =
      $m(".cb-min-bat-rw, .cb-font-20, .cb-col-100.cb-col").first().text().trim() ||
      $m("div, span").filter((_, el) => {
        const t = normalize($m(el).text());
        return /\d+\s*\/\s*\d+/.test(t);
      }).first().text().trim() ||
      "";

    const isComplete = /won|result|complete|finished|abandoned/i.test(statusText) ||
      $m(".cb-text-complete").length > 0;

    const prediction = isComplete
      ? statusText || "Match completed"
      : scorePrediction({ scoreText, statusText });

    return res.status(200).json({
      success: true,
      match_info: {
        title: isComplete ? "MISSION ACCOMPLISHED" : "IPCT TARGET LOCKED",
        live_score: scoreText || (isComplete ? "Match Ended" : "Pre-Match Intel"),
        status: statusText,
        bowler: isComplete ? "Mission Over" : "Active Play",
        last_balls: isComplete ? ["E", "N", "D"] : ["1", "0", "W", "4", "0", "1"],
        prediction,
        source_url: matchUrl,
      },
    });
  } catch (err) {
    return res.status(200).json({
      success: false,
      error: err?.message || String(err),
    });
  }
};
