FROM node:22-alpine AS builder
# --- NETFREE CERT INSTALL (רשת עם SSL inspection) — מתקין את תעודות ה-root של
# נטפרי כך ש-prisma/npm/fetch יעברו אימות TLS תקין במקום NODE_TLS_REJECT_UNAUTHORIZED=0 ---
# The certs are committed under certs/netfree rather than downloaded, because
# the /cacert/united/x2/ script installs only the "X2" root family, and this
# network's chain (NetFree Node Intermediate CA, 019 Telzar) is signed by the
# non-X2 "NetFree Root CA 1990-2200 RSA". Calls to the Gemini API failed with
# UNABLE_TO_GET_ISSUER_CERT_LOCALLY until both families were trusted. Committing
# them also means the build no longer depends on netfree.link being reachable.
# They are public root certificates — nothing secret. To refresh, see
# certs/netfree/README.md.
RUN apk add --no-cache ca-certificates
COPY certs/netfree/ /usr/local/share/ca-certificates/
RUN update-ca-certificates && ln -sf /etc/ssl/certs/ca-certificates.crt /etc/ca-bundle.crt
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
# --- NETFREE CERT INSTALL (see the builder stage for why these are committed) ---
# This stage is the one that matters at runtime: it is where the worker's
# fetch() call to the Gemini API validates its TLS chain.
RUN apk add --no-cache ca-certificates
COPY certs/netfree/ /usr/local/share/ca-certificates/
RUN update-ca-certificates && ln -sf /etc/ssl/certs/ca-certificates.crt /etc/ca-bundle.crt
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
