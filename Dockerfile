# Étape 1 : Build Frontend React + Vite + Tailwind CSS
FROM node:22-alpine3.21 AS frontend-builder
WORKDIR /app

COPY package*.json ./
RUN npm install --no-audit --no-fund

COPY index.html postcss.config.js tailwind.config.js tsconfig.json vite.config.ts ./
COPY docker-compose.yml Dockerfile deploy-linux.sh Cargo.toml metadata.json ./
COPY public ./public
COPY src ./src
COPY src-rust ./src-rust
ARG VITE_DEMO_MODE=true
ENV VITE_DEMO_MODE=${VITE_DEMO_MODE}
RUN npm run build

# Étape 2 : Build Backend Rust + Axum + Tokio
FROM rust:1.88-alpine3.21 AS rust-builder
WORKDIR /app

RUN apk add --no-cache musl-dev
COPY Cargo.toml Cargo.lock ./
COPY contracts ./contracts
COPY src-rust ./src-rust
RUN cargo build --release --locked

# Étape 3 : Image de production Linux minimale et durcie (Alpine 3.21)
FROM alpine:3.21 AS runtime
WORKDIR /app

RUN apk add --no-cache ca-certificates curl tzdata \
    && addgroup -S cfitness \
    && adduser -S -D -H -G cfitness cfitness \
    && mkdir -p /var/lib/cfitness /var/backups/cfitness-os /var/inbody-lb120-drop /app/dist \
    && chown -R cfitness:cfitness /var/lib/cfitness /var/backups/cfitness-os /var/inbody-lb120-drop /app

COPY --from=frontend-builder /app/dist /app/dist
COPY --from=rust-builder /app/target/release/cfitness-os /usr/local/bin/cfitness-os

USER cfitness

ENV TZ=Europe/Paris
ENV CFITNESS_BIND_ADDR=0.0.0.0:8080
ENV CFITNESS_DATA_DIR=/var/lib/cfitness
ENV CFITNESS_FRONTEND_DIR=/app/dist
ENV BACKUP_REPLICA_DIR=/var/backups/cfitness-os
ENV INBODY_LB120_CSV_DROP_DIR=/var/inbody-lb120-drop
ENV RUST_LOG=info,cfitness_os=debug

EXPOSE 8080
VOLUME ["/var/lib/cfitness", "/var/backups/cfitness-os"]

CMD ["cfitness-os"]
