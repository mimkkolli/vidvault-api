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

    let bestUrl = null;
    let isDirectFile = false;
    let quality = null;
    let size = null;

    // New structure (mkvV2Data)
    if (data?.mkvV2Data?.url) {
      bestUrl = data.mkvV2Data.url;
      isDirectFile = true;
      quality = data.mkvV2Data.quality || null;
      size = data.mkvV2Data.size || null;
    }
    // Fallback to old mp4 structure (just in case)
    else if (data?.mp4Data?.downloadInfo?.data?.downloads?.length > 0) {
      const downloads = data.mp4Data.downloadInfo.data.downloads;
      const best = downloads[downloads.length - 1];
      bestUrl = best.url;
      isDirectFile = true;
      quality = best.resolution ? best.resolution + 'p' : null;
      size = best.size || null;
    }
    // Fallback to old mkv structure
    else if (data?.mkvData?.files?.length > 0) {
      bestUrl = data.mkvData.files[0].url;
      isDirectFile = true;
    }

    const responseData = {
      success: !!bestUrl,
      downloadUrl: bestUrl,
      isDirectFile,
      quality,
      size,
      allLinks: {
        mkvV2: data?.mkvV2Data || null,
        mp4: data?.mp4Data || null,
        mkv: data?.mkvData || null
      }
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