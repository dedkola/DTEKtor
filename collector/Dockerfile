FROM mcr.microsoft.com/playwright:v1.64.0-noble
WORKDIR /app
COPY collector/package*.json ./collector/
RUN cd collector && npm ci --omit=dev
COPY collector/ ./collector/
COPY config/ ./config/
ENV SHOTS_DIR=/app/shots
RUN mkdir -p /app/shots
CMD ["node", "collector/worker.mjs"]
