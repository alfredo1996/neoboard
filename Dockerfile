# ---- deps: install production dependencies ----
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy root package manifest and lockfile (workspaces config lives here)
COPY package.json package-lock.json ./

# Copy child package manifests (npm needs these to resolve workspaces)
COPY app/package.json ./app/
COPY component/package.json ./component/
COPY connection/package.json ./connection/
COPY cli/package.json ./cli/

# Single install resolves all workspaces — hoists shared deps to root
RUN npm ci

# ---- build: compile Next.js standalone output ----
FROM node:22-alpine AS build
RUN apk add --no-cache libc6-compat
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

# Copy all node_modules (root hoisted deps + any workspace-specific deps)
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/app/node_modules ./app/node_modules

# Copy all source
COPY . .

# Build connection package (TypeScript → JS+d.ts) before app
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

# Strip any .env files that leaked via standalone output tracing.
# Secrets must be passed as runtime environment variables, never baked in.
RUN find . -name ".env" -o -name ".env.*" | xargs rm -f 2>/dev/null; true

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# All config is via runtime env vars — see app/.env.example for full reference.
#
# Required:
#   DATABASE_URL          — PostgreSQL connection string
#   ENCRYPTION_KEY        — AES-256 key (64-char hex). Generate: openssl rand -hex 32
#   NEXTAUTH_SECRET       — Session signing secret (32+ chars). Generate: openssl rand -hex 32
#   NEXTAUTH_URL          — Public URL (e.g. https://neoboard.example.com)
#
# Optional — Auth:
#   TENANT_ID             — Multi-tenant isolation key (default: "default")
#   SESSION_MAX_AGE       — Session timeout in seconds (default: 28800)
#   REGISTRATION_ENABLED  — Allow signups (default: true)
#   ADMIN_BOOTSTRAP_TOKEN — Required token for first admin signup
#   BOOTSTRAP_ADMIN_EMAIL — Auto-create admin on first start
#   BOOTSTRAP_ADMIN_PASSWORD
#   API_KEY_HMAC_SECRET   — HMAC key for API key hashing
#
# Optional — Security:
#   FORCE_HTTPS           — HTTPS redirect (default: true in production)
#   CORS_ALLOWED_ORIGINS  — Comma-separated allowed origins
#
# Optional — Enterprise SSO (requires NEOBOARD_EDITION=enterprise):
#   NEOBOARD_EDITION      — Set to "enterprise" to enable SSO
#   OIDC_ISSUER           — IdP issuer URL (all three OIDC_* required together)
#   OIDC_CLIENT_ID        — OIDC client ID
#   OIDC_CLIENT_SECRET    — OIDC client secret
#   OIDC_DISPLAY_NAME     — Login button label (default: "SSO")
#   OIDC_SCOPES           — OIDC scopes (default: "openid profile email")
#   OIDC_AUTO_PROVISION   — Auto-create users on SSO login (default: true)
#   OIDC_DEFAULT_ROLE     — Default role: admin/creator/reader (default: creator)
#   OIDC_ENFORCE_SSO      — Disable password login for non-admins (default: false)
#   OIDC_CLAIM_KEY        — IdP claim for role mapping (e.g. "groups")
#   OIDC_ADMIN_VALUE      — Claim value(s) for admin role
#   OIDC_CREATOR_VALUE    — Claim value(s) for creator role
#   OIDC_READER_VALUE     — Claim value(s) for reader role

CMD ["node", "app/server.js"]
