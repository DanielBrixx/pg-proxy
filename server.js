const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const app = express();

app.use(cors({ origin: '*' }));

app.get('/', (req, res) => res.send('PeterGames Proxy Running ✅'));

app.get('/proxy', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send('Missing url param');
  try {
    const r = await fetch(decodeURIComponent(url), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.crazygames.com/',
        'Accept': '*/*'
      }
    });
    const ct = r.headers.get('content-type') || 'text/plain';
    res.setHeader('Content-Type', ct);
    res.setHeader('Access-Control-Allow-Origin', '*');
    r.body.pipe(res);
  } catch(e) {
    res.status(500).send('Error: ' + e.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Proxy on port ' + PORT));
