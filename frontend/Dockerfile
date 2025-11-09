FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Build
RUN npm run build

# ==============================================================================
# Runtime
# ==============================================================================
FROM node:22-alpine AS runtime

RUN apk add --no-cache dumb-init curl

WORKDIR /app

# Copy from builder
COPY --from=builder /app/build ./build
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

# Non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001
RUN chown -R nodejs:nodejs /app
USER nodejs

EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=20s \
  CMD curl -f http://localhost:3002 || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "build"]
