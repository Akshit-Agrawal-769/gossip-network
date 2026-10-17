const $ = (id) => document.getElementById(id);
const EMOJIS = ["👵", "🧕", "👩‍🦳", "💁‍♀️", "🙆‍♀️", "👩‍🦱", "🤷‍♀️", "💃"];
const avatar = (name) =>
  EMOJIS[
    [...name].reduce((s, c) => s + c.charCodeAt(0), 0) % EMOJIS.length
  ];
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
const time = (t) =>
  new Date(t).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
let me = "";

// ---- Sound: a little synthesized "haww" whistle (no audio files needed) ----
let ctx;
function haww(dramatic) {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(),
      g = ctx.createGain();
    o.type = dramatic ? "sawtooth" : "triangle";
    o.frequency.setValueAtTime(dramatic ? 300 : 900, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(
      dramatic ? 120 : 380,
      ctx.currentTime + 0.5,
    );
    g.gain.setValueAtTime(0.25, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.6);
  } catch (e) {}
  const h = $("haww");
  h.textContent = dramatic ? "FAKE!!" : "HAWWW!";
  h.classList.remove("go");
  void h.offsetWidth;
  h.classList.add("go");
}
document.addEventListener(
  "click",
  () => {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
  },
  { once: true },
);

// ---- Rendering ----
function bubble(b) {
  const row = document.createElement("div");
  let cls = "row";
  if (b.kind === "system") cls += " system";
  if (b.kind === "fake") cls += " fake";
  if (b.kind === "mine" || b.mine) cls += " mine";
  row.className = cls;
  let html = "";
  if (b.kind === "chat" || b.kind === "file" || b.kind === "mine") {
    if (!(b.kind === "mine" || b.mine))
      html += `<div class="who">${avatar(b.from)} ${esc(b.from)}</div>`;
  }
  html += `<div>${esc(b.text)}</div>`;
  if (b.cid && b.kind !== "fake")
    html += `<a class="dl" href="/file/${b.cid}">⬇ ${esc(b.file)}</a>`;
  if (b.kind === "fake")
    html += `<div style="margin-top:6px"><code>original fingerprint: ${esc(b.original)}</code><br><code>this forward: ${esc(b.cid)}</code></div>`;
  html += `<div class="t">${time(b.time)}</div>`;
  row.innerHTML = `<div class="bubble">${html}</div>`;
  $("chat").appendChild(row);
  $("chat").scrollTop = $("chat").scrollHeight;
}

function renderState(s) {
  me = s.me;
  $("me").textContent = `You are ${avatar(s.me)} ${s.me}`;
  $("aunties").innerHTML =
    `<div class="aunty"><span class="av">${avatar(s.me)}</span>${esc(s.me)} (you)<span class="dot on"></span></div>` +
    s.aunties
      .map(
        (a) =>
          `<div class="aunty ${a.online ? "" : "off"}"><span class="av">${avatar(a.name)}</span>${esc(a.name)}<span class="dot ${a.online ? "on" : ""}"></span></div>`,
      )
      .join("");
  $("files").innerHTML = s.files.length
    ? s.files
        .map(
          (f) => `
<a class="file ${f.fake ? "fake" : ""}" href="/file/${f.cid}">${f.fake ? "🚨 " : "📄 "}${esc(f.filename)}
<small>from ${esc(f.from)} · ${f.status}${f.fake ? " · TAMPERED" : ""}</small></a>`,
        )
        .join("")
    : `<div class="net">No gossip yet. Kya ho gaya sabko?</div>`;
  $("net").innerHTML =
    `Phones on this hotspot can open:<br>${s.ips.map((ip) => `<b>http://${ip}:${s.port}</b>`).join("<br>") || "<b>(no network)</b>"}
<br><span id="peers"></span>`;
  // Fake Aunty: choose which existing file to impersonate
  const names = Object.keys(s.registry);
  $("fakeAs").innerHTML = names
    .map((n) => `<option>${esc(n)}</option>`)
    .join("");
  refreshPeers();
}

async function refreshPeers() {
  try {
    const p = await (await fetch("/peers")).json();
    const el = $("peers");
    if (el) el.innerHTML = `IPFS peers connected: <b>${p.count}</b>`;
  } catch (e) {}
}
setInterval(refreshPeers, 5000);

// ---- Live updates from our server ----
const es = new EventSource("/events");
es.addEventListener("init", (e) => {
  const d = JSON.parse(e.data);
  $("chat").innerHTML = "";
  d.feed.forEach(bubble);
  renderState(d);
});
es.addEventListener("state", (e) => renderState(JSON.parse(e.data)));
es.addEventListener("bubble", (e) => {
  const b = JSON.parse(e.data);
  bubble(b);
  if (b.kind === "file") haww(false);
  if (b.kind === "fake") haww(true);
});
es.onerror = () => {
  $("me").textContent = "reconnecting to aunty server…";
};

// ---- Actions ----
async function sendChat() {
  const text = $("msg").value.trim();
  if (!text) return;
  $("msg").value = "";
  await fetch("/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
}
$("send").onclick = sendChat;
$("msg").addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendChat();
});

$("fake").onchange = () => {
  $("fakeAs").hidden = !$("fake").checked;
};
$("file").onchange = async () => {
  const f = $("file").files[0];
  if (!f) return;
  let url = `/upload?name=${encodeURIComponent(f.name)}`;
  if ($("fake").checked && $("fakeAs").value)
    url += `&fakeAs=${encodeURIComponent($("fakeAs").value)}`;
  const r = await fetch(url, { method: "POST", body: f });
  if (!r.ok) alert("Upload failed: " + (await r.text()));
  $("file").value = "";
};