const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());

app.get('/', (req, res) => {
  res.send('Moboxed Lightweight Extraction Server Active!');
});

app.get('/api/get-download', async (req, res) => {
  const { type = 'movie', id } = req.query;
  const season = type === 'tv' ? (req.query.season || 1) : null;
  const ep = type === 'tv' ? (req.query.ep || 1) : null;

  console.log("INCOMING REQUEST QUERY:", { type, id, season, ep });

  if (!id) {
    return res.status(400).json({ error: "Missing media ID parameter." });
  }

  try {
    // Step 1: Create an axios instance with common browser headers
    const client = axios.create({
      baseURL: 'https://vidvault.to',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Origin': 'https://vidvault.to'
      }
    });

    // Step 2: Fetch the request token from vidvault.to
    const tokenRes = await client.get('/api/get-token');
    const token = tokenRes.data?.t || tokenRes.data?.token;

    if (!token) {
      throw new Error("Failed to acquire token from vidvault.to");
    }

    // Step 3: Build payload and headers for download-proxy
    const payload = {
      e: String(id),
      type: type === 'tv' ? 'tv' : 'movie',
      tmdbId: Number(id)
    };

    let refererUrl = `https://vidvault.to/movie/${id}`;
    if (type === 'tv') {
      payload.season = Number(season);
      payload.episode = Number(ep);
      refererUrl = `https://vidvault.to/tv/${id}/${season}/${ep}`;
    }

    const proxyRes = await client.post('/api/download-proxy', payload, {
      headers: {
        'Content-Type': 'application/json',
        'Referer': refererUrl,
        'x-request-token': token
      }
    });

    const capturedData = proxyRes.data;

    let bestUrl = null;
    let isDirectFile = false;
    let quality = null;
    let size = null;

    if (capturedData?.mkvV2Data?.url) {
      bestUrl = capturedData.mkvV2Data.url;
      isDirectFile = true;
      quality = capturedData.mkvV2Data.quality || null;
      size = capturedData.mkvV2Data.size || null;
    } 
    else if (capturedData?.mp4Data?.downloadInfo?.data?.downloads?.length > 0) {
      const downloads = capturedData.mp4Data.downloadInfo.data.downloads;
      const best = downloads[downloads.length - 1];
      bestUrl = best.url;
      isDirectFile = true;
      quality = best.resolution ? best.resolution + 'p' : null;
      size = best.size || null;
    } 
    else if (capturedData?.mkvData?.files?.length > 0) {
      bestUrl = capturedData.mkvData.files[0].url;
      isDirectFile = true;
    }
    else if (capturedData?.url) {
      bestUrl = capturedData.url;
      isDirectFile = true;
    }
    else if (capturedData?.downloadUrl) {
      bestUrl = capturedData.downloadUrl;
      isDirectFile = true;
    }

    return res.json({
      success: !!bestUrl,
      downloadUrl: bestUrl,
      isDirectFile,
      quality,
      size,
      debug: {
        fullResponse: capturedData
      }
    });

  } catch (error) {
    console.error('Extraction error:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Lightweight extraction server active on port ${PORT}`);
});
