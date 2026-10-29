# Imagen del hornero de olivos (ADR-0018, O7f). Contexto de construcción: la raíz del repo (infra/compose.yml y infra/dev/compose.yml:
# context ..), porque necesita el constructor de olivos (apps/web/olivo), los contratos y el hornero. Node 24 LTS fijado por versión y
# digest, el mismo que apps/api/Dockerfile (al cambiar uno, cambia el otro y contratos/publicacion-vps.json).
# Sin puertos: lee el índice de la finca (solo lectura), escribe <salida>/<finca>/olivos/ y su estado en /estado.
FROM node:24.22.1-alpine3.24@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53
ENV NODE_ENV=production \
    GEMELO_HORNERO_DATOS=/datos \
    GEMELO_HORNERO_SALIDA=/salida \
    GEMELO_HORNERO_ESTADO=/estado
WORKDIR /app
# ajv y proper-lockfile del hornero, en /app/node_modules (el hornero resuelve ajv desde /app/package.json)
COPY tuberia/olivos/package.json tuberia/olivos/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
# el constructor de olivos con su three 0.128 (three-gen)
COPY apps/web/olivo/package.json apps/web/olivo/package-lock.json ./apps/web/olivo/
RUN cd apps/web/olivo && npm ci --omit=dev --no-audit --no-fund
COPY apps/web/olivo/*.js ./apps/web/olivo/
COPY apps/web/olivo/texturas ./apps/web/olivo/texturas
COPY contratos/hornero-manifiesto.schema.json contratos/epocas-calendario.json ./contratos/
COPY tuberia/olivos/hornero.mjs tuberia/olivos/servicio.mjs tuberia/olivos/salud.mjs ./tuberia/olivos/
# los puntos de montaje, del usuario node (uid 1000): un volumen nuevo hereda su dueño
RUN mkdir -p /estado /salida /datos && chown node:node /estado /salida
USER node
CMD ["node", "tuberia/olivos/servicio.mjs"]
