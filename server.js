// =====================================================================
//  AUNTY NETWORK 🫖  —  offline, peer-to-peer gossip over IPFS
// ---------------------------------------------------------------------
//  Every laptop runs:
//    1. an IPFS (Kubo) daemon   -> stores files, finds other laptops,
//                                  carries "gossip" messages (pubsub)
//    2. this small Node server  -> talks to the local daemon and serves
//                                  the web page (the aunty kitty party)
//
//  No internet, no cloud, no npm packages. Only Node.js built-ins.
// =====================================================================

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

// ---------- Settings (change with environment variables) -------------
const AUNTY_NAME = process.env.AUNTY_NAME || "Sharma Aunty";
const PORT = Number(process.env.PORT || 3000);
const KUBO = process.env.KUBO_API || "http://127.0.0.1:5001/api/v0";
const TOPIC = "aunty-gossip";
const HELLO_EVERY_MS = 5000;   // "I'm still here" shout
const GONE_AFTER_MS = 20000;   // silent this long = left the kitty party
const STATE_FILE = path.join(__dirname, `state-${AUNTY_NAME.replace(/\W+/g, "_")}.json`);

// ---------- Memory of this aunty --------------------------------------
let myPeerId = null;
let mySwarmPort = 4001;
const feed = [];           // chat bubbles shown in the UI
const files = {};          // cid -> { cid, filename, from, time, status, fake }
const registry = {};       // filename -> first cid ever seen (to catch fakes)
const aunties = {};        // name -> { name, peerId, lastSeen, online }
const browsers = new Set();// open web pages (Server-Sent Events)

// Load what we remembered last time (so a restart doesn't wipe the gossip)
try {
  const saved = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  feed.push(...(saved.feed || []));
  Object.assign(files, saved.files || {});
  Object.assign(registry, saved.registry || {});
} catch (_) { /* first run, nothing saved yet */ }

function save() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ feed: feed.slice(-300), files, registry }));
  } catch (e) { console.error("could not save state:", e.message); }
}

// ---------- Funny aunty lines -----------------------------------------
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const LINES = {
  newFile: [
    "HAWWW! {from} has {file}! 📢 Forwarding to everyone…",
    "Arre suno suno! {from} just dropped {file}! 👀",
    "Kya baat hai! {from} ke paas {file} hai. Mujhe bhi mil gaya ✅",
    "Beta, {from} ne {file} bheja hai. Padh lo, exam kal hai! 📚",
  ],
  sentFile: [
    "Main ({me}) ne {file} sabko bata diya. Ab poori colony ko pata chalega 😌",
    "{file} uploaded. Gossip has left the building 🏃‍♀️💨",
  ],
  fake: [
    "🚨 Yeh forward FAKE hai, beta! {from} ne {file} badal diya hai!",
    "🚨 HAWWW! {from} is spreading a tampered {file}! Mat bharosa karna!",
  ],
  joined: [
    "💃 {name} has joined the kitty party!",
    "🥳 {name} aa gayi! Chai ready karo ☕",
  ],
  left: [
    "😢 {name} has left the kitty party… but the gossip survives.",
    "🚪 {name} chali gayi. Koi baat nahi, uska gossip humare paas hai 😏",
  ],
  back: ["🙌 {name} wapas aa gayi! Missed anything? (She did.)"],
  pending: ["⏳ {from} is whispering about {file}… fetching it now 🏃‍♀️"],
};
const fill = (t, v) => t.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");

// ---------- Talking to the local IPFS daemon --------------------------
// Kubo's HTTP API: every call is a POST to http://127.0.0.1:5001/api/v0/<cmd>
async function kubo(cmd, params = {}, opts = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${KUBO}/${cmd}${qs ? "?" + qs : ""}`, {
    method: "POST",
    body: opts.body,
    signal: opts.timeoutMs ? AbortSignal.timeout(opts.timeoutMs) : undefined,
  });
  if (!res.ok) throw new Error(`${cmd} failed: ${res.status} ${await res.text()}`);
  if (opts.raw) return res;
  const text = await res.text();          // some calls (like pubsub/pub) reply with nothing
  return text ? JSON.parse(text) : {};
}

// Pubsub topic names must be "multibase" encoded: 'u' + base64url
const mb = (str) => "u" + Buffer.from(str).toString("base64url");
const unmb = (str) => Buffer.from(str.slice(1), "base64url").toString("utf8");

// Shout a message to every aunty on the network
async function shout(obj) {
  const form = new FormData();
  form.append("file", new Blob([JSON.stringify(obj)]), "msg.json");
  await kubo("pubsub/pub", { arg: mb(TOPIC) }, { body: form });
}

// ---------- Sending updates to the web page ---------------------------
function push(type, data) {
  const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of browsers) res.write(msg);
}
function addBubble(b) {
  const bubble = { id: Date.now() + Math.random(), time: Date.now(), ...b };
  feed.push(bubble);
  push("bubble", bubble);
  save();
  return bubble;
}
function pushState() {
  push("state", snapshot());
}
function snapshot() {
  return {
    me: AUNTY_NAME,
    peerId: myPeerId,
    ips: lanIPs(),
    port: PORT,
    files: Object.values(files).sort((a, b) => b.time - a.time),
    aunties: Object.values(aunties),
    registry,
  };
}

// ---------- Fake-forward detection ------------------------------------
// IPFS gives every file a fingerprint (CID) made from its CONTENT.
// Same filename + different CID  ==>  someone changed the content.
function checkFake(filename, cid) {
  const first = registry[filename];
  if (!first) { registry[filename] = cid; return null; }
  return first === cid ? null : first;
}

// ---------- Handling gossip that arrives from other aunties -----------
async function onMessage(msg) {
  if (msg.peerId === myPeerId) return; // that's my own voice echoing back

  if (msg.type === "hello") {
    const known = aunties[msg.from];
    aunties[msg.from] = { name: msg.from, peerId: msg.peerId, lastSeen: Date.now(), online: true };
    if (!known) addBubble({ kind: "system", text: fill(pick(LINES.joined), { name: msg.from }) });
    else if (!known.online) addBubble({ kind: "system", text: fill(pick(LINES.back), { name: msg.from }) });
    pushState();
    return;
  }

  if (msg.type === "chat") {
    addBubble({ kind: "chat", from: msg.from, text: String(msg.text).slice(0, 500) });
    return;
  }

  if (msg.type === "gossip") {
    const { cid, filename, from } = msg;
    if (files[cid]) return; // already have it

    const original = checkFake(filename, cid);
    files[cid] = { cid, filename, from, time: Date.now(), status: "fetching", fake: !!original, original };
    pushState();
    addBubble({ kind: "system", text: fill(pick(LINES.pending), { from, file: filename }) });

    try {
      // "pin" = download it from the other aunty and keep a copy forever
      await kubo("pin/add", { arg: cid }, { timeoutMs: 120000 });
      files[cid].status = "received";
    } catch (e) {
      files[cid].status = "failed";
      console.error("fetch failed", cid, e.message);
    }
    save();
    pushState();

    if (original) {
      addBubble({ kind: "fake", from, file: filename, cid, original,
        text: fill(pick(LINES.fake), { from, file: filename }) });
    } else if (files[cid].status === "received") {
      addBubble({ kind: "file", from, file: filename, cid,
        text: fill(pick(LINES.newFile), { from, file: filename }) });
    }
  }
}

// Keep listening to the gossip channel forever (reconnect if it drops)
async function listen() {
  while (true) {
    try {
      const res = await kubo("pubsub/sub", { arg: mb(TOPIC) }, { raw: true });
      console.log("👂 Listening for gossip on topic:", TOPIC);
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
          } catch (e) { console.error("bad gossip ignored:", e.message); }
        }
      }
    } catch (e) {
      console.error("gossip channel dropped:", e.message, "— retrying in 3s");
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
}

// Every few seconds: say hello, and notice aunties who went quiet
function startPresence() {
  setInterval(async () => {
    try { await shout({ type: "hello", from: AUNTY_NAME, peerId: myPeerId }); }
    catch (e) { console.error("hello failed:", e.message); }

    for (const a of Object.values(aunties)) {
      if (a.online && Date.now() - a.lastSeen > GONE_AFTER_MS) {
        a.online = false;
        addBubble({ kind: "system", text: fill(pick(LINES.left), { name: a.name }) });
        pushState();
      }
    }
  }, HELLO_EVERY_MS);
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
    req.on("data", (c) => { size += c.length; if (size > limit) { reject(new Error("too big")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
function sendJSON(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png" };

// ---------- The web server --------------------------------------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    // Live updates for the page
    if (url.pathname === "/events") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
      res.write(`event: init\ndata: ${JSON.stringify({ ...snapshot(), feed: feed.slice(-100) })}\n\n`);
      browsers.add(res);
      const ping = setInterval(() => res.write(": ping\n\n"), 15000);
      req.on("close", () => { browsers.delete(res); clearInterval(ping); });
      return;
    }

    // Upload a file -> add to IPFS -> shout the gossip
    if (url.pathname === "/upload" && req.method === "POST") {
      const original = decodeURIComponent(url.searchParams.get("name") || "file");
      const fakeAs = url.searchParams.get("fakeAs"); // Fake Aunty mode: pretend to be an existing file
      const filename = fakeAs || original;
      const data = await readBody(req);
      const form = new FormData();
      form.append("file", new Blob([data]), filename);
      const added = await kubo("add", { pin: "true", "cid-version": "1" }, { body: form });
      const cid = added.Hash;

      const originalCid = checkFake(filename, cid);
      files[cid] = { cid, filename, from: AUNTY_NAME, time: Date.now(), status: "mine", fake: !!originalCid, original: originalCid };
      await shout({ type: "gossip", cid, filename, from: AUNTY_NAME, peerId: myPeerId });

      addBubble({ kind: "mine", from: AUNTY_NAME, file: filename, cid,
        text: fakeAs ? `😈 (Fake Aunty mode) I secretly changed ${filename} and forwarded it…`
                     : fill(pick(LINES.sentFile), { me: AUNTY_NAME, file: filename }) });
      pushState();
      return sendJSON(res, 200, { cid, filename });
    }

    // Send a text gossip
    if (url.pathname === "/chat" && req.method === "POST") {
      const { text } = JSON.parse((await readBody(req, 10000)).toString() || "{}");
      if (!text || !text.trim()) return sendJSON(res, 400, { error: "empty" });
      await shout({ type: "chat", from: AUNTY_NAME, peerId: myPeerId, text: text.trim() });
      addBubble({ kind: "chat", from: AUNTY_NAME, text: text.trim(), mine: true });
      return sendJSON(res, 200, { ok: true });
    }

    // Download a file from IPFS
    if (url.pathname.startsWith("/file/")) {
      const cid = url.pathname.slice(6);
      const meta = files[cid];
      const r = await kubo("cat", { arg: cid }, { raw: true, timeoutMs: 60000 });
      res.writeHead(200, {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(meta?.filename || cid)}"`,
      });
      for await (const chunk of r.body) res.write(chunk);
      return res.end();
    }

    // Who am I? (another laptop asks this before connecting to us)
    if (url.pathname === "/whoami") {
      return sendJSON(res, 200, { name: AUNTY_NAME, peerId: myPeerId, swarmPort: mySwarmPort });
    }

    // Bridge: connect our IPFS node straight to another laptop, just from its IP.
    // We ask that laptop "who are you?", then dial its IPFS node directly.
    if (url.pathname === "/bridge" && req.method === "POST") {
      const { ip } = JSON.parse((await readBody(req, 1000)).toString() || "{}");
      const host = String(ip || "").trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      const [addr, appPort = "3000"] = host.split(":");
      if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(addr)) return sendJSON(res, 400, { error: "That doesn't look like an IP address, beta." });
      try {
        const who = await (await fetch(`http://${addr}:${appPort}/whoami`, { signal: AbortSignal.timeout(5000) })).json();
        await kubo("swarm/connect", { arg: `/ip4/${addr}/tcp/${who.swarmPort || 4001}/p2p/${who.peerId}` }, { timeoutMs: 15000 });
        addBubble({ kind: "system", text: `🤝 Bridged to ${who.name} at ${addr}. Ab gossip seedha jayegi.` });
        return sendJSON(res, 200, { ok: true, name: who.name });
      } catch (e) {
        return sendJSON(res, 502, { error: `Couldn't reach ${addr}. Same hotspot? Firewall allowed? (${e.message})` });
      }
    }

    // How many IPFS peers can we see right now?
    if (url.pathname === "/peers") {
      const p = await kubo("swarm/peers").catch(() => ({ Peers: [] }));
      return sendJSON(res, 200, { count: (p.Peers || []).length, peers: (p.Peers || []).map((x) => x.Addr + "/p2p/" + x.Peer) });
    }

    // Static files (the web page)
    let file = url.pathname === "/" ? "/index.html" : url.pathname;
    file = path.join(__dirname, "public", path.normalize(file).replace(/^(\.\.[\/\\])+/, ""));
    if (file.startsWith(path.join(__dirname, "public")) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
      return fs.createReadStream(file).pipe(res);
    }
    res.writeHead(404); res.end("Not found, beta.");
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
    // Which TCP port does our IPFS node listen on? (usually 4001)
    const tcp = (id.Addresses || []).map((a) => a.match(/\/tcp\/(\d+)\//)).find(Boolean);
    if (tcp) mySwarmPort = Number(tcp[1]);
  } catch (e) {
    console.error("\n❌ Cannot reach the IPFS daemon at", KUBO);
    console.error("   Start it first in another terminal:  .\\ipfs.exe daemon --enable-pubsub-experiment\n");
    process.exit(1);
  }
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`\n🫖 ${AUNTY_NAME} is ready to gossip!`);
    console.log(`   IPFS peer id: ${myPeerId}`);
    console.log(`   Open on this laptop:  http://localhost:${PORT}`);
    for (const ip of lanIPs()) console.log(`   Open on phones:       http://${ip}:${PORT}`);
    console.log("");
  });
  listen();
  startPresence();
})();
