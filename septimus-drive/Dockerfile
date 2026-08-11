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
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/septimus-drive .

FROM alpine:3.22
RUN addgroup -S septimus && adduser -S -G septimus septimus
WORKDIR /app
COPY --from=builder /out/septimus-drive /app/septimus-drive

USER septimus

EXPOSE 4001
CMD ["./septimus-drive"]
