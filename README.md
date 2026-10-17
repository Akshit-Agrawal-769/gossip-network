# 🫖 Aunty Network

**Indian aunties have run a zero-infrastructure, peer-to-peer information network for centuries. We built the digital version.**

Aunty Network lets laptops (and phones) share files and messages with **no internet, no Wi-Fi router, no cloud**. Information spreads laptop-to-laptop like gossip, and every file is **verified before it is forwarded**, so tampered "forwards" get caught.

> Bridge the Gap: people who **have** information ↔ people who **need** it, when the internet is gone.

## How it works

| Piece | What it does |
|---|---|
| **IPFS (Kubo)** | Stores files and gives each one a fingerprint (**CID**) made from its *content*. Laptops on the same hotspot find each other automatically (mDNS). |
| **Pubsub ("gossip protocol")** | Each laptop shouts "I have a new file!" to every other laptop. Gossip protocol is a real computer-science term. |
| **server.js** | Small Node.js server (no npm packages) that talks to the local IPFS node and serves the web page. |
| **Fake-forward detection** | Same filename + different fingerprint = content was changed → 🚨 *"Yeh forward FAKE hai, beta!"* |
| **Presence** | Every aunty says hello every 5 s. Silent for 20 s → *"has left the kitty party… but the gossip survives."* |

## Run it (Windows)

**Once per laptop (needs internet):**
1. Install Node.js: `winget install OpenJS.NodeJS.LTS`
2. Download Kubo: https://github.com/ipfs/kubo/releases/latest → `kubo_v0.43.1_windows-amd64.zip` → put `ipfs.exe` in this folder.

**Every time:**
1. Connect all laptops to **one phone hotspot** (mobile data can be OFF). Set the network to **Private** in Windows settings.
2. Double-click **`start-ipfs.bat`** → wait for `Daemon is ready`. Allow through the firewall (Private networks).
3. Double-click **`start-aunty.bat`** → type the aunty name (e.g. `Sharma Aunty`). Allow through the firewall.
4. Open **http://localhost:3000**. Phones on the hotspot open the address shown on the page.

### If an aunty doesn't show up under "Present today"
Type her laptop's IP into **Invite an aunty** in the sidebar and click **Invite**. The app asks her laptop for its IPFS identity and connects the two nodes directly.

If that fails, allow the ports through Windows Firewall (PowerShell as Administrator, on every laptop):
```
New-NetFirewallRule -DisplayName "IPFS 4001" -Direction Inbound -Protocol TCP -LocalPort 4001 -Action Allow
New-NetFirewallRule -DisplayName "Aunty 3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
```

## Demo script
1. Turn off the internet. *"Wi-Fi gone. Exam tomorrow. Panic."*
2. Sharma Aunty shares `DBMS_notes.txt` → other laptops: **HAWWW!** and the file appears.
3. Tick **😈 Fake Aunty mode**, pick `DBMS_notes.txt`, upload a different file → everyone gets a red **FAKE** alert.
4. Close Sharma Aunty's laptop → *"Sharma Aunty has left the kitty party… but the gossip survives."* Others can still download the notes.

## Settings
| Env variable | Default |
|---|---|
| `AUNTY_NAME` | `Sharma Aunty` |
| `PORT` | `3000` |
| `KUBO_API` | `http://127.0.0.1:5001/api/v0` |
