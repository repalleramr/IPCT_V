const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async function (req, res) {

  // =====================================
  // HEADERS
  // =====================================

  res.setHeader('Access-Control-Allow-Origin', '*');

  res.setHeader(
    'Cache-Control',
    'no-store'
  );

  try {

    // =====================================
    // GET TEAMS
    // =====================================

    let teams =
      req.query.teams || '';

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

        error:
          'No teams provided'
      });
    }

    teams =
      teams.toLowerCase();

    // =====================================
    // DEFAULT RESPONSE
    // =====================================

    const response = {

      success: true,

      match_info: {

        title:
          'IPL LIVE INTEL',

        status:
          'No live data available',

        match_state:
          'unknown',

        live_score:
          null,

        overs:
          null,

        target:
          null,

        required_rr:
          null,

        current_rr:
          null,

        striker:
          null,

        non_striker:
          null,

        bowler:
          null,

        last_ball:
          null,

        last_over:
          [],

        prediction:
          'Balanced',

        source:
          null,

        source_url:
          null
      }
    };

    // =====================================
    // IPL MATCH PAGE
    // =====================================

    const IPL_URL =
      'https://www.cricbuzz.com/cricket-series/9241/indian-premier-league-2026/matches';

    const iplPage =
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
      cheerio.load(
        iplPage.data
      );

    let matchUrl =
      null;

    // =====================================
    // FIND MATCH URL
    // =====================================

    $('a').each((i, el) => {

      const href =
        $(el).attr('href') || '';

      const text =
        (
          $(el).text() + href
        ).toLowerCase();

      if (
        href.includes(
          '/live-cricket-scores/'
        )
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

    // =====================================
    // MATCH NOT FOUND
    // =====================================

    if (!matchUrl) {

      response.match_info.status =
        'IPL match not found';

      return res.status(200).json(
        response
      );
    }

    response.match_info.source_url =
      matchUrl;

    // =====================================
    // MATCH ID
    // =====================================

    const idMatch =
      matchUrl.match(
        /live-cricket-scores\/(\d+)/
      );

    const matchId =
      idMatch
        ? idMatch[1]
        : null;

    // =====================================
    // CRICBUZZ MATCH PAGE
    // =====================================

    try {

      const matchPage =
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
        matchPage.data;

      const body =
        html.toLowerCase();

      // =========================
      // STATUS DETECTION
      // =========================

      if (
        body.includes(
          'toss delayed'
        )
      ) {

        response.match_info.status =
          'Toss delayed due to rain';

        response.match_info.match_state =
          'delay';

        response.match_info.source =
          'cricbuzz';
      }

      else if (
        body.includes(
          'match abandoned'
        )
      ) {

        response.match_info.status =
          'Match abandoned';

        response.match_info.match_state =
          'abandoned';

        response.match_info.source =
          'cricbuzz';
      }

      else if (
        body.includes(
          'innings break'
        )
      ) {

        response.match_info.status =
          'Innings break';

        response.match_info.match_state =
          'break';

        response.match_info.source =
          'cricbuzz';
      }

      else if (
        body.includes(
          'won by'
        )
      ) {

        response.match_info.match_state =
          'completed';

        response.match_info.source =
          'cricbuzz';
      }

    }
    catch (e) {

      // Cricbuzz failed silently
    }

    // =====================================
    // CRICBUZZ COMMENTARY API
    // =====================================

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
                  'Mozilla/5.0',

                'Accept':
                  'application/json'
              },

              timeout: 10000
            }
          );

        const data =
          commentary.data;

        if (
          data &&
          data.commentaryList &&
          data.commentaryList.length
        ) {

          const latest =
            data.commentaryList[0];

          // =========================
          // ONLY USE REAL VALUES
          // =========================

          if (latest.score) {

            response.match_info.live_score =
              latest.score;
          }

          if (
            latest.overNumber
          ) {

            response.match_info.overs =
              latest.overNumber;
          }

          if (
            latest.batsmanStriker
          ) {

            response.match_info.striker =
              latest.batsmanStriker;
          }

          if (
            latest.batsmanNonStriker
          ) {

            response.match_info.non_striker =
              latest.batsmanNonStriker;
          }

          if (
            latest.bowler
          ) {

            response.match_info.bowler =
              latest.bowler;
          }

          if (
            latest.event
          ) {

            response.match_info.last_ball =
              latest.event;
          }

          if (
            latest.overSummary
          ) {

            response.match_info.last_over =
              latest.overSummary
                .split(' ');
          }

          if (
            data.matchHeader &&
            data.matchHeader.status
          ) {

            response.match_info.status =
              data.matchHeader.status;
          }

          response.match_info.source =
            'cricbuzz';

          response.match_info.match_state =
            'live';
        }
      }

    }
    catch (e) {

      // commentary blocked
    }

    // =====================================
    // CREX FALLBACK
    // =====================================

    if (
      !response.match_info.live_score
    ) {

      try {

        const crex =
          await axios.get(

            'https://crex.live',

            {

              headers: {

                'User-Agent':
                  'Mozilla/5.0'
              },

              timeout: 10000
            }
          );

        const crexHtml =
          crex.data.toLowerCase();

        // =========================
        // ONLY STATUS
        // =========================

        if (
          crexHtml.includes(
            'toss delayed'
          )
        ) {

          response.match_info.status =
            'Toss delayed due to rain';

          response.match_info.match_state =
            'delay';

          response.match_info.source =
            'crex';
        }

        else if (
          crexHtml.includes(
            'innings break'
          )
        ) {

          response.match_info.status =
            'Innings break';

          response.match_info.match_state =
            'break';

          response.match_info.source =
            'crex';
        }

      }
      catch (e) {

        // crex failed
      }
    }

    // =====================================
    // PREDICTION
    // =====================================

    if (
      response.match_info.live_score &&
      typeof response.match_info.live_score === 'string' &&
      response.match_info.live_score.includes('/')
    ) {

      const runs =
        parseInt(
          response.match_info.live_score
            .split('/')[0]
        );

      if (runs >= 200) {

        response.match_info.prediction =
          'Batting side dominant';
      }

      else if (runs >= 170) {

        response.match_info.prediction =
          'Batting side slight edge';
      }

      else if (runs <= 140) {

        response.match_info.prediction =
          'Bowling pressure building';
      }
    }

    // =====================================
    // FINAL RESPONSE
    // =====================================

    return res.status(200).json(
      response
    );

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
