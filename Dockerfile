# Multi-arch friendly minimal Node image
FROM node:20-alpine

# App directories
ENV APP_DIR=/app \
    DATA_DIR=/data \
    LOG_DIR=/logs \
    PORT=3000 \
    HOST=0.0.0.0

WORKDIR ${APP_DIR}

# Copy app (no dependencies required for this project)
COPY index.html app.js style.css server.js package.json ./

# Create mount points for data and logs
RUN mkdir -p ${DATA_DIR} ${LOG_DIR} \
    && addgroup -S app && adduser -S app -G app \
    && chown -R app:app ${APP_DIR} ${DATA_DIR} ${LOG_DIR}

USER app

EXPOSE ${PORT}

# Healthcheck: simple HTTP GET to root
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/ >/dev/null || exit 1

CMD ["node", "server.js"]

