FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/app/data
RUN groupadd --gid 1001 journal \
    && useradd --uid 1001 --gid journal --no-create-home --shell /usr/sbin/nologin journal \
    && mkdir -p /app/data /app/.next/cache \
    && chown -R journal:journal /app
COPY --from=builder --chown=journal:journal /app/.next/standalone ./
COPY --from=builder --chown=journal:journal /app/.next/static ./.next/static
COPY --from=builder --chown=journal:journal /app/public ./public
COPY --from=builder --chown=journal:journal /app/db/sqlite.mjs ./db/sqlite.mjs
COPY --from=builder --chown=journal:journal /app/drizzle ./drizzle
COPY --from=builder --chown=journal:journal /app/scripts/entrypoint.mjs /app/scripts/migrate.mjs /app/scripts/setup-admin.mjs /app/scripts/diagnose-github-contributions.mjs ./scripts/
USER journal
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/api/session').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "scripts/entrypoint.mjs"]
