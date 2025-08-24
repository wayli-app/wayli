# Single-stage Dockerfile for Wayli - supports both web and worker modes
# Kubernetes-compatible with non-root user

FROM node:20-slim

# Install nginx and wget for health checks
RUN apt  update && apt  install -y \
    nginx \
    wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install dependencies
COPY web/package*.json ./
RUN npm install --legacy-peer-deps

# Copy source code
COPY web/ ./

# Build SvelteKit app
RUN npm run build

# Verify build output
RUN echo "=== Build Complete ===" && \
    ls -la build/ && \
    ls -la static/

# Copy nginx configuration
COPY web/nginx.conf /etc/nginx/nginx.conf

# Copy built app to nginx directory
RUN cp -r build/* /usr/share/nginx/html/ && \
    cp -r static /usr/share/nginx/html/

# Copy worker scripts and entrypoint
COPY web/docker-entrypoint.sh ./docker-entrypoint.sh
COPY web/src/scripts/worker.ts ./src/scripts/worker.ts

# Make entrypoint script executable
RUN chmod +x ./docker-entrypoint.sh

# Create non-root user first
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Create nginx directories with correct ownership from the start
RUN mkdir -p /var/log/nginx /var/cache/nginx /var/lib/nginx /run /tmp/nginx && \
    chown -R appuser:appuser /var/log/nginx /var/cache/nginx /var/lib/nginx /run /tmp/nginx && \
    chmod -R 755 /var/log/nginx /var/cache/nginx /var/lib/nginx && \
    chmod 755 /run /tmp/nginx

# Set proper permissions for app and nginx files
RUN chown -R appuser:appuser /app && \
    chown -R appuser:appuser /usr/share/nginx/html && \
    chmod -R 755 /usr/share/nginx/html

# Create Kubernetes-compatible nginx configuration
RUN echo 'pid /tmp/nginx/nginx.pid;' >> /etc/nginx/nginx.conf && \
    echo 'error_log /tmp/nginx/error.log;' >> /etc/nginx/nginx.conf && \
    echo 'access_log /tmp/nginx/access.log;' >> /etc/nginx/nginx.conf

# Switch to non-root user for Kubernetes compatibility
USER appuser

# Expose port 80
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/health || exit 1

# Default environment
ENV NODE_ENV=production
ENV APP_MODE=web

# Entrypoint script that handles different modes
ENTRYPOINT ["./docker-entrypoint.sh"]
