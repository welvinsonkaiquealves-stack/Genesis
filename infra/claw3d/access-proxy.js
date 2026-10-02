const http = require('node:http');
const net = require('node:net');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 3000);
const UPSTREAM_HOST = process.env.UPSTREAM_HOST || 'sofia-claw3d-live.railway.internal';
const UPSTREAM_PORT = Number(process.env.UPSTREAM_PORT || 3000);
const TOKEN = String(process.env.STUDIO_ACCESS_TOKEN || '').trim();

if (!TOKEN) {
  console.error('STUDIO_ACCESS_TOKEN is required');
  process.exit(1);
}

function cookies(header='') {
  const out = {};
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0,i).trim();
    const v = part.slice(i+1).trim();
    if (k) out[k] = v;
  }
  return out;
}
function equal(a,b) {
  const A=Buffer.from(String(a)), B=Buffer.from(String(b));
  return A.length===B.length && crypto.timingSafeEqual(A,B);
}
function authed(req){ return equal(cookies(req.headers.cookie||'').studio_access||'', TOKEN); }

function page(error='') {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Claw3D</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#100c09;color:#f5eadc;font-family:system-ui,-apple-system,sans-serif}.card{width:min(420px,100%);background:#1d1510;border:1px solid #4a3324;border-radius:18px;padding:24px;box-shadow:0 18px 60px #0009}h1{margin:0 0 8px;font-size:26px}p{margin:0 0 20px;opacity:.72}input{width:100%;padding:14px;border-radius:12px;border:1px solid #5b4332;background:#120e0b;color:#fff;font-size:16px}button{width:100%;margin-top:12px;padding:14px;border:0;border-radius:12px;background:#d2a35e;color:#17100a;font-size:16px;font-weight:800}.err{color:#ff9c9c;margin-bottom:12px;font-size:14px}</style></head><body><form class="card" method="POST" action="/login"><h1>Entrar no Claw3D</h1><p>Use o mesmo token do OpenClaw Gateway.</p>${error?`<div class="err">${error}</div>`:''}<input name="token" type="password" placeholder="Token" autocomplete="current-password" required><button type="submit">Entrar</button></form></body></html>`;
}

function upstreamHeaders(req){
  return {...req.headers, host: `${UPSTREAM_HOST}:${UPSTREAM_PORT}`, cookie:`studio_access=${encodeURIComponent(TOKEN)}`};
}
function proxyHttp(req,res){
  const up=http.request({host:UPSTREAM_HOST,port:UPSTREAM_PORT,method:req.method,path:req.url,headers:upstreamHeaders(req)}, r=>{res.writeHead(r.statusCode||502,r.headers);r.pipe(res)});
  up.on('error',e=>{console.error('upstream http error',e.message);if(!res.headersSent)res.writeHead(502,{'content-type':'text/plain; charset=utf-8'});res.end('Claw3D indisponível.')});
  req.pipe(up);
}

const server=http.createServer((req,res)=>{
  const path=String(req.url||'/').split('?')[0];
  if(path==='/healthz'){res.writeHead(200,{'content-type':'text/plain'});return res.end('ok')}
  if(path==='/login'&&req.method==='GET'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end(page())}
  if(path==='/login'&&req.method==='POST'){
    let body=''; req.on('data',c=>{if(body.length<8192)body+=c.toString('utf8')});
    req.on('end',()=>{const submitted=new URLSearchParams(body).get('token')||'';if(!equal(submitted,TOKEN)){res.writeHead(401,{'content-type':'text/html; charset=utf-8'});return res.end(page('Token inválido.'))}res.writeHead(303,{'set-cookie':`studio_access=${encodeURIComponent(TOKEN)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`,'location':'/office'});res.end()}); return;
  }
  if(!authed(req)){res.writeHead(302,{location:'/login'});return res.end()}
  proxyHttp(req,res);
});

server.on('upgrade',(req,socket,head)=>{
  if(!authed(req)){socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');return socket.destroy()}
  const upstream=net.connect(UPSTREAM_PORT,UPSTREAM_HOST,()=>{
    let raw=`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`;
    const h=upstreamHeaders(req); for(const [k,v] of Object.entries(h)){if(Array.isArray(v)){for(const x of v)raw+=`${k}: ${x}\r\n`}else if(v!==undefined)raw+=`${k}: ${v}\r\n`}
    raw+='\r\n'; upstream.write(raw); if(head?.length)upstream.write(head); socket.pipe(upstream).pipe(socket);
  });
  upstream.on('error',()=>socket.destroy()); socket.on('error',()=>upstream.destroy());
});

server.listen(PORT,'0.0.0.0',()=>console.log(`Claw3D access proxy ready on :${PORT} -> ${UPSTREAM_HOST}:${UPSTREAM_PORT}`));
