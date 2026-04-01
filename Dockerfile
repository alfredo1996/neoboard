# ---- deps: install all production dependencies ----
FROM node:22-alpine AS deps
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
WORKDIR /app

COPY --from=deps /app/app/node_modules ./app/node_modules
COPY --from=deps /app/component/node_modules ./component/node_modules
COPY --from=deps /app/connection/node_modules ./connection/node_modules

# Copy all source
COPY . .

RUN cd app && npm run build

# ---- runner: minimal production image ----
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone server and static assets
COPY --from=build --chown=nextjs:nodejs /app/app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/app/.next/static ./app/.next/static
COPY --from=build --chown=nextjs:nodejs /app/app/public ./app/public

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "app/server.js"]
