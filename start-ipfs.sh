#!/bin/sh
# Starts this device's IPFS node. Keep this terminal open while using Relay.
cd "$(dirname "$0")"
IPFS=ipfs
[ -x ./ipfs ] && IPFS=./ipfs
[ -f "$HOME/.ipfs/config" ] || $IPFS init
$IPFS config --json Pubsub.Enabled true
echo "Starting IPFS. When it shows 'Daemon is ready', run ./start-relay.sh"
$IPFS daemon
