FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY server.js auth.js ./

USER node

EXPOSE 1234

CMD ["node", "server.js"]
