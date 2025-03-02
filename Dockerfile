FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./
COPY src/ ./src/
COPY global.d.ts ./

RUN npm install
RUN npm run build

FROM node:20-alpine AS release

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

ENV NODE_ENV=production

# Runtime environment variables should be passed when running the container
# Example: docker run -e OPENAI_API_KEY=xxx -e QDRANT_API_KEY=xxx ...
# Install only production dependencies and skip prepare script which tries to run build
RUN npm ci --omit=dev --ignore-scripts

CMD ["node", "dist/index.js"]
