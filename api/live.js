const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // 1. Fetching with a rotating User-Agent to avoid being blocked
    const { data: html } = await axios.get('https://www.cricbuzz.com/cricket-match/live-scores', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      timeout: 5000
    });

    const $ = cheerio.load(html);
    const matches = [];

    // 2. The "Aggressive Search": Look for any card that contains a match
    $('.cb-col-100.cb-col.cb-mtch-lst, .cb-mtch-lst, .cb-scr-wll-chvrn').each((i, el) => {
      const matchText = $(el).text();
      
      // Look for the "vs" pattern to identify a match
      if (matchText.includes('vs')) {
        const title = $(el).find('h3, h2, .cb-lv-scr-mtch-hdr').first().text().trim();
        const status = $(el).find('.cb-text-live, .cb-text-complete, .cb-text-preview, .cb-lv-scrs-col').first().text().trim();
        
        // Grab scores based on position if classes are missing
        const scores = $(el).find('.cb-ovr-flo').map((i, e) => $(e).text().trim()).get();

        matches.push({
          title: title || "Live Match",
          status: status || "In Progress",
          summary: matchText.replace(/\s\s+/g, ' ').trim().substring(0, 100),
          live_scores: scores.filter(s => s.length > 0)
        });
      }
    });

    // 3. Fallback: If nothing found, search for the specific GT vs SRH text
    if (matches.length === 0) {
      const matchHeader = $("a[title*='vs']").first().text();
      if (matchHeader) {
        matches.push({ title: matchHeader, status: "Live Now", note: "Deep scan recovery" });
      }
    }

    res.status(200).json({
      success: true,
      match_count: matches.length,
      data: matches
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
