import express from 'express';
import cors from 'cors';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// Enable stealth plugin
puppeteer.use(StealthPlugin());

const app = express();
app.use(cors());

app.get('/api/get-download', async (req, res) => {
  const { type, id, season, ep } = req.query;
  const targetUrl = type === 'tv' 
    ? `https://vidvault.ru/tv/${id}/${season || 1}/${ep || 1}`
    : `https://vidvault.ru/movie/${id}`;

  let browser = null;

  try {
    browser = await puppeteer.launch({
      executablePath: '/data/data/com.termux/files/usr/bin/chromium-browser',
      headless: "new",
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1920,1080'
      ]
    });

    const page = await browser.newPage();

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    );

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 45000 });

    await browser.close();
    return res.json({ downloadUrl: targetUrl, isDirectFile: false });

  } catch (error) {
    if (browser) await browser.close();
    console.error("Extraction error:", error.message);
    return res.status(500).json({ error: "Failed to bypass challenge", details: error.message });
  }
});

app.listen(3000, () => console.log('Extraction server active at http://localhost:3000'));
