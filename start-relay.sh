#!/bin/sh
# Starts the Relay web app. Run this after start-ipfs.sh shows "Daemon is ready".
cd "$(dirname "$0")"
printf "Name for this device (press Enter to use the computer name): "
read NODE_NAME
if [ -z "$NODE_NAME" ]; then NODE_NAME="$(hostname)"; fi
export NODE_NAME
node server.js
