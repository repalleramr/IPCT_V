const axios = require('axios');
const cheerio = require('cheerio');

export default async function handler(req, res) {
  // 1. Handle preflight requests for CORS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // 2. Fetch the HTML from the source
    const url = 'https://www.cricbuzz.com/cricket-match/live-scores';
    const { data } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
      }
    });

    // 3. Load HTML into Cheerio for parsing
    const $ = cheerio.load(data);
    const matches = [];

    // 4. Extract match data (Note: CSS classes must be updated if the source UI changes)
    $('.cb-mtch-lst').each((index, element) => {
      const matchTitle = $(element).find('h3').text().trim();
      const matchStatus = $(element).find('.cb-text-live, .cb-text-complete, .cb-text-preview').text().trim();
      
      // Extracting team scores
      const batTeam = $(element).find('.cb-hm-scg-bat .cb-hm-scg-tm-nm').text().trim();
      const batScore = $(element).find('.cb-hm-scg-bat .cb-ovr-flo:not(.cb-hm-scg-tm-nm)').text().trim();
      
      const bowlTeam = $(element).find('.cb-hm-scg-bwl .cb-hm-scg-tm-nm').text().trim();
      const bowlScore = $(element).find('.cb-hm-scg-bwl .cb-ovr-flo:not(.cb-hm-scg-tm-nm)').text().trim();

      if (matchTitle) {
        matches.push({
          title: matchTitle,
          status: matchStatus,
          batting: { team: batTeam, score: batScore },
          bowling: { team: bowlTeam, score: bowlScore }
        });
      }
    });

    // 5. Send the clean JSON payload back to your app
    res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      data: matches
    });

  } catch (error) {
    console.error("Uplink Error:", error.message);
    res.status(500).json({ 
      success: false, 
      message: "Failed to fetch uplink data", 
      error: error.message 
    });
  }
}
