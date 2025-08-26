# Single-stage Dockerfile for Wayli - supports both web and worker modes
# Uses Nginx for static file serving (more performant) + Node.js for worker processes

FROM node:20-slim

# Install nginx and wget for static file serving and health checks
RUN apt-get update && apt-get install -y nginx wget && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install dependencies
COPY web/package*.json ./
RUN npm install --legacy-peer-deps

# Copy source code
COPY web/ ./

# Generate SvelteKit TypeScript configuration and build app
RUN npm run prepare && npm run build

# Verify build output
RUN echo "=== Build Complete ===" && \
    echo "Available directories:" && \
    ls -la && \
    echo "Build directory:" && \
    ls -la build/ && \
    echo "Static files:" && \
    ls -la static/

# Copy nginx config and serve static files
COPY web/nginx.conf /etc/nginx/nginx.conf
RUN rm -rf /usr/share/nginx/html/* && \
    cp -r build/* /usr/share/nginx/html/ && \
    cp -r static /usr/share/nginx/html/

# Copy startup script
COPY web/startup.sh /usr/local/bin/startup.sh

# Make startup script executable
RUN chmod +x /usr/local/bin/startup.sh

# Copy worker entrypoint
COPY web/docker-entrypoint.sh ./docker-entrypoint.sh

# Make entrypoint script executable
RUN chmod +x ./docker-entrypoint.sh

# Create non-root user for Kubernetes compatibility
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Create nginx directories with proper ownership
RUN mkdir -p /var/log/nginx /var/cache/nginx /var/lib/nginx /run /tmp/nginx && \
    chown -R appuser:appuser /var/log/nginx /var/cache/nginx /var/lib/nginx /run /tmp/nginx && \
    chmod -R 755 /var/log/nginx /var/cache/nginx /var/lib/nginx && \
    chmod 755 /run /tmp/nginx

# Set proper permissions for app files and nginx
RUN chown -R appuser:appuser /app /usr/share/nginx/html && \
    chmod -R 755 /app && \
    chmod -R 755 /usr/share/nginx/html

# Switch to non-root user
USER appuser

# Expose port 80 (nginx default)
EXPOSE 80

# Health check using nginx
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/health || exit 1

# Default environment
ENV NODE_ENV=production
ENV APP_MODE=web
ENV PORT=80

# Entrypoint script that handles different modes
ENTRYPOINT ["./docker-entrypoint.sh"]
