FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
COPY apps/backend/package*.json apps/backend/
COPY apps/frontend/package*.json apps/frontend/
RUN npm ci

COPY apps/backend ./apps/backend
RUN npm --workspace apps/backend run build

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

CMD ["node", "apps/backend/dist/server.js"]
