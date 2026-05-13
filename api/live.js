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

        error: "No teams provided"
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
    // IPL PAGE
    // =========================

    const IPL_URL =
      'https://www.cricbuzz.com/cricket-series/9241/indian-premier-league-2026/matches';

    const page =
      await axios.get(

        IPL_URL,

        {

          headers: {

            'User-Agent':
              'Mozilla/5.0'
          },

          timeout: 10000
        }
      );

    const $ =
      cheerio.load(page.data);

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

        const t =
          teams.split(' vs ');

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

        error: "IPL match not found"
      });
    }

    // =========================
    // MATCH ID
    // =========================

    const idMatch =
      matchUrl.match(
        /live-cricket-scores\/(\d+)/
      );

    const matchId =
      idMatch
        ? idMatch[1]
        : null;

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

    const html =
      match.data;

    const $m =
      cheerio.load(html);

    // =========================
    // SCORE
    // =========================

    let score =
      'Score unavailable';

    const possibleSelectors = [

      '.cb-min-bat-rw',

      '.cb-font-20',

      '.cb-scrs-wrp',

      '.cb-col-100',

      '.cb-lv-scrs-col',

      '.cb-text-live'
    ];

    for (const sel of possibleSelectors) {

      const txt =
        $m(sel)
          .text()
          .trim();

      const found =
        txt.match(
          /\d{2,3}\/\d{1,2}/
        );

      if (found) {

        score = found[0];

        break;
      }
    }

    // =========================
    // FALLBACK SCORE
    // =========================

    if (
      score ===
      'Score unavailable'
    ) {

      const bodyText =
        $m('body')
          .text()
          .replace(/\s+/g, ' ');

      const allScores =
        bodyText.match(
          /\d{2,3}\/\d{1,2}/g
        );

      if (
        allScores &&
        allScores.length
      ) {

        score =
          allScores.sort((a, b) => {

            return (
              parseInt(
                b.split('/')[0]
              ) -

              parseInt(
                a.split('/')[0]
              )
            );

          })[0];
      }
    }

    // =========================
    // STATUS
    // =========================

    let status =
      'Live';

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

    // =========================
    // COMMENTARY
    // =========================

    let striker =
      'Unavailable';

    let nonStriker =
      'Unavailable';

    let bowler =
      'Unavailable';

    let overs =
      '0.0';

    let lastBall =
      '-';

    let lastOver =
      [];

    try {

      if (matchId) {

        const commentaryUrl =
          `https://www.cricbuzz.com/api/cricket-match/commentary/${matchId}`;

        const commentary =
          await axios.get(

            commentaryUrl,

            {

              headers: {

                'User-Agent':
                  'Mozilla/5.0'
              },

              timeout: 10000
            }
          );

        const data =
          commentary.data;

        // Attempt parsing
        if (
          data &&
          data.commentaryList &&
          data.commentaryList.length
        ) {

          const latest =
            data.commentaryList[0];

          striker =
            latest.batsmanStriker ||
            striker;

          nonStriker =
            latest.batsmanNonStriker ||
            nonStriker;

          bowler =
            latest.bowler ||
            bowler;

          overs =
            latest.overNumber ||
            overs;

          lastBall =
            latest.event ||
            '-';

          if (
            latest.overSummary
          ) {

            lastOver =
              latest.overSummary
                .split(' ');
          }
        }
      }

    }
    catch (e) {

      // Commentary fail silently
    }

    // =========================
    // PREDICTION
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
    // RESPONSE
    // =========================

    return res.status(200).json({

      success: true,

      match_info: {

        title:
          'IPL LIVE INTEL',

        live_score:
          score,

        overs:
          overs,

        status:
          status,

        striker:
          striker,

        non_striker:
          nonStriker,

        bowler:
          bowler,

        last_ball:
          lastBall,

        last_over:
          lastOver,

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
