const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async function (req, res) {

  res.setHeader('Access-Control-Allow-Origin', '*');

  res.setHeader(
    'Cache-Control',
    'no-store'
  );

  try {

    // =========================
    // GET TEAMS
    // =========================

    let teams =
      req.query.teams || "";

    if (!teams) {

      return res.status(200).json({

        success: false,

        error: "No teams provided"
      });
    }

    teams =
      teams.toLowerCase();

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

    let matchUrl =
      null;

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
            t[0]
              .trim()
              .split(' ')[0];

          const t2 =
            t[1]
              .trim()
              .split(' ')[0];

          if (
            text.includes(t1) &&
            text.includes(t2)
          ) {

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

        error:
          'Match not found'
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

    if (!matchId) {

      return res.status(200).json({

        success: false,

        error:
          'Match ID missing'
      });
    }

    // =========================
    // COMMENTARY API
    // =========================

    const commentaryUrl =
      `https://www.cricbuzz.com/api/cricket-match/commentary/${matchId}`;

    const commentary =
      await axios.get(

        commentaryUrl,

        {

          headers: {

            'User-Agent':
              'Mozilla/5.0',

            'Accept':
              'application/json'
          },

          timeout: 10000
        }
      );

    const data =
      commentary.data;

    // =========================
    // SAFETY
    // =========================

    if (
      !data ||
      !data.commentaryList
    ) {

      return res.status(200).json({

        success: false,

        error:
          'No commentary data'
      });
    }

    // =========================
    // LATEST BALL
    // =========================

    const latest =
      data.commentaryList[0] || {};

    // =========================
    // LIVE VALUES
    // =========================

    const liveScore =
      latest.score ||
      'Match not started';

    const overs =
      latest.overNumber ||
      '0.0';

    const striker =
      latest.batsmanStriker ||
      'Unavailable';

    const nonStriker =
      latest.batsmanNonStriker ||
      'Unavailable';

    const bowler =
      latest.bowler ||
      'Unavailable';

    const lastBall =
      latest.event ||
      '-';

    let lastOver =
      [];

    if (
      latest.overSummary
    ) {

      lastOver =
        latest.overSummary
          .split(' ');
    }

    // =========================
    // STATUS
    // =========================

    const status =
      data.matchHeader
        ?.status ||
      'Live';

    // =========================
    // PREDICTION
    // =========================

    let prediction =
      'Balanced';

    if (
      typeof liveScore === 'string' &&
      liveScore.includes('/')
    ) {

      const runs =
        parseInt(
          liveScore.split('/')[0]
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
          data.matchHeader
            ?.matchDescription ||
          'IPL LIVE INTEL',

        live_score:
          liveScore,

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
