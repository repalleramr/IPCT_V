const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async function (req, res) {

  // =========================
  // HEADERS
  // =========================

  res.setHeader('Access-Control-Allow-Origin', '*');

  res.setHeader(
    'Cache-Control',
    'no-store, max-age=0'
  );

  try {

    // =========================
    // GET TEAMS
    // =========================

    let teams = req.query.teams || "";

    if (
      !teams &&
      req.url &&
      req.url.includes('teams=')
    ) {

      teams = decodeURIComponent(
        req.url.split('teams=')[1]
          .split('&')[0]
      );
    }

    if (!teams) {

      return res.status(200).json({

        success: false,

        error: "No target teams"
      });
    }

    teams = teams.toLowerCase();

    // =========================
    // TEAM ALIASES
    // =========================

    const aliases = {

      "mumbai indians":
        ["mi", "mumbai"],

      "chennai super kings":
        ["csk", "chennai"],

      "royal challengers bengaluru":
        ["rcb", "bengaluru", "bangalore"],

      "kolkata knight riders":
        ["kkr", "kolkata"],

      "delhi capitals":
        ["dc", "delhi"],

      "gujarat titans":
        ["gt", "gujarat"],

      "lucknow super giants":
        ["lsg", "lucknow"],

      "punjab kings":
        ["pbks", "punjab"],

      "rajasthan royals":
        ["rr", "rajasthan"],

      "sunrisers hyderabad":
        ["srh", "hyderabad", "sunrisers"]
    };

    // =========================
    // FETCH MATCH LIST
    // =========================

    const recent =
      await axios.get(

        'https://www.cricbuzz.com/cricket-match/live-scores',

        {

          headers: {

            'User-Agent':
              'Mozilla/5.0'
          },

          timeout: 10000
        }
      );

    const $ = cheerio.load(
      recent.data
    );

    let matchUrl = null;

    // =========================
    // FIND MATCH
    // =========================

    $('a').each((i, el) => {

      const href =
        $(el).attr('href') || '';

      const text =
        (
          $(el).text() + href
        ).toLowerCase();

      if (
        href.includes('/live-cricket-scores/')
      ) {

        const t = teams.split(' vs ');

        if (t.length >= 2) {

          const t1 =
            t[0].trim().toLowerCase();

          const t2 =
            t[1].trim().toLowerCase();

          const t1Aliases =
            aliases[t1] || [t1];

          const t2Aliases =
            aliases[t2] || [t2];

          const hasT1 =
            t1Aliases.some(a =>
              text.includes(a)
            );

          const hasT2 =
            t2Aliases.some(a =>
              text.includes(a)
            );

          if (hasT1 && hasT2) {

            matchUrl =
              'https://www.cricbuzz.com' +
              href;

            return false;
          }
        }
      }
    });

    // =========================
    // MATCH NOT FOUND
    // =========================

    if (!matchUrl) {

      return res.status(200).json({

        success: false,

        error: "Match not found"
      });
    }

    // =========================
    // FETCH MATCH PAGE
    // =========================

    const match =
      await axios.get(

        matchUrl,

        {

          headers: {

            'User-Agent':
              'Mozilla/5.0'
          },

          timeout: 10000
        }
      );

    const $m =
      cheerio.load(match.data);

    // =========================
    // SCORE
    // =========================

    let score = '';

    const scoreSelectors = [

      '.cb-font-20',

      '.cb-min-bat-rw',

      '.cb-scrs-wrp',

      '.cb-col-100.cb-col'
    ];

    for (const sel of scoreSelectors) {

      const txt =
        $m(sel)
          .first()
          .text()
          .trim();

      if (
        txt &&
        txt.length > 3
      ) {

        score = txt;

        break;
      }
    }

    // REGEX FALLBACK

    if (!score) {

      const body =
        $m('body').text();

      const found =
        body.match(
          /\d{1,3}\/\d{1,2}/
        );

      if (found) {

        score = found[0];
      }
    }

    // =========================
    // STATUS
    // =========================

    let status = '';

    const statusSelectors = [

      '.cb-text-live',

      '.cb-status-msg',

      '.cb-text-complete',

      '.cb-mini-status'
    ];

    for (const sel of statusSelectors) {

      const txt =
        $m(sel)
          .first()
          .text()
          .trim();

      if (txt) {

        status = txt;

        break;
      }
    }

    if (!status) {

      status = 'Live';
    }

    // =========================
    // SIMPLE AI
    // =========================

    let prediction =
      'Balanced';

    if (
      score &&
      score.includes('/')
    ) {

      const runs =
        parseInt(
          score.split('/')[0]
        );

      if (runs >= 200) {

        prediction =
          'Batting side dominant';
      }
      else if (runs >= 170) {

        prediction =
          'Batting side slight edge';
      }
      else if (runs <= 140) {

        prediction =
          'Bowling pressure building';
      }
    }

    // =========================
    // FINAL RESPONSE
    // =========================

    return res.status(200).json({

      success: true,

      match_info: {

        title:
          'IPCT TARGET LOCKED',

        live_score:
          score ||
          'Score unavailable',

        status:
          status,

        prediction:
          prediction,

        source_url:
          matchUrl
      }
    });

  }
  catch (e) {

    return res.status(200).json({

      success: false,

      error:
        e.message ||
        'Unknown error'
    });
  }
};
