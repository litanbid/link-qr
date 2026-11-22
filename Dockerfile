FROM node:26.13.1-trixie-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY bin/ ./bin/
COPY src/ ./src/
COPY public/ ./public/
USER node
EXPOSE 3000
CMD ["node", "bin/link-qr.js", "serve"]
