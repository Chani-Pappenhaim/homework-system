FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN NODE_TLS_REJECT_UNAUTHORIZED=0 npx prisma generate
RUN npx tsc

FROM node:22-alpine
WORKDIR /app
ENV NODE_TLS_REJECT_UNAUTHORIZED=0
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts
EXPOSE 4000
CMD ["node", "dist/src/index.js"]
