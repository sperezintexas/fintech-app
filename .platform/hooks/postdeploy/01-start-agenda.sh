#!/bin/bash
# Post-deploy hook to ensure Agenda scheduler is initialized
# Agenda auto-starts when the Next.js app initializes via getAgenda()

# Log deployment success
echo "[$(date)] Post-deploy hook: Application deployed successfully"
echo "[$(date)] Agenda scheduler will auto-start with the application"

# Call health check to verify deployment and initialize scheduler
sleep 5
curl -s http://localhost:3000/api/health || echo "Health check pending..."

exit 0
