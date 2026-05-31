const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const app = express();

app.use(cors());

app.get('/proxy', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send('No URL');
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://www.crazygames.com'
      }
    });
    const contentType = response.headers.get('content-type') || '';
    res.set('Content-Type', contentType);
    res.set('Access-Control-Allow-Origin', '*');
    response.body.pipe(res);
  } catch (e) {
    res.status(500).send('Proxy error: ' + e.message);
  }
});

app.listen(process.env.PORT || 3000, () => console.log('Proxy running'));
