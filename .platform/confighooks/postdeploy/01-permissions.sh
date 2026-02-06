#!/bin/bash
# Configuration hook to set permissions

# Ensure log directories exist
mkdir -p /var/log/nodejs
chmod 755 /var/log/nodejs

echo "[$(date)] Post-config hook: Permissions configured"
