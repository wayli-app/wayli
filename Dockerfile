# Use Node.js as base image
FROM node:20-slim AS builder

# Install bun
RUN npm install -g bun

# Set working directory
WORKDIR /app

# Copy package files
COPY web/package*.json ./
COPY web/bun.lock ./

# Install dependencies
RUN bun install

# Copy source files
COPY web/ ./

# Build the application
RUN bun run build

# Production stage
FROM node:20-slim

# Install bun
RUN npm install -g bun

# Set working directory
WORKDIR /app

# Copy built files from builder stage
COPY --from=builder /app/build ./build
COPY --from=builder /app/package*.json ./

# Install production dependencies only
RUN bun install --production

# Expose port
EXPOSE 3000

# Start the application
CMD ["bun", "run", "start"]