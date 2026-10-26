# Multi-stage Dockerfile for Pomerado MCP & CLI
FROM node:24-bookworm-slim AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.34.5 --activate

# Layer caching: copy package manifests first
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy build configs and source files
COPY tsconfig.json tsconfig.test.json vitest.config.ts playwright.config.ts ./
COPY tools ./tools
COPY third-party ./third-party
COPY typescript ./typescript

RUN pnpm run build

# Production runner stage
FROM node:24-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy full dependencies and built distribution from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json README.md LICENSE ./

# Link CLI binaries (pomerado and pomerado-mcp) globally
RUN npm link

# Default integrations directory with node user ownership
RUN mkdir -p /integrations && chown -R node:node /integrations /app
VOLUME /integrations

USER node

EXPOSE 3000

CMD ["pomerado-mcp", "mint", "--root", "/integrations"]
