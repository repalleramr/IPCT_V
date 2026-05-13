const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async function (req, res) {

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  try {

    let teams = req.query.teams || "";

    if (!teams) {
      return res.status(200).json({
        success: false,
        error: "No target teams"
      });
    }

    teams = teams.toLowerCase();

    // ======================
    // FETCH MATCH LIST
    // ======================

    const recent = await axios.get(
      'https://www.cricbuzz.com/cricket-match/live-scores',
      {
        headers: {
          'User-Agent': 'Mozilla/5.0'
        },
        timeout: 10000
      }
    );

    const $ = cheerio.load(recent.data);

    let matchUrl = null;

    $('a').each((i, el) => {

      const href = $(el).attr('href') || '';
      const text = ($(el).text() + href).toLowerCase();

      if (
        href.includes('/live-cricket-scores/') &&
        text.includes('vs')
      ) {

        const t = teams.split(' vs ');

        if (
          t.length >= 2 &&
          text.includes(t[0].split(' ')[0]) &&
          text.includes(t[1].split(' ')[0])
        ) {

          matchUrl =
            'https://www.cricbuzz.com' + href;

          return false;
        }
      }
    });

    if (!matchUrl) {

      return res.status(200).json({
        success: false,
        error: "Match not found"
      });
    }

    // ======================
    // FETCH MATCH PAGE
    // ======================

    const match = await axios.get(matchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      },
      timeout: 10000
    });

    const $m = cheerio.load(match.data);

    // ======================
    // SCORE
    // ======================

    let score = '';

    const possibleScores = [
      '.cb-font-20',
      '.cb-min-bat-rw',
      '.cb-scrs-wrp'
    ];

    for (const sel of possibleScores) {

      const txt = $m(sel)
        .first()
        .text()
        .trim();

      if (txt.length > 3) {
        score = txt;
        break;
      }
    }

    // fallback regex
    if (!score) {

      const body = $m('body').text();

      const found = body.match(/\d{1,3}\/\d{1,2}/);

      if (found) {
        score = found[0];
      }
    }

    // ======================
    // STATUS
    // ======================

    let status = '';

    const statusSelectors = [
      '.cb-text-live',
      '.cb-status-msg',
      '.cb-text-complete'
    ];

    for (const sel of statusSelectors) {

      const txt = $m(sel)
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

    // ======================
    // SIMPLE PREDICTION
    // ======================

    let prediction = 'Balanced';

    if (score.includes('/')) {

      const runs =
        parseInt(score.split('/')[0]);

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

    // ======================
    // FINAL RESPONSE
    // ======================

    return res.status(200).json({

      success: true,

      match_info: {

        title: 'IPCT TARGET LOCKED',

        live_score:
          score || 'Score unavailable',

        status: status,

        prediction: prediction,

        source_url: matchUrl
      }
    });

  } catch (e) {

    return res.status(200).json({

      success: false,

      error:
        e.message || 'Unknown error'
    });
  }
};
