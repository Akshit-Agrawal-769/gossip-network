const $ = (id) => document.getElementById(id);
const EMOJIS = ["👵", "🧕", "👩‍🦳", "💁‍♀️", "🙆‍♀️", "👩‍🦱", "🤷‍♀️", "💃"];
const avatar = (name) =>
  EMOJIS[
    [...String(name || "Aunty")].reduce((s, c) => s + c.charCodeAt(0), 0) %
      EMOJIS.length
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
const fmtBytes = (b) => {
  if (!b && b !== 0) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
};

let me = "Sharma Aunty";
let appState = {
  me: "Sharma Aunty",
  peerId: "",
  ips: [],
  port: 3000,
  files: [],
  aunties: [],
  registry: {},
};
let myMultiaddrs = [];
let activeInspectCid = null;
let selectedNodeName = null;
let demoMode = false;

// Virtual Aunties for single-laptop demo / preview
const DEMO_AUNTIES = [
  { name: "Verma Aunty", peerId: "12D3KooWVermaDemo98123", online: true, fakesCaught: 0, virtual: true },
  { name: "Gupta Aunty", peerId: "12D3KooWGuptaDemo44510", online: true, fakesCaught: 1, virtual: true },
  { name: "Pammi Buaji", peerId: "12D3KooWPammiDemo77190", online: false, fakesCaught: 0, virtual: true },
];

// ---- Sound: synthesized "haww" whistle (no audio files needed) ----
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

// ---- View Mode Tabs ----
document.querySelectorAll(".view-tabs .tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".view-tabs .tab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const view = btn.dataset.view;
    $("mainLayout").className = `view-${view}`;
    setTimeout(resizeCanvas, 50);
  });
});

// ---- Chat Bubble Rendering ----
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

  if (b.cid) {
    html += `<div class="bubble-btns">`;
    if (b.kind !== "fake") {
      html += `<a class="dl" href="/file/${encodeURIComponent(b.cid)}">⬇ ${esc(b.file)}</a>`;
    }
    html += `<button class="inspect-btn" data-cid="${esc(b.cid)}">🔍 Inspect CID &amp; Hash</button>`;
    html += `</div>`;
  }

  if (b.kind === "fake") {
    html += `<div style="margin-top:6px"><code>original registry CID: ${esc(b.original)}</code><br><code>tampered forward CID: ${esc(b.cid)}</code></div>`;
  }
  html += `<div class="t">${time(b.time)}</div>`;
  row.innerHTML = `<div class="bubble">${html}</div>`;

  const inspectBtn = row.querySelector(".inspect-btn");
  if (inspectBtn) {
    inspectBtn.addEventListener("click", () => inspectFile(b.cid));
  }

  $("chat").appendChild(row);
  $("chat").scrollTop = $("chat").scrollHeight;
}

// ---- Sidebar & State Rendering ----
function getActiveAunties() {
  const list = [...(appState.aunties || [])];
  if (demoMode) {
    for (const da of DEMO_AUNTIES) {
      if (!list.some((a) => a.name === da.name) && da.name !== appState.me) {
        list.push(da);
      }
    }
  }
  return list;
}

function renderState(s) {
  appState = s;
  me = s.me;
  $("me").textContent = `You are ${avatar(s.me)} ${s.me}`;

  const allAunties = getActiveAunties();
  const myFilesCount = s.files.filter((f) => (f.holders || []).includes(s.me) || f.status === "mine" || f.status === "received").length;

  $("aunties").innerHTML =
    `<div class="aunty ${selectedNodeName === s.me ? "selected" : ""}" data-name="${esc(s.me)}">
      <span class="av">${avatar(s.me)}</span>
      <div class="aunty-meta">
        <span class="aunty-name"><b>${esc(s.me)}</b> (you)</span>
        <small>📌 ${myFilesCount} pinned file(s)</small>
      </div>
      <span class="dot on"></span>
    </div>` +
    allAunties
      .map((a) => {
        const heldCount = s.files.filter(
          (f) => (f.holders || []).includes(a.name) || (a.virtual && !f.fake),
        ).length;
        return `<div class="aunty ${a.online ? "" : "off"} ${selectedNodeName === a.name ? "selected" : ""}" data-name="${esc(a.name)}">
          <span class="av">${avatar(a.name)}</span>
          <div class="aunty-meta">
            <span class="aunty-name">${esc(a.name)} ${a.virtual ? "<small>(demo)</small>" : ""}</span>
            <small>${a.online ? "Online" : "Left kitty party"} · 📌 ${heldCount} file(s)</small>
          </div>
          ${a.fakesCaught ? `<span class="sus-tag" title="Caught forwarding tampered files">😈 ${a.fakesCaught} fake</span>` : ""}
          <span class="dot ${a.online ? "on" : ""}"></span>
        </div>`;
      })
      .join("");

  $("aunties").querySelectorAll(".aunty").forEach((el) => {
    el.addEventListener("click", () => {
      selectNode(el.dataset.name);
    });
  });

  $("files").innerHTML = s.files.length
    ? s.files
        .map((f) => {
          const holders = getHoldersForFile(f);
          const isSelected = activeInspectCid === f.cid;
          return `
<div class="file ${f.fake ? "fake" : ""} ${isSelected ? "active-inspect" : ""}" data-cid="${esc(f.cid)}">
  <div class="file-top">
    <span>${f.fake ? "🚨 " : "📄 "}${esc(f.filename)}</span>
  </div>
  <small>from ${esc(f.from)} · ${fmtBytes(f.size)} · CID: <code>${esc(f.cid.slice(0, 10))}…</code></small>
  <div class="file-actions">
    <span class="mini-tag ${f.fake ? "fake" : ""}">${f.fake ? "TAMPERED FAKE" : `✅ VERIFIED · 📌 ${holders.length}`}</span>
    <a class="mini-dl" href="/file/${encodeURIComponent(f.cid)}" onclick="event.stopPropagation()">⬇ Save</a>
  </div>
</div>`;
        })
        .join("")
    : `<div class="net">No gossip yet. Kya ho gaya sabko?</div>`;

  $("files").querySelectorAll(".file").forEach((el) => {
    el.addEventListener("click", () => inspectFile(el.dataset.cid));
  });

  $("net").innerHTML =
    `Hotspot URL for phones/laptops:<br>${s.ips.map((ip) => `<b>http://${ip}:${s.port}</b>`).join("<br>") || "<b>http://localhost:" + s.port + "</b>"}
<br><span id="peers"></span>`;

  // Fake Aunty: choose which existing file to impersonate
  const names = Object.keys(s.registry);
  $("fakeAs").innerHTML = names.length
    ? names.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join("")
    : `<option value="">(Share a real file first)</option>`;

  // Auto-inspect newest file if none selected yet
  if (!activeInspectCid && s.files.length > 0) {
    inspectFile(s.files[0].cid, true);
  } else if (activeInspectCid) {
    // Refresh node popover if open
    if (selectedNodeName) renderNodePopover(selectedNodeName);
  }

  refreshPeers();
}

function getHoldersForFile(f) {
  const set = new Set(f.holders || [f.from]);
  if (f.status === "mine" || f.status === "received") set.add(appState.me);
  if (demoMode && !f.fake) {
    set.add("Verma Aunty");
    set.add("Gupta Aunty");
  }
  return [...set];
}

async function refreshPeers() {
  try {
    const p = await (await fetch("/peers")).json();
    myMultiaddrs = p.myMultiaddrs || [];
    const el = $("peers");
    if (el) {
      el.innerHTML = `IPFS Swarm Peers: <b>${p.count}</b> ${demoMode ? `<span style="color:var(--pink)">(+3 Demo Nodes)</span>` : ""}`;
    }
  } catch (e) {}
}
setInterval(refreshPeers, 5000);

// ---- Peer Bridge Controls ----
$("copyMyAddrBtn").addEventListener("click", async () => {
  if (!myMultiaddrs.length) await refreshPeers();
  const addr = myMultiaddrs[0] || `/ip4/127.0.0.1/tcp/4001/p2p/${appState.peerId}`;
  try {
    await navigator.clipboard.writeText(addr);
    $("bridgeStatus").textContent = `✅ Copied: ${addr.slice(0, 32)}…`;
  } catch (_) {
    prompt("Copy your IPFS Multiaddr:", addr);
  }
});

$("connectPeerBtn").addEventListener("click", async () => {
  const addr = $("peerAddr").value.trim();
  if (!addr) return;
  $("bridgeStatus").textContent = "⏳ Bridging to peer…";
  try {
    const r = await fetch("/swarm-connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addr }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Connect failed");
    $("bridgeStatus").textContent = "✅ Connected to peer!";
    $("peerAddr").value = "";
    refreshPeers();
  } catch (e) {
    $("bridgeStatus").textContent = `❌ ${e.message}`;
  }
});

// =====================================================================
//  LIVE GOSSIP TOPOLOGY VISUALIZER (HTML5 Canvas)
// =====================================================================
const canvas = $("topoCanvas");
const cctx = canvas.getContext("2d");
let topoNodes = [];
let packets = [];
let ripples = [];

function resizeCanvas() {
  if (!canvas) return;
  const rect = canvas.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(300, rect.width) * dpr;
  canvas.height = Math.max(220, rect.height) * dpr;
  cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resizeCanvas);
setTimeout(resizeCanvas, 50);

function computeNodes(w, h) {
  const cx = w / 2;
  const cy = h / 2 - 6;
  const others = getActiveAunties();
  const nodes = [
    {
      name: appState.me,
      isMe: true,
      online: true,
      x: cx,
      y: cy,
      r: 24,
      emoji: avatar(appState.me),
      fakesCaught: 0,
    },
  ];
  const radius = Math.min(w, h) * 0.34;
  others.forEach((a, idx) => {
    const angle = (idx / Math.max(1, others.length)) * Math.PI * 2 - Math.PI / 2;
    nodes.push({
      name: a.name,
      isMe: false,
      online: !!a.online,
      virtual: !!a.virtual,
      peerId: a.peerId,
      fakesCaught: a.fakesCaught || 0,
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
      r: 20,
      emoji: avatar(a.name),
    });
  });
  topoNodes = nodes;
  return nodes;
}

function spawnPacket({ from, to, label = "🫖", kind = "file" }) {
  const w = canvas.clientWidth || 400;
  const h = canvas.clientHeight || 235;
  const nodes = computeNodes(w, h);
  const src = nodes.find((n) => n.name === from) || nodes[0];
  if (!src) return;

  const targets =
    to === "*"
      ? nodes.filter((n) => n.name !== src.name && n.online)
      : nodes.filter((n) => n.name === to);

  // If no other nodes exist yet, emit a radial broadcast ripple from self
  ripples.push({
    x: src.x,
    y: src.y,
    r: src.r,
    maxR: 75,
    alpha: 0.9,
    color: kind === "fake" ? "#ff4757" : "#ffb300",
  });

  targets.forEach((dst, i) => {
    packets.push({
      x0: src.x,
      y0: src.y,
      x1: dst.x,
      y1: dst.y,
      dstName: dst.name,
      progress: -i * 0.08,
      speed: kind === "hello" ? 0.022 : 0.016,
      label,
      kind,
    });
  });
}

function drawTopology() {
  const w = canvas.clientWidth || 400;
  const h = canvas.clientHeight || 235;
  cctx.clearRect(0, 0, w, h);

  const nodes = computeNodes(w, h);
  const hub = nodes[0];

  // Subtle radar rings around center
  cctx.save();
  cctx.strokeStyle = "rgba(255, 179, 0, 0.07)";
  cctx.lineWidth = 1;
  [55, 95, 135].forEach((r) => {
    cctx.beginPath();
    cctx.arc(hub.x, hub.y, r, 0, Math.PI * 2);
    cctx.stroke();
  });
  cctx.restore();

  // Draw mesh connections (peer-to-peer edges)
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const bothOnline = a.online && b.online;
      cctx.save();
      cctx.beginPath();
      cctx.moveTo(a.x, a.y);
      cctx.lineTo(b.x, b.y);
      if (bothOnline) {
        cctx.strokeStyle = i === 0 ? "rgba(255, 179, 0, 0.42)" : "rgba(244, 143, 177, 0.22)";
        cctx.lineWidth = i === 0 ? 2 : 1.2;
      } else {
        cctx.setLineDash([5, 5]);
        cctx.strokeStyle = "rgba(180, 180, 195, 0.25)";
        cctx.lineWidth = 1.2;
      }
      cctx.stroke();
      cctx.restore();
    }
  }

  // Draw expanding ripples
  for (let i = ripples.length - 1; i >= 0; i--) {
    const rp = ripples[i];
    rp.r += 1.4;
    rp.alpha -= 0.02;
    if (rp.alpha <= 0) {
      ripples.splice(i, 1);
      continue;
    }
    cctx.save();
    cctx.beginPath();
    cctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
    cctx.strokeStyle = rp.color;
    cctx.globalAlpha = Math.max(0, rp.alpha);
    cctx.lineWidth = 2;
    cctx.stroke();
    cctx.restore();
  }

  // Draw animated gossip packets along edges
  for (let i = packets.length - 1; i >= 0; i--) {
    const p = packets[i];
    p.progress += p.speed;
    if (p.progress < 0) continue;
    if (p.progress >= 1) {
      ripples.push({
        x: p.x1,
        y: p.y1,
        r: 18,
        maxR: 48,
        alpha: 0.85,
        color: p.kind === "fake" ? "#ff4757" : "#2ecc71",
      });
      packets.splice(i, 1);
      continue;
    }
    const x = p.x0 + (p.x1 - p.x0) * p.progress;
    const y = p.y0 + (p.y1 - p.y0) * p.progress;

    // Glowing orb behind packet emoji
    cctx.save();
    cctx.beginPath();
    cctx.arc(x, y, 11, 0, Math.PI * 2);
    cctx.fillStyle =
      p.kind === "fake"
        ? "rgba(255, 71, 87, 0.9)"
        : p.kind === "hello"
          ? "rgba(46, 204, 113, 0.75)"
          : "rgba(255, 179, 0, 0.9)";
    cctx.shadowColor = p.kind === "fake" ? "#ff4757" : "#ffb300";
    cctx.shadowBlur = 10;
    cctx.fill();
    cctx.font = "13px Segoe UI Emoji, sans-serif";
    cctx.textAlign = "center";
    cctx.textBaseline = "middle";
    cctx.fillText(p.label, x, y);
    cctx.restore();
  }

  // Draw Aunty nodes
  nodes.forEach((n) => {
    const isSelected = selectedNodeName === n.name;
    cctx.save();
    cctx.beginPath();
    cctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
    cctx.fillStyle = n.online ? (n.isMe ? "#c2185b" : "#3a1c30") : "#2c262b";
    cctx.fill();
    cctx.lineWidth = isSelected ? 3.5 : 2.2;
    cctx.strokeStyle = isSelected
      ? "#ffb300"
      : n.fakesCaught > 0
        ? "#ff4757"
        : n.online
          ? "#2ecc71"
          : "#7f8c8d";
    cctx.stroke();

    // Emoji avatar
    cctx.font = `${n.isMe ? 22 : 18}px Segoe UI Emoji, sans-serif`;
    cctx.textAlign = "center";
    cctx.textBaseline = "middle";
    cctx.globalAlpha = n.online ? 1 : 0.55;
    cctx.fillText(n.emoji, n.x, n.y);
    cctx.globalAlpha = 1;

    // Label pill below node
    const label = n.isMe ? `${n.name} (You)` : n.name;
    cctx.font = "600 11.5px Segoe UI, sans-serif";
    cctx.fillStyle = n.online ? "#fff8e7" : "#b09fa9";
    cctx.fillText(label, n.x, n.y + n.r + 13);

    // Pinned replica count badge on top-right of node
    const heldCount = appState.files.filter((f) =>
      getHoldersForFile(f).includes(n.name),
    ).length;
    if (heldCount > 0) {
      const bx = n.x + n.r * 0.72;
      const by = n.y - n.r * 0.72;
      cctx.beginPath();
      cctx.arc(bx, by, 9, 0, Math.PI * 2);
      cctx.fillStyle = "#ffb300";
      cctx.fill();
      cctx.font = "bold 10px Segoe UI, sans-serif";
      cctx.fillStyle = "#2b1a24";
      cctx.fillText(String(heldCount), bx, by + 0.5);
    }
    cctx.restore();
  });

  if (nodes.length === 1) {
    cctx.save();
    cctx.fillStyle = "rgba(255, 248, 231, 0.75)";
    cctx.font = "12px Segoe UI, sans-serif";
    cctx.textAlign = "center";
    cctx.fillText(
      "Waiting for other laptops on hotspot… or click '🎭 Demo Nodes' above to preview mesh hops!",
      w / 2,
      30,
    );
    cctx.restore();
  }

  requestAnimationFrame(drawTopology);
}
requestAnimationFrame(drawTopology);

// Click on Canvas to inspect an Aunty node
canvas.addEventListener("click", (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const hit = topoNodes.find((n) => Math.hypot(n.x - mx, n.y - my) <= n.r + 6);
  if (hit) {
    selectNode(hit.name);
  } else {
    selectedNodeName = null;
    $("nodeInspector").hidden = true;
    renderState(appState);
  }
});

function selectNode(name) {
  selectedNodeName = name;
  renderNodePopover(name);
  renderState(appState);
}

function renderNodePopover(name) {
  const pop = $("nodeInspector");
  const node =
    name === appState.me
      ? { name: appState.me, peerId: appState.peerId, online: true, isMe: true, fakesCaught: 0 }
      : getActiveAunties().find((a) => a.name === name);
  if (!node) {
    pop.hidden = true;
    return;
  }

  const heldFiles = appState.files.filter((f) => getHoldersForFile(f).includes(name));
  pop.hidden = false;
  pop.innerHTML = `
    <h4>
      <span>${avatar(node.name)} ${esc(node.name)}</span>
      <button class="close-pop" id="closeNodePop">✕</button>
    </h4>
    <div><b>Status:</b> ${node.online ? "🟢 Online in Kitty Party" : "⚪ Left Kitty Party (Offline)"}</div>
    <div style="margin-top:3px"><b>Trust:</b> ${node.fakesCaught ? `<span style="color:var(--red)">🚨 Caught spreading ${node.fakesCaught} fake(s)</span>` : `<span style="color:var(--leaf)">✅ Verified Colony Member</span>`}</div>
    <div style="margin-top:3px"><b>Peer ID:</b> <code>${esc((node.peerId || "local").slice(0, 18))}…</code></div>
    <div style="margin-top:6px"><b>📌 Pinned Replicas (${heldFiles.length}):</b></div>
    <div style="margin-top:3px;max-height:85px;overflow-y:auto">
      ${
        heldFiles.length
          ? heldFiles
              .map(
                (f) =>
                  `<div style="font-size:11.5px;padding:2px 0">${f.fake ? "🚨" : "✅"} ${esc(f.filename)} <code style="font-size:10px">(${esc(f.cid.slice(0, 8))}…)</code></div>`,
              )
              .join("")
          : `<em style="color:var(--muted)">No files pinned yet</em>`
      }
    </div>
  `;
  $("closeNodePop").onclick = () => {
    selectedNodeName = null;
    pop.hidden = true;
    renderState(appState);
  };
}

// Topology Toolbar Buttons
$("simPulseBtn").addEventListener("click", () => {
  const others = getActiveAunties();
  if (!others.length) {
    demoMode = true;
    $("simDemoBtn").textContent = "🎭 Demo Nodes: ON";
    $("simDemoBtn").classList.add("active");
    renderState(appState);
  }
  spawnPacket({ from: appState.me, to: "*", label: "🫖", kind: "file" });
  const active = getActiveAunties().filter((a) => a.online);
  if (active.length >= 2) {
    setTimeout(() => {
      spawnPacket({ from: active[0].name, to: active[1].name, label: "📌", kind: "hello" });
    }, 550);
  }
});

$("simDemoBtn").addEventListener("click", () => {
  demoMode = !demoMode;
  $("simDemoBtn").textContent = `🎭 Demo Nodes: ${demoMode ? "ON" : "OFF"}`;
  $("simDemoBtn").classList.toggle("active", demoMode);
  renderState(appState);
  if (demoMode) {
    spawnPacket({ from: appState.me, to: "*", label: "☕", kind: "hello" });
  }
});

// =====================================================================
//  REAL-TIME CID VERIFICATION PIPELINE & HASH DIFF INSPECTOR
// =====================================================================
function updatePipelineUI({ stage, filename, cid, originalCid, sha256, fake, message }) {
  $("verifyStatusText").textContent = message || "";
  const pill = $("verdictPill");
  const steps = document.querySelectorAll("#pipelineSteps .step");
  steps.forEach((s) => s.classList.remove("done", "alert"));

  if (stage === "hashing" || stage === "incoming") {
    pill.className = "verdict-pill idle";
    pill.textContent = "⏳ VERIFYING CID…";
    steps[0].classList.add("done");
    $("step1Text").textContent = sha256 ? `${sha256.slice(0, 10)}…` : "Computing SHA-256…";
    steps[1].classList.add("done");
    $("step2Text").textContent = cid ? `${cid.slice(0, 12)}…` : "Generating CIDv1…";
    return;
  }

  // Complete stage
  steps[0].classList.add("done");
  steps[1].classList.add("done");
  $("step1Text").textContent = sha256 ? `SHA256: ${sha256.slice(0, 10)}…` : "256-bit digest OK";
  $("step2Text").textContent = cid ? `CID: ${cid.slice(0, 12)}…` : "CIDv1 ready";

  if (fake) {
    steps[2].classList.add("alert");
    steps[3].classList.add("alert");
    $("step3Text").textContent = "MISMATCH vs Registry!";
    $("step4Text").textContent = "🚨 FAKE CAUGHT!";
    pill.className = "verdict-pill fake";
    pill.textContent = "🚨 TAMPERED FORWARD";
  } else {
    steps[2].classList.add("done");
    steps[3].classList.add("done");
    $("step3Text").textContent = "Matches Registry CID";
    $("step4Text").textContent = "✅ Pinned & Replicated";
    pill.className = "verdict-pill ok";
    pill.textContent = "✅ AUTHENTIC CID";
  }
}

function formatCidDiff(baseStr, targetStr) {
  if (!baseStr || !targetStr) return esc(targetStr || "—");
  let out = "";
  const max = Math.max(baseStr.length, targetStr.length);
  for (let i = 0; i < max; i++) {
    const ch = targetStr[i] || "";
    if (!ch) break;
    const same = baseStr[i] === ch;
    out += `<span class="${same ? "ch-match" : "ch-diff"}">${esc(ch)}</span>`;
  }
  return out;
}

function buildLineDiffHtml(origText, curText, isFake) {
  if (!isFake || origText === null || origText === undefined) {
    return `<div class="diff-preview">${esc(curText || "(empty)")}</div>`;
  }
  const origLines = String(origText).split(/\r?\n/).slice(0, 30);
  const curLines = String(curText).split(/\r?\n/).slice(0, 30);
  const maxLines = Math.max(origLines.length, curLines.length);
  let html = "";
  for (let i = 0; i < maxLines; i++) {
    const o = origLines[i];
    const c = curLines[i];
    if (o === c) {
      html += `<div>  ${esc(c ?? "")}</div>`;
    } else {
      if (o !== undefined) html += `<span class="diff-line-del">- [Original] ${esc(o)}</span>`;
      if (c !== undefined) html += `<span class="diff-line-add">+ [Tampered] ${esc(c)}</span>`;
    }
  }
  return `<div class="diff-preview">${html}</div>`;
}

async function inspectFile(cid, silent = false) {
  if (!cid) return;
  activeInspectCid = cid;
  document.querySelectorAll("#files .file").forEach((el) => {
    el.classList.toggle("active-inspect", el.dataset.cid === cid);
  });

  const meta = appState.files.find((f) => f.cid === cid);
  if (meta) {
    updatePipelineUI({
      stage: "complete",
      filename: meta.filename,
      cid: meta.cid,
      originalCid: meta.original || meta.cid,
      sha256: meta.sha256,
      fake: meta.fake,
      message: meta.fake
        ? `🚨 Inspecting "${meta.filename}" — Content hash differs from the original registered file!`
        : `✅ Inspecting "${meta.filename}" — Cryptographic CIDv1 verified against colony registry.`,
    });
  }

  try {
    const res = await fetch(`/inspect?cid=${encodeURIComponent(cid)}`);
    if (!res.ok) return;
    const data = await res.json();
    const cur = data.current;
    const orig = data.original;
    const holders = getHoldersForFile(cur);

    const body = $("cidInspectorBody");
    body.className = "";

    if (cur.fake && orig) {
      body.innerHTML = `
        <div class="cid-compare-grid">
          <div class="cid-box authentic">
            <h4>✅ Original Registered File (${esc(orig.filename)})</h4>
            <div><b>First shared by:</b> ${esc(orig.from || "Original Aunty")} · <b>Size:</b> ${fmtBytes(orig.size)}</div>
            <div style="margin-top:4px"><b>Registry CIDv1 Fingerprint:</b></div>
            <div class="hash-line">${formatCidDiff(orig.cid, orig.cid)}</div>
            <div><b>SHA-256 Content Hash:</b></div>
            <div class="hash-line">${esc(orig.sha256 || "Verified on IPFS")}</div>
          </div>
          <div class="cid-box tampered">
            <h4>🚨 Tampered Forward (by ${esc(cur.from)})</h4>
            <div><b>Forwarded as:</b> ${esc(cur.filename)} · <b>Size:</b> ${fmtBytes(cur.size)}</div>
            <div style="margin-top:4px"><b>Incoming CIDv1 (Red = Mismatch!):</b></div>
            <div class="hash-line">${formatCidDiff(orig.cid, cur.cid)}</div>
            <div><b>SHA-256 Content Hash:</b></div>
            <div class="hash-line">${formatCidDiff(orig.sha256 || "", cur.sha256 || "")}</div>
          </div>
        </div>
        <div>
          <strong style="font-size:12.5px;color:var(--red)">🔍 Live Content Tamper Diff (Original vs Fake Forward):</strong>
          ${buildLineDiffHtml(orig.preview?.text, cur.preview?.text, true)}
        </div>
      `;
    } else {
      body.innerHTML = `
        <div class="cid-compare-grid">
          <div class="cid-box authentic">
            <h4>✅ Cryptographic Content Fingerprint (${esc(cur.filename)})</h4>
            <div><b>Shared by:</b> ${avatar(cur.from)} ${esc(cur.from)} · <b>Size:</b> ${fmtBytes(cur.size)}</div>
            <div style="margin-top:4px"><b>IPFS CIDv1 (Content-Addressed ID):</b></div>
            <div class="hash-line"><span class="ch-match">${esc(cur.cid)}</span></div>
            <div><b>SHA-256 Mathematical Digest:</b></div>
            <div class="hash-line">${esc(cur.sha256 || "Computed by Kubo")}</div>
          </div>
          <div class="cid-box">
            <h4>📌 Decentralized Colony Replicas (${holders.length})</h4>
            <div style="color:var(--muted);margin-bottom:6px">
              Even if <b>${esc(cur.from)}</b> turns off her laptop, this file remains downloadable from any Aunty holding a pinned replica:
            </div>
            <div class="holders-row">
              ${holders.map((h) => `<span class="holder-chip">${avatar(h)} ${esc(h)}</span>`).join("")}
            </div>
            <div style="margin-top:8px;font-size:11.5px;color:var(--leaf)">
              ✔ Registry Lock: Any future upload named <b>${esc(cur.filename)}</b> with a different CID will trigger a Fake Alert.
            </div>
          </div>
        </div>
        <div>
          <strong style="font-size:12.5px;color:var(--pink-d)">📄 Verified File Content Preview:</strong>
          ${buildLineDiffHtml(null, cur.preview?.text, false)}
        </div>
      `;
    }
  } catch (e) {
    console.error("Inspect error:", e);
  }
}

// ---- Live SSE Updates from Server ----
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
  if (b.kind === "file") {
    haww(false);
    if (b.cid) inspectFile(b.cid);
  }
  if (b.kind === "fake") {
    haww(true);
    if (b.cid) inspectFile(b.cid);
  }
  if (b.kind === "mine" && b.cid) {
    inspectFile(b.cid);
  }
});
es.addEventListener("packet", (e) => {
  const pkt = JSON.parse(e.data);
  spawnPacket(pkt);
});
es.addEventListener("verify", (e) => {
  const v = JSON.parse(e.data);
  updatePipelineUI(v);
});
es.onerror = () => {
  $("me").textContent = "reconnecting to aunty server…";
};

// ---- Chat & File Upload Actions ----
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
  if (!r.ok) {
    alert("Upload failed: " + (await r.text()));
  } else {
    const resData = await r.json();
    if (resData.cid) inspectFile(resData.cid);
  }
  $("file").value = "";
};