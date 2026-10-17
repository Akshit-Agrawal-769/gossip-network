# 🫖 Aunty Network

**Indian aunties have run a zero-infrastructure, peer-to-peer information network for centuries. We built the digital version.**

Aunty Network lets laptops (and phones) share files and messages with **no internet, no Wi-Fi router, no cloud**. Information spreads laptop-to-laptop like gossip, and every file is **verified before it is forwarded**, so tampered "forwards" get caught in real time.

> **Devlympics – Shunya 2026 ("Bridge the Gap")**:
> 1. **Resource & Access Gap**: Connects people who **have** critical information ↔ people who **need** it when the internet is down or unavailable.
> 2. **Complex Tech ↔ Ordinary Users Gap**: Turns opaque peer-to-peer mesh protocols (mDNS, IPFS Pubsub, SHA-256 content addressing, CIDv1) into a joyful, visual **Indian Aunty Kitty Party** with a live interactive topology and real-time hash diff inspector.

## ✨ Key Features

| Piece | What it does |
|---|---|
| **IPFS (Kubo)** | Stores files and gives each one a cryptographic fingerprint (**CIDv1**) made from its *content*. Laptops on the same hotspot find each other automatically (mDNS). |
| **Pubsub ("gossip protocol")** | Each laptop shouts `"I have a new file!"` (`aunty-gossip`) to every other laptop, plus broadcasts `pin_ack` receipts as replicas spread across the colony. |
| **🕸️ Live Gossip Topology Visualizer** | Interactive HTML5 canvas showing online/offline Aunties, animated gossip packets (`🫖`, `📄`, `🚨`, `📌`), replica badges on each node, and a click-to-inspect node popover. |
| **🔐 Cryptographic CID & Content Diff Lab** | Real-time 4-stage pipeline (`SHA-256` → `CIDv1` → `Registry Check` → `Colony Verdict`) with character-by-character hash mismatch highlighting and a live **line-by-line text diff** showing what "Fake Aunty" tampered with! |
| **🔗 One-Click Peer Bridge** | Copy your IPFS multiaddr or bridge directly to another laptop's IP/PeerID right from the sidebar UI—no terminal commands needed during a live demo. |
| **Zero Dependencies** | Pure Node.js built-ins (`http`, `fs`, `crypto`) + vanilla HTML/CSS/JS. Zero `npm install` required—100% offline-ready. |

## 🚀 Run it (Windows / macOS / Linux)

**Once per laptop:**
1. Install Node.js (v18+): `winget install OpenJS.NodeJS.LTS`
2. Put `ipfs.exe` (Kubo) in this folder (already included for Windows).

**Every time:**
1. Connect all laptops to **one phone hotspot** (mobile data can be **OFF**). Set the network to **Private** in Windows settings.
2. Double-click **`start-ipfs.bat`** (or `./start-ipfs.sh`) → wait for `Daemon is ready`. Allow through the firewall.
3. Double-click **`start-aunty.bat`** (or `./start-aunty.sh`) → type the aunty name (e.g. `Sharma Aunty`).
4. Open **http://localhost:3000**. Phones on the hotspot open the LAN URL shown in the sidebar.

### If laptops don't see each other automatically
Use the **Network & Peer Bridge** box in the left sidebar:
1. On Laptop B, click **📋 Copy my IPFS peer address**.
2. On Laptop A, paste it into the bridge box and click **🔗 Bridge**!

## 🎬 Winning Demo Script (2 Minutes)
1. **Disconnect the internet**: *"Wi-Fi is dead. Exam is tomorrow. How do we bridge the gap between the student who has the notes and the rest of the hostel?"*
2. **Share a verified file**: On `Sharma Aunty`, upload `DBMS_notes.txt`. Watch the **Live Gossip Topology** shoot animated packets across the mesh, hear the **HAWWW!** whistle, and see the **4-Step CID Verification Pipeline** lock the file's `SHA-256` & `CIDv1` into the colony registry.
3. **Catch a Fake Forward live**: Tick **😈 Fake Aunty mode**, pick `DBMS_notes.txt`, and upload a modified version. Every laptop flashes a red **FAKE!!** alert, and the **Cryptographic CID & Content Diff Lab** highlights the exact mismatched CID characters *and* the exact lines of text that were secretly altered!
4. **Prove Decentralization**: Close `Sharma Aunty`'s laptop → *"Sharma Aunty has left the kitty party… but the gossip survives."* Click any remaining Aunty node on the topology map to show she still holds a pinned replica (`📌`), and download the file with the original sender offline.

## ⚙️ Settings
| Env variable | Default |
|---|---|
| `AUNTY_NAME` | `Sharma Aunty` |
| `PORT` | `3000` |
| `KUBO_API` | `http://127.0.0.1:5001/api/v0` |

