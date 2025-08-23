# Multi-stage Dockerfile for web app and worker

FROM node:20-slim AS builder

WORKDIR /app

# Copy and install dependencies
COPY web/package*.json ./

# Install dependencies with overrides to exclude problematic optional dependencies
RUN npm install --legacy-peer-deps

# Copy source
COPY web/ ./

# Build SvelteKit app
RUN npm run build

FROM node:20-slim AS runtime

WORKDIR /app

# Copy built app and necessary files
COPY --from=builder /app/.svelte-kit ./svelte-kit
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src

# Default environment
ENV NODE_ENV=production

# Expose web port (server usage)
EXPOSE 3000

# Configurable entrypoint via APP_MODE:
# - APP_MODE=web     → serve built site (vite preview)
# - APP_MODE=worker  → run background worker
# - APP_MODE=workers → run worker manager

ENV APP_MODE=web

# Use a small entry script to select mode
COPY web/src/scripts/worker.ts ./src/scripts/worker.ts
COPY web/src/scripts/worker-manager.ts ./src/scripts/worker-manager.ts

CMD ["bash", "-lc", "if [ \"$APP_MODE\" = \"worker\" ]; then npm run worker; elif [ \"$APP_MODE\" = \"workers\" ]; then npm run worker-manager; else npm run preview -- --host 0.0.0.0 --port 3000; fi"]