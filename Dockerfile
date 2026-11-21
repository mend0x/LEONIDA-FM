# syntax=docker/dockerfile:1
ARG NODE_IMAGE=node:24-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54
FROM ${NODE_IMAGE} AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund && chown -R node:node /app

FROM dependencies AS development
RUN mkdir -p /app/.local && chown node:node /app/.local && chmod 0700 /app/.local
COPY --chown=node:node . .
USER node
ENV HOST=0.0.0.0 PORT=5173
CMD ["npm", "run", "dev"]

FROM dependencies AS build
COPY --chown=node:node . .
USER node
RUN npm run build && test -s /app/dist/client/index.html

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=5173 DATABASE_PATH=/app/.local/leonida.sqlite
RUN mkdir -p /app/.local && chown node:node /app/.local && chmod 0700 /app/.local
COPY --from=build /app/package.json ./
COPY --from=build /app/server ./server
COPY --from=build /app/data ./data
COPY --from=build /app/dist/client ./dist/client
COPY --from=build /app/scripts/sqlite-backup.mjs ./scripts/sqlite-backup.mjs
COPY --from=build /app/infra/container-entrypoint.sh /usr/local/bin/leonida-entrypoint
USER node
EXPOSE 5173
ENTRYPOINT ["/bin/sh", "/usr/local/bin/leonida-entrypoint"]
CMD ["node", "server/node.mjs"]
