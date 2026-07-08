FROM golang:alpine

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN rm -f .env

# Build the Go app
RUN go build -o main .

# Expose port
EXPOSE 4000

CMD ["./main"]
