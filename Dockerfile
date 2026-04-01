# ---- deps: install production dependencies ----
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package manifests for all packages
COPY package.json package-lock.json ./
COPY app/package.json app/package-lock.json ./app/
COPY component/package.json component/package-lock.json ./component/
COPY connection/package.json connection/package-lock.json ./connection/

# Install sub-packages first (app depends on them via file: refs)
RUN npm ci --prefix component & \
    npm ci --prefix connection & \
    wait
# Now install app (resolves file:../connection and file:../component)
RUN npm ci --prefix app

# ---- build: compile Next.js standalone output ----
FROM node:22-alpine AS build
RUN apk add --no-cache libc6-compat
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/app/node_modules ./app/node_modules
COPY --from=deps /app/component/node_modules ./component/node_modules
COPY --from=deps /app/connection/node_modules ./connection/node_modules

# Copy all source
COPY . .

RUN cd app && npm run build

# ---- runner: minimal production image ----
FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Install sharp for optimized image processing (Next.js Image component)
RUN npm i --prefix /tmp sharp && \
    mkdir -p app/node_modules && \
    mv /tmp/node_modules/sharp app/node_modules/sharp && \
    rm -rf /tmp/node_modules /tmp/package*.json

# Copy standalone server, static assets, and public files.
COPY --from=build --chown=nextjs:nodejs /app/app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/app/.next/static ./app/.next/static
COPY --from=build --chown=nextjs:nodejs /app/app/public ./app/public

# Strip any .env files that leaked via standalone output tracing.
# Secrets must be passed as runtime environment variables, never baked in.
RUN find . -name ".env" -o -name ".env.*" | xargs rm -f 2>/dev/null; true

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# All config is via runtime env vars:
#   DATABASE_URL          — PostgreSQL connection string
#   ENCRYPTION_KEY        — AES-256 key for connection credential encryption (64-char hex)
#   NEXTAUTH_SECRET       — Auth.js session signing secret
#   NEXTAUTH_URL          — Public URL of the app (e.g. https://neoboard.example.com)
#   API_KEY_HMAC_SECRET   — (optional) HMAC key for API key hashing
#   TENANT_ID             — (optional) Multi-tenant isolation key (default: "default")

CMD ["node", "app/server.js"]
