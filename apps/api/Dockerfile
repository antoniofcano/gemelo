# Imagen de la api. Contexto de construcción: la raíz del repo (infra/compose.yml: context ..), porque necesita
# contratos/haza.schema.json, olivos-haza.schema.json, tiempo.schema.json y config.schema.json (sharp trae libvips precompilada para alpine/musl en el lock).
# Node 24 LTS (en mantenimiento hasta 2028-04-30) fijado por versión y digest:
# la 26 es LTS activa desde el 2026-10-28 pero su imagen oficial con sello LTS (26.13.0) no estaba publicada al
# comprobarlo (2026-10-29). Ver doc/operacion/RUNBOOK-VPS.md.
FROM node:24.22.1-alpine3.24@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53 AS construye
WORKDIR /app
COPY apps/api/package.json apps/api/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY apps/api/tsconfig.json apps/api/tsconfig.build.json ./
COPY apps/api/src ./src
RUN npx tsc -p tsconfig.build.json && npm prune --omit=dev --no-audit --no-fund

FROM node:24.22.1-alpine3.24@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53
ENV NODE_ENV=production \
    GEMELO_CONTRATOS=/app/contratos \
    GEMELO_MIGRACIONES=/app/migraciones
WORKDIR /app
COPY --from=construye /app/node_modules ./node_modules
COPY --from=construye /app/dist ./dist
COPY apps/api/package.json ./
COPY apps/api/migraciones ./migraciones
COPY contratos/haza.schema.json contratos/olivos-haza.schema.json contratos/tiempo.schema.json contratos/config.schema.json ./contratos/
# los puntos de montaje de los volúmenes de escritura (medios V7, configuración publicada V10), del usuario node (uid 1000): un volumen nuevo hereda su dueño
RUN mkdir -p /datos/medios /datos/config /datos/hornero && chown node:node /datos/medios /datos/config /datos/hornero
USER node
EXPOSE 8000
CMD ["node", "dist/src/principal.js"]
