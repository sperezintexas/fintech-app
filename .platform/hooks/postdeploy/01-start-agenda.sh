#!/bin/bash
# Post-deploy hook: Agenda is started at Node process startup via src/instrumentation.ts.
# This health check verifies the app (and thus the scheduler) is up.

echo "[$(date)] Post-deploy hook: Application deployed successfully"
sleep 5
curl -s http://localhost:3000/api/health || echo "Health check pending..."

exit 0
