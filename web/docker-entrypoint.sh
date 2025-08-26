#!/bin/bash
# Docker Entrypoint Script for Wayli Web Application
#
# This script handles starting different services based on the APP_MODE environment variable:
# - APP_MODE=web: Starts nginx to serve the SvelteKit app
# - APP_MODE=worker: Starts a background worker process
#
# Author: Wayli Development Team
# Version: 3.3.0

set -e

echo "=== Container Starting ==="
echo "Current directory: $(pwd)"
echo "APP_MODE: ${APP_MODE:-web (default)}"

# Validate APP_MODE
case "${APP_MODE:-web}" in
    "web"|"worker")
        echo "✅ Valid APP_MODE: ${APP_MODE:-web}"
        ;;
    *)
        echo "❌ Invalid APP_MODE: ${APP_MODE}. Must be one of: web, worker"
        exit 1
        ;;
esac

# Function to start worker
start_worker() {
    echo "⚙️ Starting worker..."

    # Start worker process using npm script (already running as appuser)
    exec npm run worker
}

# Function to start web server
start_web() {
    echo "🌐 Starting web server..."

    # Use the startup script for web mode
    exec /usr/local/bin/startup.sh
}

# Start appropriate service based on APP_MODE
case "${APP_MODE:-web}" in
    "web")
        start_web
        ;;
    "worker")
        start_worker
        ;;
esac
