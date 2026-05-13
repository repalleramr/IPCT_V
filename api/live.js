const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async function (req, res) {

  res.setHeader('Access-Control-Allow-Origin', '*');

  res.setHeader(
    'Cache-Control',
    'no-store'
  );

  try {

    // =====================
    // GET TEAM QUERY
    // =====================

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

    // =====================
    // IPL PAGE ONLY
    // =====================

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

    // =====================
    // FIND MATCH LINK
    // =====================

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

    // =====================
    // MATCH NOT FOUND
    // =====================

    if (!matchUrl) {

      return res.status(200).json({

        success: false,

        error: "IPL match not found"
      });
    }

    // =====================
    // FETCH MATCH PAGE
    // =====================

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

    // =====================
    // SCORE REGEX
    // =====================

    const scores =
      html.match(
        /\b\d{2,3}\/\d{1,2}\b/g
      );

    let score =
      "Score unavailable";

    if (
      scores &&
      scores.length
    ) {

      // choose highest score
      score =
        scores.sort((a, b) => {

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

    // =====================
    // STATUS
    // =====================

    const $m =
      cheerio.load(html);

    let status =
      'Live';

    const statusSelectors = [

      '.cb-text-live',

      '.cb-status-msg',

      '.cb-text-complete'
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

    // =====================
    // SIMPLE PREDICTION
    // =====================

    let prediction =
      'Balanced';

    if (
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

    // =====================
    // RESPONSE
    // =====================

    return res.status(200).json({

      success: true,

      match_info: {

        title:
          'IPL LIVE INTEL',

        live_score:
          score,

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
