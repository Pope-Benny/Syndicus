FROM node:22-alpine AS base

WORKDIR /app

FROM base AS deps
RUN corepack enable
COPY package.json package-lock.json ./
RUN npm install --omit=dev

FROM base AS builder
RUN corepack enable
COPY package.json package-lock.json ./
COPY . .
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production

RUN apk add --no-cache tini

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

EXPOSE 3000
ENTRYPOINT ["tini", "--"]
CMD ["node", "dist/server/server.js"]