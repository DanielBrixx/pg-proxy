const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const http = require("http");
const app = express();
const server = http.createServer(app);

app.use(cors({ origin: "*" }));
app.use(express.json());

// Health check
app.get("/", (req, res) => res.send("PG Proxy OK"));

// Full reverse proxy endpoint
app.use("/pg/", async (req, res) => {
  const target = req.url.slice(1); // remove leading /
  if (!target) return res.status(400).send("No target");

  let decoded;
  try { decoded = decodeURIComponent(target); } catch(e) { decoded = target; }

  // If not a full URL, reject
  if (!decoded.startsWith("http")) return res.status(400).send("Bad URL");

  try {
    const targetUrl = new URL(decoded);
    const proxyOrigin = req.protocol + "://" + req.get("host");
    const proxyBase = proxyOrigin + "/pg/" + targetUrl.origin;

    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
      "Accept": req.headers["accept"] || "*/*",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "identity",
      "Referer": targetUrl.origin + "/",
      "Origin": targetUrl.origin,
      "Sec-Fetch-Dest": req.headers["sec-fetch-dest"] || "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "same-origin",
    };

    // Forward cookies if any
    if (req.headers["cookie"]) headers["Cookie"] = req.headers["cookie"];

    const response = await fetch(decoded, {
      method: req.method,
      headers,
      redirect: "follow",
    });

    const ct = response.headers.get("content-type") || "";

    // Copy response headers but strip blocking ones
    response.headers.forEach((val, key) => {
      const skip = ["x-frame-options","content-security-policy","strict-transport-security","x-content-type-options","transfer-encoding","content-encoding","content-length"];
      if (!skip.includes(key.toLowerCase())) {
        try { res.setHeader(key, val); } catch(e) {}
      }
    });
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("X-Proxy", "petergames");

    function rewriteUrl(url) {
      if (!url) return url;
      if (url.startsWith("//")) url = "https:" + url;
      if (url.startsWith("/")) return "/pg/" + targetUrl.origin + url;
      if (url.startsWith("http")) return "/pg/" + url;
      return url;
    }

    if (ct.includes("text/html")) {
      let html = await response.text();

      // Rewrite all URLs
      html = html
        .replace(/(<(?:script|img|link|source|video|audio|iframe)[^>]*\s(?:src|href|action)=["'])([^"']+)(["'])/gi, (m, pre, url, post) => pre + rewriteUrl(url) + post)
        .replace(/url\(["']?((?:https?:)?\/\/[^"')]+)["']?\)/gi, (m, url) => "url(" + rewriteUrl(url) + ")")
        .replace(/(@import\s+["'])([^"']+)(["'])/gi, (m, pre, url, post) => pre + rewriteUrl(url) + post);

      // Inject interception script
      const script = `<script>
(function(){
  var pb = "${proxyOrigin}/pg/";
  function rw(u) {
    if (!u || u.startsWith("data:") || u.startsWith("blob:") || u.startsWith("#")) return u;
    if (u.startsWith("//")) u = "https:" + u;
    if (u.startsWith("/") && !u.startsWith("//")) return pb + "${targetUrl.origin}" + u;
    if (u.startsWith("http")) return pb + u;
    return u;
  }
  // Patch fetch
  var of = window.fetch;
  window.fetch = function(u, o) { if(typeof u==="string") u=rw(u); return of.call(this,u,o); };
  // Patch XHR
  var ox = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(m,u) { if(typeof u==="string") u=rw(u); return ox.apply(this,arguments); };
  // Patch WebSocket
  var oWS = window.WebSocket;
  window.WebSocket = function(u, p) {
    if(typeof u==="string") {
      u = u.replace("wss://","wss://${req.get("host")}/").replace("ws://","ws://${req.get("host")}/");
    }
    return new oWS(u, p);
  };
  // Patch createElement src
  var oCA = document.createElement.bind(document);
  document.createElement = function(tag) {
    var el = oCA(tag);
    if (tag.toLowerCase()==="script"||tag.toLowerCase()==="img"||tag.toLowerCase()==="iframe") {
      Object.defineProperty(el, "src", {
        set: function(v) { el.setAttribute("src", rw(v)); },
        get: function() { return el.getAttribute("src"); }
      });
    }
    return el;
  };
  console.log("PG Proxy injected");
})();
</script>`;

      html = html.replace(/<head[^>]*>/i, (m) => m + script);
      res.setHeader("Content-Type", "text/html");
      res.send(html);

    } else if (ct.includes("javascript")) {
      let js = await response.text();
      // Patch fetch/XHR calls in JS
      const proxyBase2 = proxyOrigin + "/pg/";
      js = js.replace(
        /new\s+WebSocket\s*\(\s*["'`](wss?:\/\/[^"'`]+)["'`]/g,
        (m, wsUrl) => m.replace(wsUrl, wsUrl)
      );
      res.setHeader("Content-Type", "application/javascript");
      res.send(js);

    } else {
      response.body.pipe(res);
    }

  } catch(e) {
    console.error("Proxy error:", e.message);
    res.status(500).send("Error: " + e.message);
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("PG Proxy on port " + PORT));
