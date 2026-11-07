FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 DATA_DIR=/data
COPY package.json ./
COPY server ./server
COPY hub ./hub
COPY shared ./shared
COPY games ./games
COPY vendor ./vendor
# Scores live in /data; mount a volume there so they survive container rebuilds.
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/api/games >/dev/null || exit 1
CMD ["node", "server/serve.cjs"]
