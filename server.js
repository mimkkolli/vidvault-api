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
    // Fixed template string for the referer URL
    const refererUrl = type === 'tv'
      ? `https://vidvault.to/tv/${id}/${season}/${ep}`
      : `https://vidvault.to/movie/${id}`;

    // Step 1: Get token with browser headers
    const tokenRes = await axios.get('https://vidvault.to/api/get-token', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://vidvault.to/',
        'Origin': 'https://vidvault.to'
      },
      timeout: 15000
    });

    const token = tokenRes.data?.t || tokenRes.data?.token;
    
    if (!token) {
      return res.json({
        success: false,
        error: 'Failed to get token',
        tokenResponse: tokenRes.data
      });
    }

    // Step 2: Prepare payload
    const payload = {
      e: String(id),
      type: type === 'tv' ? 'tv' : 'movie',
      tmdbId: Number(id)
    };

    if (type === 'tv') {
      payload.season = Number(season);
      payload.episode = Number(ep);
    }

    // Step 3: Request download links via proxy API
    const downloadRes = await axios.post(
      'https://vidvault.to/api/download-proxy',
      payload,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Content-Type': 'application/json',
          'Referer': refererUrl,
          'Origin': 'https://vidvault.to',
          'x-request-token': token
        },
        timeout: 20000
      }
    );

    const data = downloadRes.data;

    // Log raw data directly to Render console logs for debugging
    console.log("RAW VIDVAULT RESPONSE:", JSON.stringify(data));

    let bestUrl = null;
    let isDirectFile = false;
    let quality = null;
    let size = null;

    // Check all known response structures
    if (data?.mkvV2Data?.url) {
      bestUrl = data.mkvV2Data.url;
      isDirectFile = true;
      quality = data.mkvV2Data.quality || null;
      size = data.mkvV2Data.size || null;
    } 
    else if (data?.mp4Data?.downloadInfo?.data?.downloads?.length > 0) {
      const downloads = data.mp4Data.downloadInfo.data.downloads;
      const best = downloads[downloads.length - 1];
      bestUrl = best.url;
      isDirectFile = true;
      quality = best.resolution ? best.resolution + 'p' : null;
      size = best.size || null;
    } 
    else if (data?.mkvData?.files?.length > 0) {
      bestUrl = data.mkvData.files[0].url;
      isDirectFile = true;
    }
    else if (data?.url) {
      bestUrl = data.url;
      isDirectFile = true;
    }
    else if (data?.downloadUrl) {
      bestUrl = data.downloadUrl;
      isDirectFile = true;
    }

    return res.json({
      success: !!bestUrl,
      downloadUrl: bestUrl,
      isDirectFile,
      quality,
      size,
      debug: {
        fullResponse: data
      }
    });

  } catch (error) {
    console.error('Extraction error details:', error.response?.status, error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
      status: error.response?.status || null,
      responseData: error.response?.data || null
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Extraction server active on port ${PORT}`);
});
