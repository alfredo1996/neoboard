# ---- deps: install production dependencies ----
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy root package manifest and lockfile (workspaces config lives here)
COPY package.json package-lock.json ./

# Copy child package manifests (npm needs these to resolve workspaces)
COPY app/package.json ./app/
COPY component/package.json ./component/
COPY connector-sdk/package.json ./connector-sdk/
COPY connection/package.json ./connection/
COPY cli/package.json ./cli/

# Single install resolves all workspaces — hoists shared deps to root
RUN npm ci

# ---- build: compile Next.js standalone output ----
FROM node:22-alpine AS build
RUN apk add --no-cache libc6-compat
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

# Copy all node_modules (root hoisted deps + any workspace-specific deps
# that npm chose not to hoist because of version conflicts between siblings).
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/app/node_modules ./app/node_modules
# Some deps (e.g. lucide-react, react-day-picker) live only in the
# component workspace because app pins different major versions; without
# this copy `next build` can't resolve them through the @neoboard/components
# symlink at runtime.
COPY --from=deps /app/component/node_modules ./component/node_modules

# Copy all source
COPY . .

# Build connector-sdk → connection (TypeScript → JS+d.ts) before app.
# connection imports @neoboard/connector-sdk, which resolves to its built
# dist, so the SDK must be compiled first (mirrors the root build chain).
RUN npm -w connector-sdk run build
RUN npm -w connection run build
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

# Schema migrations, applied at boot by instrumentation (MIGRATE_ON_START).
# The image has no drizzle-kit — this journal + the programmatic migrator
# are the only way a pure-Docker deployment can create its schema.
COPY --from=build --chown=nextjs:nodejs /app/app/drizzle ./app/drizzle

# Strip any .env files that leaked via standalone output tracing.
# Secrets must be passed as runtime environment variables, never baked in.
RUN find . -name ".env" -o -name ".env.*" | xargs rm -f 2>/dev/null; true

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Apply pending DB migrations at boot (advisory-locked, idempotent).
# Override with MIGRATE_ON_START=0 for emergency debugging only.
ENV MIGRATE_ON_START=1
ENV MIGRATIONS_DIR=/app/app/drizzle/migrations

# All config is via runtime env vars. Required:
#   DATABASE_URL          — PostgreSQL connection string
#   ENCRYPTION_KEY        — AES-256 key for connection credential encryption (64-char hex)
#   NEXTAUTH_SECRET       — Auth.js session signing secret
#   API_KEY_HMAC_SECRET   — HMAC secret for hashing API keys at rest. Required
#                           on every install: API keys are a community feature
#                           and env-config marks it required, so the app exits
#                           at boot without it.
#   NEXTAUTH_URL          — Public URL of the app (e.g. https://neoboard.example.com)
# The full catalogue of optional vars (auth/bootstrap, OIDC SSO, logging,
# query scheduler tuning, CORS/HTTPS, edition) lives in app/.env.example —
# the single documented list (#931). Don't duplicate it here.

# start-period 30s: Next.js cold start with boot migrations easily exceeds
# 10s — don't flap during startup (#931; matches what compose files used to
# override).
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["node", "app/server.js"]
