const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());

app.get('/', (req, res) => {
  res.send('Moboxed Extraction Server Active!');
});

// Simple cache
const linkCache = new Map();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

app.get('/api/get-download', async (req, res) => {
  const { type = 'movie', id, season = 1, ep = 1 } = req.query;

  if (!id) {
    return res.status(400).json({ error: "Missing media ID parameter." });
  }

  const cacheKey = `\( {type}_ \){id}_\( {season}_ \){ep}`;
  const cached = linkCache.get(cacheKey);

  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
    console.log('Serving from cache:', cacheKey);
    return res.json(cached.data);
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
      return res.status(502).json({ error: 'Failed to get token from VidVault' });
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

    const data = downloadRes.data;
    const results = { mp4: [] };

    // Only take MP4 links
    const mp4Downloads = data?.mp4Data?.downloadInfo?.data?.downloads || [];
    mp4Downloads.forEach(item => {
      if (item.url && !item.vipLocked) {
        results.mp4.push({
          quality: item.resolution + 'p',
          size: item.size,
          url: item.url,
          format: 'MP4'
        });
      }
    });

    let bestUrl = null;
    let isDirectFile = false;

    if (results.mp4.length > 0) {
      // Prefer highest quality
      bestUrl = results.mp4[results.mp4.length - 1].url;
      isDirectFile = true;
    }

    const responseData = {
      success: !!bestUrl,
      downloadUrl: bestUrl,
      isDirectFile,
      allLinks: results
    };

    // Save to cache
    linkCache.set(cacheKey, {
      data: responseData,
      timestamp: Date.now()
    });

    return res.json(responseData);

  } catch (error) {
    console.error('Extraction error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to extract download links',
      details: error.message
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Extraction server active on port ${PORT}`);
});