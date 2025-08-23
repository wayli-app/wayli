#!/bin/bash
# Docker Entrypoint Script for Wayli Web Application
#
# This script handles starting different services based on the APP_MODE environment variable:
# - APP_MODE=web: Starts nginx to serve the SvelteKit app
# - APP_MODE=worker: Starts a background worker process
#
# Author: Wayli Development Team
# Version: 3.1.0

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

# Function to start nginx
start_nginx() {
    echo "🌐 Starting nginx..."

    # Ensure nginx directories exist and have correct permissions
    mkdir -p /var/log/nginx /var/cache/nginx
    chown -R appuser:appuser /var/log/nginx /var/cache/nginx

    # Test nginx configuration
    nginx -t

    # Start nginx in foreground
    echo "🚀 nginx started successfully"
    exec nginx -g "daemon off;"
}

# Function to start worker
start_worker() {
    echo "⚙️ Starting worker..."

    # Switch to non-root user for worker processes
    exec su -c "npm run worker" appuser
}

# Start appropriate service based on APP_MODE
case "${APP_MODE:-web}" in
    "web")
        start_nginx
        ;;
    "worker")
        start_worker
        ;;
esac
