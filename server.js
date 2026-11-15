const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');

const app = express();
app.use(cors());

app.get('/', (req, res) => {
  res.send('Moboxed Puppeteer Extraction Server Active!');
});

app.get('/api/get-download', async (req, res) => {
  const { type = 'movie', id } = req.query;
  // Only grab season and ep if it's actually a tv show
  const season = type === 'tv' ? (req.query.season || 1) : null;
  const ep = type === 'tv' ? (req.query.ep || 1) : null;

  console.log("INCOMING REQUEST QUERY:", { type, id, season, ep });

  if (!id) {
    return res.status(400).json({ error: "Missing media ID parameter." });
  }

  let browser = null;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');

    await page.goto('https://vidvault.to/', { waitUntil: 'networkidle2', timeout: 30000 });

    // Clean URL construction based strictly on type
    const targetUrl = type === 'tv'
      ? `https://vidvault.to/tv/${id}/${season}/${ep}`
      : `https://vidvault.to/movie/${id}`;

    console.log(`Navigating to target: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    const capturedData = await page.evaluate(async (mediaId, mediaType, mediaSeason, mediaEp) => {
      try {
        const tokenRes = await fetch('https://vidvault.to/api/get-token');
        const tokenJson = await tokenRes.json();
        const token = tokenJson?.t || tokenJson?.token;

        if (!token) return { error: "Failed to acquire browser token" };

        const payload = {
          e: String(mediaId),
          type: mediaType === 'tv' ? 'tv' : 'movie',
          tmdbId: Number(mediaId)
        };

        let refererUrl = `https://vidvault.to/movie/${mediaId}`;

        if (mediaType === 'tv') {
          payload.season = Number(mediaSeason);
          payload.episode = Number(mediaEp);
          refererUrl = `https://vidvault.to/tv/${mediaId}/${mediaSeason}/${mediaEp}`;
        }

        const proxyRes = await fetch('https://vidvault.to/api/download-proxy', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Referer': refererUrl,
            'Origin': 'https://vidvault.to',
            'x-request-token': token
          },
          body: JSON.stringify(payload)
        });

        return await proxyRes.json();
      } catch (err) {
        return { error: err.message };
      }
    }, id, type, season, ep);

    await browser.close();
    browser = null;

    if (!capturedData || capturedData.error) {
      return res.json({
        success: false,
        error: capturedData?.error || 'Failed to fetch payload from browser context.',
        downloadUrl: null
      });
    }

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
    if (browser) {
      await browser.close();
    }
    console.error('Puppeteer extraction error:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Puppeteer extraction server active on port ${PORT}`);
});
