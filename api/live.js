const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    let targetTeams = (req.query.teams || "").toLowerCase().trim();
    let rawDateStr = (req.query.time || "").toLowerCase().trim();

    if (!targetTeams) {
      return res.status(200).json({
        success: false,
        error: "Awaiting Target Intel..."
      });
    }

    // =========================================================
    // MASTER VENUE LEDGER
    // =========================================================
    const MASTER_LEDGER = {
      "may 11": {
        expected: ["punjab", "delhi", "pbks", "dc"],
        venue: "Himachal Pradesh Cricket Association Stadium, Dharamsala"
      },
      "may 12": {
        expected: ["gujarat", "sunrisers", "gt", "srh"],
        venue: "Narendra Modi Stadium, Ahmedabad"
      },
      "may 13": {
        expected: ["bengaluru", "kolkata", "rcb", "kkr"],
        venue: "M. Chinnaswamy Stadium, Bengaluru"
      },
      "may 14": {
        expected: ["punjab", "mumbai", "pbks", "mi"],
        venue: "Himachal Pradesh Cricket Association Stadium, Dharamsala"
      },
      "may 15": {
        expected: ["lucknow", "chennai", "lsg", "csk"],
        venue: "Bharat Ratna Shri Atal Bihari Vajpayee Ekana Cricket Stadium, Lucknow"
      },
      "may 16": {
        expected: ["kolkata", "gujarat", "kkr", "gt"],
        venue: "Eden Gardens, Kolkata"
      },
      "may 17 3:30": {
        expected: ["punjab", "bengaluru", "pbks", "rcb"],
        venue: "Himachal Pradesh Cricket Association Stadium, Dharamsala"
      },
      "may 17 7:30": {
        expected: ["delhi", "rajasthan", "dc", "rr"],
        venue: "Arun Jaitley Stadium, Delhi"
      },
      "may 18": {
        expected: ["chennai", "sunrisers", "csk", "srh"],
        venue: "MA Chidambaram Stadium, Chennai"
      },
      "may 19": {
        expected: ["rajasthan", "lucknow", "rr", "lsg"],
        venue: "Sawai Mansingh Stadium, Jaipur"
      },
      "may 20": {
        expected: ["kolkata", "mumbai", "kkr", "mi"],
        venue: "Eden Gardens, Kolkata"
      },
      "may 21": {
        expected: ["gujarat", "chennai", "gt", "csk"],
        venue: "Narendra Modi Stadium, Ahmedabad"
      },
      "may 22": {
        expected: ["sunrisers", "bengaluru", "srh", "rcb"],
        venue: "Rajiv Gandhi International Stadium, Hyderabad"
      },
      "may 23": {
        expected: ["lucknow", "punjab", "lsg", "pbks"],
        venue: "Bharat Ratna Shri Atal Bihari Vajpayee Ekana Cricket Stadium, Lucknow"
      },
      "may 24 3:30": {
        expected: ["mumbai", "rajasthan", "mi", "rr"],
        venue: "Wankhede Stadium, Mumbai"
      },
      "may 24 7:30": {
        expected: ["kolkata", "delhi", "kkr", "dc"],
        venue: "Eden Gardens, Kolkata"
      },
      "may 26": {
        expected: ["qualifier"],
        venue: "Narendra Modi Stadium, Ahmedabad",
        isPlayoff: true
      },
      "may 27": {
        expected: ["eliminator"],
        venue: "Narendra Modi Stadium, Ahmedabad",
        isPlayoff: true
      },
      "may 29": {
        expected: ["qualifier"],
        venue: "MA Chidambaram Stadium, Chennai",
        isPlayoff: true
      },
      "may 31": {
        expected: ["final"],
        venue: "MA Chidambaram Stadium, Chennai",
        isPlayoff: true
      }
    };

    // =========================================================
    // TEAM ALIASES
    // =========================================================
    const teamAliases = {
      csk: ["csk", "chennai", "super kings", "chennai super kings"],
      dc: ["dc", "delhi", "capitals", "delhi capitals"],
      gt: ["gt", "gujarat", "titans", "gujarat titans"],
      kkr: ["kkr", "kolkata", "knight riders", "kolkata knight riders"],
      lsg: ["lsg", "lucknow", "super giants", "lucknow super giants"],
      mi: ["mi", "mumbai", "indians", "mumbai indians"],
      pbks: ["pbks", "punjab", "kings", "punjab kings"],
      rr: ["rr", "rajasthan", "royals", "rajasthan royals"],
      rcb: [
        "rcb",
        "royal challengers",
        "royal challengers bengaluru",
        "royal challengers bangalore",
        "bengaluru",
        "bangalore"
      ],
      srh: ["srh", "sunrisers", "hyderabad", "sunrisers hyderabad"]
    };

    // =========================================================
    // FLEXIBLE TEAM PARSER
    // =========================================================
    function parseTeams(input) {
      let cleaned = input
        .replace(/\s+vs\.?\s+/i, ' vs ')
        .replace(/\sv\s/i, ' vs ')
        .trim();

      let parts = cleaned.split(' vs ');

      return {
        t1: parts[0] ? parts[0].trim() : "",
        t2: parts[1] ? parts[1].trim() : ""
      };
    }

    const parsed = parseTeams(targetTeams);

    function getAliases(teamText) {
      let lower = teamText.toLowerCase();

      for (const key in teamAliases) {
        if (teamAliases[key].some(a => lower.includes(a))) {
          return teamAliases[key];
        }
      }

      return [lower];
    }

    const t1Aliases = getAliases(parsed.t1);
    const t2Aliases = getAliases(parsed.t2);

    // =========================================================
    // DATE MATCHING
    // =========================================================
    function getLedgerKey(dateText) {
      if (!dateText) return "";

      let clean = dateText.toLowerCase();

      for (const key of Object.keys(MASTER_LEDGER)) {
        let base = key.split(' ').slice(0, 2).join(' ');

        if (clean.includes(base)) {

          if (key.includes("3:30") && clean.includes("3:30")) {
            return key;
          }

          if (key.includes("7:30") && clean.includes("7:30")) {
            return key;
          }

          if (!key.includes(":")) {
            return key;
          }
        }
      }

      return "";
    }

    const ledgerKey = getLedgerKey(rawDateStr);

    const currentMission = MASTER_LEDGER[ledgerKey] || {
      expected: [],
      venue: null,
      isPlayoff: false
    };

    // =========================================================
    // PAYLOAD
    // =========================================================
    let payload = {
      title: "IPL LIVE INTEL",
      status: null,
      match_state: "standby",
      live_score: null,
      overs: null,
      target: null,
      required_rr: null,
      current_rr: null,
      striker: null,
      non_striker: null,
      bowler: null,
      toss: null,
      result: null,
      venue: null,
      last_ball: null,
      last_over: [],
      prediction: "Tracking...",
      countdown: null,
      source: "awaiting-seller",
      source_url: null
    };

    const headers = {
      'User-Agent': 'Mozilla/5.0'
    };

    // =========================================================
    // HELPERS
    // =========================================================
    function mergeIntel(newData) {
      for (const key in newData) {

        if (
          payload[key] === null ||
          payload[key] === undefined ||
          payload[key] === "" ||
          payload[key] === "Location Secure"
        ) {
          payload[key] = newData[key];
        }
      }
    }

    function isIntelSufficient() {
      return Boolean(
        payload.status &&
        payload.toss &&
        payload.venue &&
        payload.live_score
      );
    }

    function matchesTeams(fullTxt) {
      if (!fullTxt) return false;

      fullTxt = fullTxt.toLowerCase();

      let t1Match = t1Aliases.some(a => fullTxt.includes(a));
      let t2Match = t2Aliases.some(a => fullTxt.includes(a));

      if (t1Match && t2Match) return true;

      if (
        currentMission.isPlayoff &&
        currentMission.expected.some(e => fullTxt.includes(e))
      ) {
        return true;
      }

      return false;
    }

    // =========================================================
    // ESPN
    // =========================================================
    if (!isIntelSufficient()) {
      try {

        const endpoints = [
          'https://hs-consumer-api.espncricinfo.com/v1/pages/matches/current?lang=en&latest=true',
          'https://hs-consumer-api.espncricinfo.com/v1/pages/matches/recent?lang=en&latest=true',
          'https://hs-consumer-api.espncricinfo.com/v1/pages/matches/schedule?lang=en&latest=true'
        ];

        for (const url of endpoints) {

          const espnResponse = await axios.get(url, {
            headers,
            timeout: 5000
          });

          const matches = espnResponse?.data?.matches || [];

          for (const match of matches) {

            const teams = Array.isArray(match.teams)
              ? match.teams
              : [];

            const combined = teams.map(t => {
              const longName = t?.team?.longName || "";
              const abbr = t?.team?.abbreviation || "";
              return `${longName} ${abbr}`;
            }).join(' ').toLowerCase();

            const title = (match.title || "").toLowerCase();

            const fullTxt = `${combined} ${title}`;

            if (!matchesTeams(fullTxt)) continue;

            let intel = {};

            intel.status = match.statusText || match.status || null;

            if (match?.tossResults?.text) {
              intel.toss = match.tossResults.text;
            }

            if (match?.ground?.name) {
              intel.venue = match.ground.name;
            }

            intel.source = "seller-1-espn";

            if (match?.objectId) {
              intel.source_url =
                `https://www.espncricinfo.com/series/ipl-2026-${match.objectId}`;
            }

            let scores = [];

            teams.forEach(t => {
              if (t.score) {
                scores.push(
                  `${t.team.abbreviation} ${t.score}`
                );
              }
            });

            if (scores.length) {
              intel.live_score = scores.join(" v ");
            }

            mergeIntel(intel);
          }
        }

      } catch (e) {}
    }

    // =========================================================
    // CREX
    // =========================================================
    if (!isIntelSufficient()) {
      try {

        const crexResponse = await axios.get(
          'https://crex.com/series/indian-premier-league-2026-1PW/matches',
          {
            headers,
            timeout: 5000
          }
        );

        const $ = cheerio.load(crexResponse.data);

        let matchUrl = null;

        $('a').each((i, el) => {

          let href = $(el).attr('href') || "";

          let txt = (
            $(el).text() +
            " " +
            href +
            " " +
            $(el).parent().text()
          ).toLowerCase();

          if (
            (href.includes('cricket-live-score') ||
             href.includes('match-details')) &&
            matchesTeams(txt)
          ) {
            matchUrl = href.startsWith('http')
              ? href
              : `https://crex.com${href}`;
          }
        });

        if (matchUrl) {

          const matchResponse = await axios.get(matchUrl, {
            headers,
            timeout: 5000
          });

          const $m = cheerio.load(matchResponse.data);

          let intel = {
            source: "seller-2-crex",
            source_url: matchUrl
          };

          intel.status =
            $m('.match-info-status').first().text().trim() ||
            $m('.status').first().text().trim();

          $m('div, span').each((i, el) => {

            const text = $m(el)
              .text()
              .replace(/\s+/g, ' ')
              .trim();

            if (!intel.venue && text.startsWith('Venue:')) {
              intel.venue = text.replace('Venue:', '').trim();
            }

            if (!intel.toss && text.startsWith('Toss:')) {
              intel.toss = text.replace('Toss:', '').trim();
            }
          });

          mergeIntel(intel);
        }

      } catch (e) {}
    }

    // =========================================================
    // FINAL LOGIC
    // =========================================================
    let lowerStatus = (payload.status || "").toLowerCase();

    if (
      lowerStatus.includes('won by') ||
      lowerStatus.includes('tied')
    ) {

      payload.match_state = "completed";
      payload.result = payload.status;
      payload.title = "MISSION ACCOMPLISHED";
      payload.live_score = "Match Ended";
      payload.last_over = ["E", "N", "D"];
    }
    else if (
      lowerStatus.includes('delay') ||
      lowerStatus.includes('rain')
    ) {

      payload.match_state = "delay";
      payload.title = "WEATHER PROTOCOL";
    }
    else if (
      payload.live_score &&
      /\d/.test(payload.live_score)
    ) {

      payload.match_state = "live";
      payload.prediction = "Active Tracking...";
    }
    else {
      payload.match_state = "pre-match";
    }

    // =========================================================
    // COUNTDOWN
    // =========================================================
    if (
      rawDateStr &&
      (
        payload.match_state === "pre-match" ||
        payload.match_state === "standby"
      )
    ) {

      try {

        let timeMatch = rawDateStr.match(/\((.*?)\)/);

        if (timeMatch) {

          let dateText =
            rawDateStr.replace(/\(.*?\)/, '').trim();

          let timeText = timeMatch[1];

          let targetDate = new Date(
            `${dateText} 2026 ${timeText} GMT+0530`
          );

          let now = new Date();

          let diff = targetDate.getTime() - now.getTime();

          if (diff > 0) {

            let totalMinutes = Math.floor(diff / 60000);

            let days = Math.floor(totalMinutes / 1440);

            let hours = Math.floor((totalMinutes % 1440) / 60);

            let mins = totalMinutes % 60;

            payload.countdown =
              `T-MINUS ${days}d ${hours}h ${mins}m TO OPERATION`;

            payload.match_state = "countdown";
          }
        }

      } catch (e) {}
    }

    // =========================================================
    // VENUE FALLBACK
    // =========================================================
    if (!payload.venue && currentMission.venue) {
      payload.venue = currentMission.venue;
    }

    // =========================================================
    // FINAL FALLBACKS
    // =========================================================
    if (!payload.status) {
      payload.status = "Uplink Established";
    }

    if (!payload.live_score) {
      payload.live_score = "Intel Unavailable";
    }

    if (!payload.venue) {
      payload.venue = "Location Secure";
    }

    if (!payload.toss) {
      payload.toss = "Awaiting Coin Drop";
    }

    if (!payload.last_over.length) {
      payload.last_over = ["-", "-", "-", "-", "-", "-"];
    }

    return res.status(200).json({
      success: true,
      match_info: payload
    });

  } catch (err) {

    return res.status(200).json({
      success: false,
      error: err.message
    });
  }
};
