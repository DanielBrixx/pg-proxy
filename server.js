const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const app = express();

app.use(cors({ origin: '*' }));

app.get('/', (req, res) => res.send('PeterGames Proxy Running ✅'));

// Full reverse proxy - rewrites all assets to go through proxy too
app.get('/proxy', async (req, res) => {
  const target = req.query.url;
  if (!target) return res.status(400).send('Missing url');

  try {
    const decoded = decodeURIComponent(target);
    const response = await fetch(decoded, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.crazygames.com/',
        'Origin': 'https://www.crazygames.com',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });

    const ct = response.headers.get('content-type') || 'text/plain';
    res.setHeader('Content-Type', ct);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Frame-Options', 'ALLOWALL');
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');

    // For HTML pages, rewrite URLs so all assets go through proxy
    if (ct.includes('text/html')) {
      let html = await response.text();
      const base = new URL(decoded);
      const origin = base.origin;
      const proxyBase = '/proxy?url=';

      // Rewrite absolute URLs
      html = html.replace(/(src|href|action)="(https?:\/\/[^"]+)"/gi, (m, attr, url) => {
        return `${attr}="${proxyBase}${encodeURIComponent(url)}"`;
      });
      // Rewrite protocol-relative URLs
      html = html.replace(/(src|href)="(\/\/[^"]+)"/gi, (m, attr, url) => {
        return `${attr}="${proxyBase}${encodeURIComponent('https:' + url)}"`;
      });
      // Rewrite root-relative URLs
      html = html.replace(/(src|href)="(\/[^"\/][^"]*?)"/gi, (m, attr, url) => {
        return `${attr}="${proxyBase}${encodeURIComponent(origin + url)}"`;
      });
      // Rewrite JS fetch/import calls
      html = html.replace(/fetch\(['"]((https?:\/\/|\/)[^'"]+)['"]\)/g, (m, url) => {
        const abs = url.startsWith('/') ? origin + url : url;
        return `fetch('${proxyBase}${encodeURIComponent(abs)}')`;
      });

      res.send(html);
    } else if (ct.includes('javascript') || ct.includes('text/css')) {
      let text = await response.text();
      const base = new URL(decoded);
      const origin = base.origin;
      // Rewrite URLs in JS/CSS
      text = text.replace(/url\(['"]?(https?:\/\/[^'"\)]+)['"]?\)/gi, (m, url) => {
        return `url('/proxy?url=${encodeURIComponent(url)}')`;
      });
      res.send(text);
    } else {
      response.body.pipe(res);
    }
  } catch (e) {
    res.status(500).send('Proxy error: ' + e.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Proxy running on port ' + PORT));
