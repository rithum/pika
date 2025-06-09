# Build stage
FROM node:22-alpine AS builder

USER root
RUN corepack enable
RUN mkdir -p /app && chown -R node:node /app

USER node:node
WORKDIR /app

COPY --chown=node:node build/ ./
RUN --mount=type=cache,id=pnpm,target=/home/node/.pnpm-store \
    rm -rf node_modules && pnpm install --frozen-lockfile --prefer-offline --prod

# Final stage with minimal image
FROM alpine:3.21

# Install only Node.js runtime (not npm)
RUN apk add --no-cache nodejs

# Create app directory and non-root user
RUN addgroup -S node && adduser -S node -G node
RUN mkdir -p /app && chown -R node:node /app

USER node
WORKDIR /app

# Copy only the node_modules and app files
COPY --from=builder --chown=node:node /app .

ENV PORT=3000
EXPOSE ${PORT}
ENV BODYSIZELIMIT=Infinity

CMD ["node", "apps/pika-chat/index.js"]