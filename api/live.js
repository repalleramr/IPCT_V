const axios = require('axios');

module.exports = async function (req, res) {

  try {

    const r = await axios.get(
      'https://www.cricbuzz.com'
    );

    return res.status(200).json({
      success: true,
      length: r.data.length
    });

  } catch (e) {

    return res.status(200).json({
      success: false,
      error: e.message
    });
  }
};
