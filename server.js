const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');

const app = express();
app.use(cors());

app.get('/', (req, res) => {
  res.send('Moboxed Puppeteer Extraction Server Active!');
});

app.get('/api/get-download', async (req, res) => {
  const { type = 'movie', id, season = 1, ep = 1 } = req.query;

  console.log("INCOMING REQUEST QUERY:", { type, id, season, ep });

  if (!id) {
    return res.status(400).json({ error: "Missing media ID parameter." });
  }

  let browser = null;
  try {
    // Launch headless browser optimized for cloud environments like Render
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
    
    // Set a realistic user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');

    // Construct target URL based on media type
    const targetUrl = type === 'tv'
      ? `https://vidvault.to/tv/${id}/${season}/${ep}`
      : `https://vidvault.to/movie/${id}`;

    console.log(`Navigating to: ${targetUrl}`);

    // Intercept API responses from vidvault.to
    let capturedData = null;
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('/api/download-proxy') || url.includes('/api/get-token')) {
        try {
          const json = await response.json();
          if (json && (json.mp4Data || json.mkvData || json.mkvV2Data || json.url || json.downloadUrl)) {
            capturedData = json;
          }
        } catch (e) {
          // Ignore non-json responses
        }
      }
    });

    // Go to the target page and wait for network activity to settle
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    // Give it a brief moment for async API requests to complete
    await new Promise(resolve => setTimeout(resolve, 3000));

    await browser.close();
    browser = null;

    if (!capturedData) {
      return res.json({
        success: false,
        error: 'Failed to intercept valid media payload via browser automation.',
        downloadUrl: null
      });
    }

    let bestUrl = null;
    let isDirectFile = false;
    let quality = null;
    let size = null;

    // Parse the captured data structure
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
