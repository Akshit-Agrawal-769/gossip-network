# Relay

Relay lets laptops and phones share messages, files, photos and voice notes **without internet access**. Devices on the same local network (a Wi-Fi router or a phone hotspot with mobile data off) talk to each other directly. There are no servers and no cloud accounts.

Every shared file is identified by a **content fingerprint (CID)**. If someone later shares a different file under the same name, every other device detects that the content has changed and refuses to download it.

Intended for situations where connectivity fails but people are still physically close: disaster response, relief camps, large events, campuses during outages, and remote sites.

## How it works

| Component | Role |
|---|---|
| **IPFS (Kubo)** | Stores files by content. Each file's CID is derived from its bytes, so identical content always has the same CID and any change produces a different one. |
| **libp2p pubsub** | Carries small announcements between peers: messages, "a new file is available at this CID", and presence. Uses a gossip protocol, so each node only talks to a few neighbours. |
| **mDNS** | Lets nodes on the same local network discover each other automatically. |
| **`server.js`** | A small Node.js server with no npm dependencies. It talks to the local IPFS node over its HTTP API and serves the web app. |
| **`public/index.html`** | The web app. Plain HTML, CSS and JavaScript with Server-Sent Events for live updates. Works on any device's browser. |

### Integrity checks
1. The first CID seen for a filename on the network becomes its reference. Nodes share their references with each other, so a device that joins later still knows them.
2. When a peer announces a file, the receiving node compares its CID with the reference **before downloading**.
3. A mismatch means the content was changed. The file is quarantined, and the app shows both fingerprints side by side with a link to the original.

The colour strip next to each file is a visual rendering of its CID, so two fingerprints can be compared at a glance.

### Resilience
When a node receives a file it pins a copy. If the original sender goes offline, the file can still be fetched from any peer that holds it.

## Running it

**Once per device (needs internet):**
1. Install Node.js 18 or later. On Windows: `winget install OpenJS.NodeJS.LTS`
2. Download Kubo from https://github.com/ipfs/kubo/releases/latest and put the `ipfs` executable (`ipfs.exe` on Windows) in this folder.

**Each time:**
1. Connect all devices to the same network. It does not need internet access. On Windows, set that network's profile to **Private**.
2. Start the IPFS node: `start-ipfs.bat` on Windows, `./start-ipfs.sh` on macOS or Linux. Wait for `Daemon is ready`.
3. Start Relay: `start-relay.bat` or `./start-relay.sh`, and enter a name for this device.
4. Open http://localhost:3000. Other devices on the network can open the address shown under **Open on other devices**.

### If a peer doesn't appear
Enter its IP address under **Connect to a peer**. The app asks that device for its IPFS identity and connects the two nodes directly.

If that fails, allow the ports through the firewall. On Windows, in PowerShell as Administrator:
```
New-NetFirewallRule -DisplayName "Relay IPFS 4001" -Direction Inbound -Protocol TCP -LocalPort 4001 -Action Allow
New-NetFirewallRule -DisplayName "Relay web 3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
```

## Configuration

| Environment variable | Default | Purpose |
|---|---|---|
| `NODE_NAME` | the computer's hostname | Display name for this device (can also be changed in the app) |
| `PORT` | `3000` | Port for the web app |
| `KUBO_API` | `http://127.0.0.1:5001/api/v0` | Address of the local IPFS node's API |
| `RELAY_TOPIC` | `relay/v1` | Pubsub topic. Devices only see each other if they use the same topic. |
| `APP_NAME` | `Relay` | Product name shown in the app |

Local state (activity log, file list, integrity references) is kept in `data/state.json`.

## Limitations
- Devices must share a local network. Phone-to-phone connections without a hotspot are not supported yet.
- The integrity reference is **first seen**: whoever shares a filename first defines the original. Signed publishing (below) would remove this assumption.
- Microphone and camera capture need `http://localhost` or HTTPS, so they work on the device running the node but not on other devices opening it over plain HTTP.

## Roadmap
- **Signed publishers:** files signed with a node's key, so devices can trust a known source rather than whoever shared first.
- **Direct phone-to-phone links** over Wi-Fi Direct or Bluetooth, removing the need for a shared hotspot.
- **Long-range links** with LoRa radios for areas without any shared network.
- **Guaranteed replication** with IPFS Cluster, so important files always exist on a minimum number of nodes.
- **End-to-end encryption** for private groups.
- **Store-and-forward sync**, so a device that moves between networks carries files across them.
