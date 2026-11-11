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
    // Step 1: Get token
    console.log('Requesting token...');
    const tokenRes = await axios.get('https://vidvault.to/api/get-token', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://vidvault.to/'
      },
      timeout: 15000
    });

    const token = tokenRes.data?.t || tokenRes.data?.token;
    console.log('Token received:', token ? 'Yes' : 'No');

    if (!token) {
      return res.json({
        success: false,
        error: 'No token received',
        tokenResponse: tokenRes.data
      });
    }

    // Step 2: Prepare payload
    const payload = {
      e: id,
      type: type === 'tv' ? 'tv' : 'movie',
      tmdbId: Number(id)
    };

    if (type === 'tv') {
      payload.season = Number(season);
      payload.episode = Number(ep);
    }

    console.log('Sending payload:', payload);

    // Step 3: Request download links
    const downloadRes = await axios.post(
      'https://vidvault.to/api/download-proxy',
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': type === 'tv'
            ? `https://vidvault.to/tv/\( {id}/ \){season}/${ep}`
            : `https://vidvault.to/movie/${id}`,
          'x-request-token': token
        },
        timeout: 20000
      }
    );

    const data = downloadRes.data;
    console.log('Download-proxy response keys:', Object.keys(data || {}));

    // Return the full response so we can see the structure
    return res.json({
      success: false,
      message: 'Full response from VidVault (for debugging)',
      tokenUsed: token.substring(0, 20) + '...',
      payloadSent: payload,
      fullResponse: data
    });

  } catch (error) {
    console.error('Extraction error:', error.message);
    
    return res.json({
      success: false,
      error: error.message,
      status: error.response?.status || null,
      responseData: error.response?.data || null,
      details: 'Check the values above'
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Extraction server active on port ${PORT}`);
});