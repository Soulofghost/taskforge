FROM node:22-alpine

WORKDIR /app

COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev

COPY backend/ ./backend/
COPY frontend/ ./frontend/

EXPOSE 8004

ENV PORT=8004 \
    NODE_ENV=production

CMD ["node", "backend/src/server.js"]
