# Image unique : construit l'interface (Vite) puis la sert depuis le serveur Node/Express.
FROM node:22-alpine AS web
WORKDIR /web
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY backend/package.json backend/package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund
COPY backend/src ./src
COPY backend/migrations ./migrations
COPY backend/scripts ./scripts
COPY --from=web /web/dist ./public
USER node
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s --retries=5 CMD wget -qO- http://127.0.0.1:3001/api/health || exit 1
CMD ["node", "src/index.js"]
