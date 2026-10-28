FROM node:24-alpine

WORKDIR /app
COPY package.json server.js ./
COPY index.html app.js styles.css ./
RUN mkdir -p /app/data && chown -R node:node /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV DATABASE_PATH=/app/data/stockpilot.sqlite

USER node
EXPOSE 3000
CMD ["node", "server.js"]
