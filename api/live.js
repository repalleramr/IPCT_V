const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async function (req, res) {

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  try {

    // =========================
    // GET TEAMS
    // =========================

    let teams = req.query.teams || '';

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
        error: 'No teams provided'
      });
    }

    teams = teams.toLowerCase();

    // =========================
    // TEAM ALIASES
    // =========================

    const aliases = {
      'mumbai indians': ['mi', 'mumbai'],
      'chennai super kings': ['csk', 'chennai'],
      'royal challengers bengaluru': ['rcb', 'bengaluru', 'bangalore'],
      'kolkata knight riders': ['kkr', 'kolkata'],
      'delhi capitals': ['dc', 'delhi'],
      'gujarat titans': ['gt', 'gujarat'],
      'lucknow super giants': ['lsg', 'lucknow'],
      'punjab kings': ['pbks', 'punjab'],
      'rajasthan royals': ['rr', 'rajasthan'],
      'sunrisers hyderabad': ['srh', 'hyderabad', 'sunrisers']
    };

    // =========================
    // FIND MATCH URL FROM IPL PAGE
    // =========================

    const IPL_URL =
      'https://www.cricbuzz.com/cricket-series/9241/indian-premier-league-2026/matches';

    const page = await axios.get(
      IPL_URL,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0'
        },
        timeout: 10000
      }
    );

    const $ = cheerio.load(page.data);

    let matchUrl = null;

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

    if (!matchUrl) {
      return res.status(200).json({
        success: false,
        error: 'IPL match not found'
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
        error: 'Match ID missing'
      });
    }

    // =========================
    // DEFAULT VALUES
    // =========================

    let liveScore = 'Match not started';
    let overs = '0.0';
    let striker = 'Unavailable';
    let nonStriker = 'Unavailable';
    let bowler = 'Unavailable';
    let lastBall = '-';
    let lastOver = [];
    let status = 'Live';
    let source = 'none';

    // ==================================================
    // PRIMARY SOURCE : CRICBUZZ COMMENTARY API
    // ==================================================

    try {

      const commentaryUrl =
        `https://www.cricbuzz.com/api/cricket-match/commentary/${matchId}`;

      const commentary =
        await axios.get(
          commentaryUrl,
          {
            headers: {
              'User-Agent': 'Mozilla/5.0',
              'Accept': 'application/json'
            },
            timeout: 10000
          }
        );

      const data = commentary.data;

      if (
        data &&
        data.commentaryList &&
        data.commentaryList.length
      ) {

        const latest =
          data.commentaryList[0] || {};

        liveScore =
          latest.score ||
          liveScore;

        overs =
          latest.overNumber ||
          overs;

        striker =
          latest.batsmanStriker ||
          striker;

        nonStriker =
          latest.batsmanNonStriker ||
          nonStriker;

        bowler =
          latest.bowler ||
          bowler;

        lastBall =
          latest.event ||
          lastBall;

        if (latest.overSummary) {
          lastOver =
            latest.overSummary.split(' ');
        }

        status =
          data.matchHeader?.status ||
          status;

        source = 'cricbuzz';
      }

    }
    catch (e) {

      // Cricbuzz failed silently
    }

    // ==================================================
    // FALLBACK SOURCE : CREX SCRAPER
    // ==================================================

    if (
      source === 'none' ||
      liveScore === 'Match not started'
    ) {

      try {

        const crexSearch =
          await axios.get(
            'https://crex.live',
            {
              headers: {
                'User-Agent': 'Mozilla/5.0'
              },
              timeout: 10000
            }
          );

        const $c =
          cheerio.load(crexSearch.data);

        let found = false;

        $('body *').each((i, el) => {

          if (found) return false;

          const txt =
            $c(el)
              .text()
              .trim();

          const scoreMatch =
            txt.match(
              /\d{1,3}\/\d{1,2}/
            );

          if (
            scoreMatch &&
            scoreMatch[0]
          ) {

            const score =
              scoreMatch[0];

            const runs =
              parseInt(
                score.split('/')[0]
              );

            if (
              runs > 20 &&
              runs < 300
            ) {

              liveScore = score;
              found = true;
              source = 'crex';
            }
          }
        });

      }
      catch (e) {

        // Crex failed silently
      }
    }

    // =========================
    // PREDICTION ENGINE
    // =========================

    let prediction = 'Balanced';

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

        source:
          source,

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
