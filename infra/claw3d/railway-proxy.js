const http = require("node:http");
const net = require("node:net");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const UPSTREAM_HOST = "127.0.0.1";
const UPSTREAM_PORT = 3001;
const PORT = 3000;
const TOKEN = String(process.env.STUDIO_ACCESS_TOKEN || "").trim();

if (!TOKEN) {
  console.error("STUDIO_ACCESS_TOKEN is required by the Railway auth proxy.");
  process.exit(1);
}

console.log(`Starting Claw3D upstream on ${UPSTREAM_HOST}:${UPSTREAM_PORT}; public proxy on 0.0.0.0:${PORT}`);

const claw3d = spawn("node", ["server/index.js"], {
  cwd: "/opt/claw3d",
  env: { ...process.env, HOST: "127.0.0.1", PORT: String(UPSTREAM_PORT) },
  stdio: "inherit",
});
claw3d.on("exit", (code, signal) => {
  console.error(`Claw3D upstream exited (code=${code}, signal=${signal || ""})`);
  process.exit(code || 1);
});

function parseCookies(header = "") {
  const out = {};
  for (const part of String(header).split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

function safeEqual(a, b) {
  const A = Buffer.from(String(a));
  const B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

function authed(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  return safeEqual(cookies.studio_access || "", TOKEN);
}

function loginHtml(error = "") {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Claw3D</title><style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#100c09;color:#f5eadc;font-family:system-ui,-apple-system,sans-serif}
.card{width:min(420px,100%);background:#1d1510;border:1px solid #4a3324;border-radius:18px;padding:24px;box-shadow:0 18px 60px #0009}
h1{margin:0 0 8px;font-size:26px}p{margin:0 0 20px;opacity:.72}
input{width:100%;padding:14px;border-radius:12px;border:1px solid #5b4332;background:#120e0b;color:white;font-size:16px}
button{width:100%;margin-top:12px;padding:14px;border:0;border-radius:12px;background:#d2a35e;color:#17100a;font-size:16px;font-weight:800}
.err{color:#ff9c9c;margin-bottom:12px;font-size:14px}</style></head>
<body><form class="card" method="POST" action="/login">
<h1>Entrar no Claw3D</h1><p>Use o mesmo token do OpenClaw Gateway.</p>
${error ? `<div class="err">${error}</div>` : ""}
<input type="password" name="token" placeholder="Token" autocomplete="current-password" required>
<button type="submit">Entrar</button></form></body></html>`;
}

function proxyHttp(req, res) {
  const upstream = http.request({
    host: UPSTREAM_HOST,
    port: UPSTREAM_PORT,
    method: req.method,
    path: req.url,
    headers: req.headers,
  }, (up) => {
    res.writeHead(up.statusCode || 502, up.headers);
    up.pipe(res);
  });
  upstream.on("error", () => {
    if (!res.headersSent) res.writeHead(502, {"content-type":"text/plain; charset=utf-8"});
    res.end("Claw3D upstream unavailable.");
  });
  req.pipe(upstream);
}

const server = http.createServer((req, res) => {
  const path = String(req.url || "/").split("?")[0];

  if (path === "/healthz") {
    res.writeHead(200, {"content-type":"text/plain"});
    return res.end("ok");
  }

  if (path === "/login" && req.method === "GET") {
    res.writeHead(200, {"content-type":"text/html; charset=utf-8"});
    return res.end(loginHtml());
  }

  if (path === "/login" && req.method === "POST") {
    let body = "";
    req.on("data", chunk => { if (body.length < 8192) body += chunk.toString("utf8"); });
    req.on("end", () => {
      const submitted = new URLSearchParams(body).get("token") || "";
      if (!safeEqual(submitted, TOKEN)) {
        res.writeHead(401, {"content-type":"text/html; charset=utf-8"});
        return res.end(loginHtml("Token inválido."));
      }
      res.writeHead(303, {
        "set-cookie": `studio_access=${TOKEN}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`,
        "location": "/office"
      });
      res.end();
    });
    return;
  }

  if (!authed(req)) {
    res.writeHead(302, {"location":"/login"});
    return res.end();
  }

  proxyHttp(req, res);
});

server.on("upgrade", (req, socket, head) => {
  if (!authed(req)) {
    socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
    return socket.destroy();
  }
  const upstream = net.connect(UPSTREAM_PORT, UPSTREAM_HOST, () => {
    let raw = `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`;
    for (const [k, v] of Object.entries(req.headers)) {
      if (Array.isArray(v)) for (const item of v) raw += `${k}: ${item}\r\n`;
      else if (v !== undefined) raw += `${k}: ${v}\r\n`;
    }
    raw += "\r\n";
    upstream.write(raw);
    if (head?.length) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Claw3D auth proxy listening on 0.0.0.0:${PORT}, upstream ${UPSTREAM_HOST}:${UPSTREAM_PORT}`);
});