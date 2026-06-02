const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const app = express();

app.use(cors({ origin: '*' }));

app.get('/', (req, res) => res.send('PeterGames Proxy Running'));

app.get('/proxy', async (req, res) => {
  const target = req.query.url;
  if (!target) return res.status(400).send('Missing url param');

  try {
    const decoded = decodeURIComponent(target);
    const targetUrl = new URL(decoded);
    const origin = targetUrl.origin;
    const proxyBase = req.protocol + '://' + req.get('host') + '/proxy?url=';

    const response = await fetch(decoded, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': origin + '/',
        'Origin': origin,
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'sec-ch-ua': '"Chromium";v="122"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
      },
      redirect: 'follow',
    });

    const ct = response.headers.get('content-type') || 'application/octet-stream';

    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', ct);

    if (ct.includes('text/html')) {
      let html = await response.text();

      html = html
        .replace(/(src|href|action)=["'](https?:\/\/[^"']+)["']/gi,
          (m, attr, url) => attr + '="' + proxyBase + encodeURIComponent(url) + '"')
        .replace(/(src|href)=["'](\/\/[^"']+)["']/gi,
          (m, attr, url) => attr + '="' + proxyBase + encodeURIComponent('https:' + url) + '"')
        .replace(/(src|href)=["'](\/[^"'\/][^"']*?)["']/gi,
          (m, attr, url) => attr + '="' + proxyBase + encodeURIComponent(origin + url) + '"');

      var hostEscaped = req.get('host').replace(/\./g, '\\\\.');
      var inject = '<script>' +
        'var __pb="' + proxyBase + '";' +
        'var __h="' + req.get('host') + '";' +
        'var _f=window.fetch;' +
        'window.fetch=function(u,o){' +
          'if(typeof u==="string"&&u.match(/^https?:\\/\\//i)&&u.indexOf(__h)<0){' +
            'u=__pb+encodeURIComponent(u);' +
          '}return _f(u,o);' +
        '};' +
        'var _x=XMLHttpRequest.prototype.open;' +
        'XMLHttpRequest.prototype.open=function(m,u){' +
          'if(typeof u==="string"&&u.match(/^https?:\\/\\//i)&&u.indexOf(__h)<0){' +
            'u=__pb+encodeURIComponent(u);' +
          '}return _x.apply(this,arguments);' +
        '};' +
        '</script>';

      html = html.replace('<head>', '<head>' + inject);
      res.send(html);

    } else if (ct.includes('javascript')) {
      let js = await response.text();
      res.send(js);
    } else {
      response.body.pipe(res);
    }

  } catch (e) {
    console.error('Proxy error:', e.message);
    res.status(500).send('Proxy error: ' + e.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Proxy on port ' + PORT));
