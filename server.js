//Server.js script here

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
const CACHE_TTL = 15 * 60 * 1000;

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

    if (data?.mkvV2Data?.url) {
      bestUrl = data.mkvV2Data.url;
      isDirectFile = true;
      quality = data.mkvV2Data.quality || null;
      size = data.mkvV2Data.size || null;
    } else if (data?.mp4Data?.downloadInfo?.data?.downloads?.length > 0) {
      const downloads = data.mp4Data.downloadInfo.data.downloads;
      const best = downloads[downloads.length - 1];
      bestUrl = best.url;
      isDirectFile = true;
      quality = best.resolution ? best.resolution + 'p' : null;
      size = best.size || null;
    } else if (data?.mkvData?.files?.length > 0) {
      bestUrl = data.mkvData.files[0].url;
      isDirectFile = true;
    }

    const responseData = {
      success: !!bestUrl,
      downloadUrl: bestUrl,
      isDirectFile,
      quality,
      size
    };

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

// Improved Proxy route with proper filename
app.get('/proxy-download', async (req, res) => {
  const fileUrl = req.query.url;
  const filename = req.query.filename || 'movie.mkv';

  if (!fileUrl) {
    return res.status(400).send('Missing url parameter');
  }

  try {
    const response = await axios({
      method: 'get',
      url: fileUrl,
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://vidvault.to/',
        'Origin': 'https://vidvault.to'
      },
      timeout: 60000,
      maxRedirects: 5
    });

    // Set proper headers so the file has a nice name
    res.setHeader('Content-Type', response.headers['content-type'] || 'video/x-matroska');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    if (response.headers['content-length']) {
      res.setHeader('Content-Length', response.headers['content-length']);
    }

    response.data.pipe(res);

  } catch (err) {
    console.error('Proxy download error:', err.message);
    res.status(502).send('Failed to fetch the file. The link may have expired or is blocked.');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Extraction server active on port ${PORT}`);
});