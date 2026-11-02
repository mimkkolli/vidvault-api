const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());

app.get('/', (req, res) => {
  res.send('Moboxed Extraction Server Active!');
});

app.get('/api/get-download', async (req, res) => {
  const { type = 'movie', id, season = 1, ep = 1 } = req.query;

  if (!id) {
    return res.status(400).json({ error: "Missing media ID parameter." });
  }

  try {
    // 1. Get token
    const tokenRes = await axios.get('https://vidvault.to/api/get-token', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://vidvault.to/'
      },
      timeout: 15000
    });

    const token = tokenRes.data?.t;
    if (!token) {
      return res.status(502).json({ 
        error: 'Failed to get token',
        tokenResponse: tokenRes.data 
      });
    }

    // 2. Request download sources
    const payload = {
      e: id,
      type: type === 'tv' ? 'tv' : 'movie',
      tmdbId: Number(id)
    };

    if (type === 'tv') {
      payload.season = Number(season);
      payload.episode = Number(ep);
    }

    const downloadRes = await axios.post(
      'https://vidvault.to/api/download-proxy',
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': type === 'tv'
            ? `https://vidvault.to/tv/\( {id}/ \){season}/${ep}`
            : `https://vidvault.to/movie/${id}`,
          'x-request-token': token
        },
        timeout: 20000
      }
    );

    // Return the FULL raw response for inspection
    return res.json({
      success: true,
      message: "Raw response from VidVault",
      token: token,
      payloadSent: payload,
      fullResponse: downloadRes.data
    });

  } catch (error) {
    console.error('Extraction error:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
      details: error.response ? error.response.data : null
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Extraction server active on port ${PORT}`);
});