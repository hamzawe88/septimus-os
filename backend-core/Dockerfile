FROM golang:1.26.5-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN for attempt in 1 2 3 4 5; do \
      go mod download && exit 0; \
      echo "go mod download attempt ${attempt} failed; retrying" >&2; \
      sleep 5; \
    done; \
    exit 1

COPY . .

RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/backend-core .

FROM alpine:3.22

RUN addgroup -S -g 10001 septimus \
    && adduser -S -D -H -u 10001 -G septimus septimus \
    && mkdir -p /shared/uploads \
    && chown -R septimus:septimus /shared
WORKDIR /app
COPY --from=builder /out/backend-core /app/backend-core

USER septimus

# Expose port
EXPOSE 4000

CMD ["./backend-core"]
