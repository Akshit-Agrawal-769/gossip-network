// =====================================================================
//  Relay — offline, peer-to-peer file and message sharing over IPFS
// ---------------------------------------------------------------------
//  Every device runs:
//    1. an IPFS (Kubo) daemon   -> stores files by content (CID), finds
//                                  peers on the local network, and carries
//                                  pubsub messages between them
//    2. this Node.js server     -> talks to the local daemon and serves
//                                  the web app
//
//  No internet, no cloud, no npm packages. Only Node.js built-ins.
// =====================================================================

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

// ---------- Settings (environment variables) --------------------------
const APP_NAME = process.env.APP_NAME || "Relay";
let nodeName = process.env.NODE_NAME || os.hostname();
const PORT = Number(process.env.PORT || 3000);
const KUBO = process.env.KUBO_API || "http://127.0.0.1:5001/api/v0";
const TOPIC = process.env.RELAY_TOPIC || "relay/v1";
const PRESENCE_EVERY_MS = 5000;   // how often this node announces itself
const OFFLINE_AFTER_MS = 20000;   // a peer silent this long is marked offline
const DATA_DIR = path.join(__dirname, "data");
const STATE_FILE = path.join(DATA_DIR, "state.json");

// ---------- Local state -----------------------------------------------
let myPeerId = null;
let mySwarmPort = 4001;
const feed = [];            // activity log shown in the UI
const files = {};           // cid -> { cid, filename, from, time, status, tampered, original }
const registry = {};        // filename -> first CID seen on this network (integrity reference)
const peers = {};           // peerId -> { name, peerId, lastSeen, online }
const browsers = new Set(); // open web pages (Server-Sent Events)

// Restore state from the previous run
try {
  const saved = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  feed.push(...(saved.feed || []));
  Object.assign(files, saved.files || {});
  Object.assign(registry, saved.registry || {});
  if (saved.nodeName && !process.env.NODE_NAME) nodeName = saved.nodeName;
} catch (_) { /* first run */ }

function save() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify({ nodeName, feed: feed.slice(-500), files, registry }));
  } catch (e) { console.error("could not save state:", e.message); }
}

// ---------- Talking to the local IPFS daemon --------------------------
// Kubo's HTTP RPC API: every call is a POST to /api/v0/<cmd>
async function kubo(cmd, params = {}, opts = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${KUBO}/${cmd}${qs ? "?" + qs : ""}`, {
    method: "POST",
    body: opts.body,
    signal: opts.timeoutMs ? AbortSignal.timeout(opts.timeoutMs) : undefined,
  });
  if (!res.ok) throw new Error(`${cmd} failed: ${res.status} ${await res.text()}`);
  if (opts.raw) return res;
  const text = await res.text(); // some calls (e.g. pubsub/pub) return an empty body
  return text ? JSON.parse(text) : {};
}

// Pubsub topic names must be multibase-encoded: 'u' + base64url
const mb = (str) => "u" + Buffer.from(str).toString("base64url");
const unmb = (str) => Buffer.from(str.slice(1), "base64url").toString("utf8");

// Broadcast a message to every peer subscribed to the topic
async function broadcast(obj) {
  const form = new FormData();
  form.append("file", new Blob([JSON.stringify(obj)]), "msg.json");
  await kubo("pubsub/pub", { arg: mb(TOPIC) }, { body: form });
}

// ---------- Pushing updates to the web page ---------------------------
function push(type, data) {
  const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of browsers) res.write(msg);
}
function log(entry) {
  const item = { id: Date.now() + Math.random(), time: Date.now(), ...entry };
  feed.push(item);
  push("entry", item);
  save();
  return item;
}
function pushState() {
  push("state", snapshot());
}
function snapshot() {
  return {
    app: APP_NAME,
    me: nodeName,
    peerId: myPeerId,
    ips: lanIPs(),
    port: PORT,
    files: Object.values(files).sort((a, b) => b.time - a.time),
    peers: Object.values(peers),
  };
}

// ---------- Integrity check -------------------------------------------
// IPFS derives each file's CID from its content. The first CID seen for a
// filename becomes the reference; a later file with the same name and a
// different CID has different content and is quarantined.
function checkIntegrity(filename, cid) {
  const first = registry[filename];
  if (!first) { registry[filename] = cid; return null; }
  return first === cid ? null : first;
}

// ---------- Handling messages from peers ------------------------------
async function onMessage(msg) {
  if (msg.peerId === myPeerId) return; // our own broadcast echoing back

  if (msg.type === "presence") {
    const known = peers[msg.peerId];
    peers[msg.peerId] = { name: msg.from, peerId: msg.peerId, lastSeen: Date.now(), online: true };
    // Adopt reference CIDs we haven't seen, so late joiners can still detect tampering
    if (msg.registry && typeof msg.registry === "object") {
      let updated = false;
      for (const [fn, refCid] of Object.entries(msg.registry)) {
        if (!registry[fn] && typeof refCid === "string") { registry[fn] = refCid; updated = true; }
      }
      if (updated) save();
    }
    if (!known) log({ kind: "system", text: `${msg.from} joined the network.` });
    else if (!known.online) log({ kind: "system", text: `${msg.from} is back online.` });
    pushState();
    return;
  }

  if (msg.type === "message") {
    log({ kind: "message", from: msg.from, text: String(msg.text).slice(0, 2000) });
    return;
  }

  if (msg.type === "file") {
    const { cid, filename, from } = msg;
    if (files[cid]) return; // already have it

    const original = checkIntegrity(filename, cid);
    if (original) {
      files[cid] = { cid, filename, from, time: Date.now(), status: "quarantined", tampered: true, original };
      save();
      pushState();
      log({ kind: "tampered", from, file: filename, cid, original,
            text: `${from} sent a copy whose content differs from the version first shared on this network. It was not downloaded.` });
      return;
    }

    files[cid] = { cid, filename, from, time: Date.now(), status: "fetching", tampered: false, original: null };
    pushState();

    try {
      // Pin = fetch the blocks from whichever peers have them and keep a local copy
      await kubo("pin/add", { arg: cid }, { timeoutMs: 120000 });
      files[cid].status = "verified";
    } catch (e) {
      files[cid].status = "failed";
      if (registry[filename] === cid) delete registry[filename];
      console.error("fetch failed", cid, e.message);
    }
    save();
    pushState();

    if (files[cid].status === "verified") {
      log({ kind: "file", from, file: filename, cid, text: `${from} shared ${filename}.` });
    } else {
      log({ kind: "system", text: `Could not fetch ${filename} from ${from}. The sender may have gone offline.` });
    }
  }
}

// Subscribe to the topic forever, reconnecting if the stream drops
async function listen() {
  while (true) {
    try {
      const res = await kubo("pubsub/sub", { arg: mb(TOPIC) }, { raw: true });
      console.log("Subscribed to topic:", TOPIC);
      const decoder = new TextDecoder();
      let buf = "";
      for await (const chunk of res.body) {
        buf += decoder.decode(chunk, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          try {
            const env = JSON.parse(line);
            const msg = JSON.parse(unmb(env.data));
            msg.peerId = msg.peerId || env.from;
            await onMessage(msg);
          } catch (e) { console.error("ignored malformed message:", e.message); }
        }
      }
    } catch (e) {
      console.error("pubsub stream dropped:", e.message, "- retrying in 3s");
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
}

// Announce presence periodically and mark silent peers offline
function startPresence() {
  setInterval(async () => {
    try { await broadcast({ type: "presence", from: nodeName, peerId: myPeerId, registry }); }
    catch (e) { console.error("presence broadcast failed:", e.message); }

    for (const p of Object.values(peers)) {
      if (p.online && Date.now() - p.lastSeen > OFFLINE_AFTER_MS) {
        p.online = false;
        log({ kind: "system", text: `${p.name} went offline. Files they shared remain available from other peers.` });
        pushState();
      }
    }
  }, PRESENCE_EVERY_MS);
}

// ---------- Helpers ----------------------------------------------------
function lanIPs() {
  return Object.values(os.networkInterfaces()).flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => i.address);
}
function readBody(req, limit = 200 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on("data", (c) => { size += c.length; if (size > limit) { reject(new Error("too large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
function sendJSON(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}
const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".webp": "image/webp", ".webm": "audio/webm", ".ogg": "audio/ogg",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".mp4": "video/mp4",
  ".pdf": "application/pdf", ".txt": "text/plain; charset=utf-8",
};

// ---------- HTTP server ------------------------------------------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    // Live updates for the web app
    if (url.pathname === "/events") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
      res.write(`event: init\ndata: ${JSON.stringify({ ...snapshot(), feed: feed.slice(-200) })}\n\n`);
      browsers.add(res);
      const ping = setInterval(() => res.write(": ping\n\n"), 15000);
      req.on("close", () => { browsers.delete(res); clearInterval(ping); });
      return;
    }

    // Set this node's display name
    if (url.pathname === "/name" && req.method === "POST") {
      const { name } = JSON.parse((await readBody(req, 2000)).toString() || "{}");
      const clean = String(name || "").trim().slice(0, 40);
      if (!clean) return sendJSON(res, 400, { error: "Name cannot be empty." });
      nodeName = clean;
      save();
      pushState();
      broadcast({ type: "presence", from: nodeName, peerId: myPeerId, registry }).catch(() => {});
      return sendJSON(res, 200, { ok: true, me: nodeName });
    }

    // Share a file: add to IPFS, then announce its CID
    if (url.pathname === "/upload" && req.method === "POST") {
      const filename = decodeURIComponent(url.searchParams.get("name") || "file");
      const data = await readBody(req);
      const form = new FormData();
      form.append("file", new Blob([data]), filename);
      const added = await kubo("add", { pin: "true", "cid-version": "1" }, { body: form });
      const cid = added.Hash;

      const original = checkIntegrity(filename, cid);
      files[cid] = { cid, filename, from: nodeName, time: Date.now(),
                     status: original ? "quarantined" : "verified", tampered: !!original, original };
      await broadcast({ type: "file", cid, filename, from: nodeName, peerId: myPeerId });

      if (original) {
        log({ kind: "tampered", mine: true, from: nodeName, file: filename, cid, original,
              text: `${filename} differs from the version first shared on this network. Peers will reject it.` });
      } else {
        log({ kind: "file", mine: true, from: nodeName, file: filename, cid, text: `You shared ${filename}.` });
      }
      pushState();
      return sendJSON(res, 200, { cid, filename, tampered: !!original, original });
    }

    // Send a text message
    if (url.pathname === "/message" && req.method === "POST") {
      const { text } = JSON.parse((await readBody(req, 10000)).toString() || "{}");
      if (!text || !text.trim()) return sendJSON(res, 400, { error: "empty" });
      await broadcast({ type: "message", from: nodeName, peerId: myPeerId, text: text.trim() });
      log({ kind: "message", from: nodeName, text: text.trim(), mine: true });
      return sendJSON(res, 200, { ok: true });
    }

    // Download or stream a file from IPFS
    if (url.pathname.startsWith("/file/")) {
      const cid = url.pathname.slice(6);
      const meta = files[cid];
      const fname = meta?.filename || cid;
      const ext = path.extname(fname).toLowerCase();
      const inline = url.searchParams.get("inline") === "1";
      const r = await kubo("cat", { arg: cid }, { raw: true, timeoutMs: 60000 });
      res.writeHead(200, {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(fname)}"`,
      });
      for await (const chunk of r.body) res.write(chunk);
      return res.end();
    }

    // Identity of this node (another node asks this before connecting)
    if (url.pathname === "/whoami") {
      return sendJSON(res, 200, { name: nodeName, peerId: myPeerId, swarmPort: mySwarmPort });
    }

    // Connect our IPFS node directly to another node, given only its IP
    if (url.pathname === "/connect" && req.method === "POST") {
      const { ip } = JSON.parse((await readBody(req, 1000)).toString() || "{}");
      const host = String(ip || "").trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      const [addr, appPort = "3000"] = host.split(":");
      if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(addr)) return sendJSON(res, 400, { error: "Enter an IPv4 address, e.g. 192.168.43.12" });
      try {
        const who = await (await fetch(`http://${addr}:${appPort}/whoami`, { signal: AbortSignal.timeout(5000) })).json();
        await kubo("swarm/connect", { arg: `/ip4/${addr}/tcp/${who.swarmPort || 4001}/p2p/${who.peerId}` }, { timeoutMs: 15000 });
        log({ kind: "system", text: `Connected directly to ${who.name} at ${addr}.` });
        return sendJSON(res, 200, { ok: true, name: who.name });
      } catch (e) {
        return sendJSON(res, 502, { error: `Could not reach ${addr}. Check that both devices are on the same network and ports 3000 and 4001 are allowed. (${e.message})` });
      }
    }

    // Number of IPFS peers currently connected
    if (url.pathname === "/peers") {
      const p = await kubo("swarm/peers").catch(() => ({ Peers: [] }));
      return sendJSON(res, 200, { count: (p.Peers || []).length, peers: (p.Peers || []).map((x) => x.Addr + "/p2p/" + x.Peer) });
    }

    // Static files (the web app)
    let file = url.pathname === "/" ? "/index.html" : url.pathname;
    file = path.join(__dirname, "public", path.normalize(file).replace(/^(\.\.[\/\\])+/, ""));
    if (file.startsWith(path.join(__dirname, "public")) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
      return fs.createReadStream(file).pipe(res);
    }
    res.writeHead(404); res.end("Not found.");
  } catch (e) {
    console.error(e);
    if (!res.headersSent) sendJSON(res, 500, { error: e.message });
    else res.end();
  }
});

// ---------- Start ------------------------------------------------------
(async () => {
  try {
    const id = await kubo("id");
    myPeerId = id.ID;
    const tcp = (id.Addresses || []).map((a) => a.match(/\/tcp\/(\d+)(\/|$)/)).find(Boolean);
    if (tcp) mySwarmPort = Number(tcp[1]);
  } catch (e) {
    console.error("\nCannot reach the IPFS daemon at", KUBO);
    console.error("Start it first (start-ipfs.bat on Windows, ./start-ipfs.sh elsewhere).\n");
    process.exit(1);
  }
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`\n${APP_NAME} node "${nodeName}" is running`);
    console.log(`  IPFS peer ID:   ${myPeerId}`);
    console.log(`  This device:    http://localhost:${PORT}`);
    for (const ip of lanIPs()) console.log(`  Other devices:  http://${ip}:${PORT}`);
    console.log("");
  });
  listen();
  startPresence();
})();
