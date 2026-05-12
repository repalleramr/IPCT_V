const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async function (req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const url = 'https://www.cricbuzz.com/cricket-match/live-scores';
    const { data } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
      }
    });

    const $ = cheerio.load(data);
    const matches = [];

    $('.cb-mtch-lst').each((index, element) => {
      const matchTitle = $(element).find('h3').text().trim();
      const matchStatus = $(element).find('.cb-text-live, .cb-text-complete, .cb-text-preview').text().trim();
      
      const batTeam = $(element).find('.cb-hm-scg-bat .cb-hm-scg-tm-nm').text().trim();
      const batScore = $(element).find('.cb-hm-scg-bat .cb-ovr-flo:not(.cb-hm-scg-tm-nm)').text().trim();
      
      const bowlTeam = $(element).find('.cb-hm-scg-bwl .cb-hm-scg-tm-nm').text().trim();
      const bowlScore = $(element).find('.cb-hm-scg-bwl .cb-ovr-flo:not(.cb-hm-scg-tm-nm)').text().trim();

      if (matchTitle) {
        matches.push({
          title: matchTitle,
          status: matchStatus,
          teams: {
            batting: { name: batTeam, score: batScore },
            bowling: { name: bowlTeam, score: bowlScore }
          }
        });
      }
    });

    res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      matches: matches
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
