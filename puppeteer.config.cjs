const { join } = require('path');

module.exports = {
  // Changes the cache directory to a local folder in your project
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
