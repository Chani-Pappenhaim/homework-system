FROM node:22-alpine AS builder
# --- NETFREE CERT INSTALL (רשת עם SSL inspection) — מתקין את תעודת ה-root של
# נטפרי כך ש-prisma/npm יעברו אימות TLS תקין במקום NODE_TLS_REJECT_UNAUTHORIZED=0 ---
ADD https://netfree.link/cacert/united/x2/unix.sh /tmp/netfree-ca.sh
RUN sh /tmp/netfree-ca.sh
ENV NODE_EXTRA_CA_CERTS=/etc/ca-bundle.crt SSL_CERT_FILE=/etc/ca-bundle.crt
# --- END NETFREE CERT INSTALL ---
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Prisma's engine downloader doesn't honour NODE_EXTRA_CA_CERTS, so the CA
# install above isn't enough for binaries.prisma.sh behind Netfree's SSL
# inspection. Scoped to this one command — not a persistent ENV.
RUN NODE_TLS_REJECT_UNAUTHORIZED=0 npx prisma generate
RUN npx tsc

FROM node:22-alpine
# --- NETFREE CERT INSTALL ---
ADD https://netfree.link/cacert/united/x2/unix.sh /tmp/netfree-ca.sh
RUN sh /tmp/netfree-ca.sh
ENV NODE_EXTRA_CA_CERTS=/etc/ca-bundle.crt SSL_CERT_FILE=/etc/ca-bundle.crt
# --- END NETFREE CERT INSTALL ---
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
# `migrate deploy` runs on every api boot and needs the schema-engine binary.
# `npm ci` doesn't fetch it, so without this the container would try to download
# it at startup — which fails behind Netfree's SSL inspection. Take the copy the
# builder already downloaded.
COPY --from=builder /root/.cache/prisma /root/.cache/prisma
COPY --from=builder /app/node_modules/@prisma/engines ./node_modules/@prisma/engines
COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh
EXPOSE 4000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/src/entrypoints/combined.js"]
