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
RUN npx prisma generate
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
COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh
EXPOSE 4000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/src/entrypoints/combined.js"]
