package main

import (
	"context"
	"log"
	"os"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
)

var (
	minioClient *minio.Client
	js          jetstream.JetStream
)

func main() {
	// 1. Initialize NATS JetStream
	natsURL := os.Getenv("NATS_URL")
	if natsURL == "" {
		natsURL = "nats://localhost:4222"
	}
	nc, err := nats.Connect(natsURL)
	if err != nil {
		log.Fatalf("Failed to connect to NATS: %v", err)
	}
	defer nc.Close()

	js, err = jetstream.New(nc)
	if err != nil {
		log.Fatalf("Failed to create JetStream context: %v", err)
	}

	// 2. Initialize MinIO Client
	endpoint := os.Getenv("MINIO_ENDPOINT")
	if endpoint == "" {
		endpoint = "localhost:9000"
	}
	accessKey := os.Getenv("MINIO_ACCESS_KEY")
	if accessKey == "" {
		log.Fatal("MINIO_ACCESS_KEY is not configured")
	}
	secretKey := os.Getenv("MINIO_SECRET_KEY")
	if secretKey == "" {
		log.Fatal("MINIO_SECRET_KEY is not configured")
	}
	useSSL := os.Getenv("MINIO_USE_SSL") == "true"

	minioClient, err = minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: useSSL,
	})
	if err != nil {
		log.Fatalf("Failed to initialize MinIO client: %v", err)
	}

	// Ensure bucket exists
	bucketName := "septimus-drive"
	for attempt := 1; attempt <= 30; attempt++ {
		err = minioClient.MakeBucket(context.Background(), bucketName, minio.MakeBucketOptions{})
		if err == nil {
			log.Printf("Successfully created %s\n", bucketName)
			break
		}
		exists, errBucketExists := minioClient.BucketExists(context.Background(), bucketName)
		if errBucketExists == nil && exists {
			log.Printf("Bucket %s already exists\n", bucketName)
			break
		}
		if attempt == 30 {
			log.Fatalf("Failed to create bucket after retries: %v", err)
		}
		log.Printf("Waiting for MinIO (attempt %d/30): %v", attempt, err)
		time.Sleep(2 * time.Second)
	}

	// 3. Initialize Fiber App
	app := fiber.New(fiber.Config{
		BodyLimit: 500 * 1024 * 1024, // 500MB limit for uploads
	})
	app.Use(logger.New())

	// Enable CORS for frontend connection
	allowOrigins := os.Getenv("CORS_ALLOW_ORIGINS")
	if allowOrigins == "" {
		allowOrigins = "http://localhost:3000"
	}
	app.Use(cors.New(cors.Config{
		AllowOrigins:     allowOrigins,
		AllowCredentials: true,
		AllowHeaders:     "Origin, Content-Type, Accept, Authorization, X-Internal-Token",
		AllowMethods:     "GET, POST, HEAD, PUT, DELETE, PATCH, OPTIONS",
	}))

	app.Get("/health", func(c *fiber.Ctx) error {
		if !scannerHealthy() {
			return c.Status(fiber.StatusServiceUnavailable).SendString("malware scanner is unavailable")
		}
		return c.SendString("Septimus Drive is running")
	})

	api := app.Group("/api/v1/drive")
	api.Post("/upload", JWTAuthMiddleware(), UploadHandler)
	api.Get("/files/:id/download", JWTAuthMiddleware(), DownloadHandler)
	api.Get("/internal/files/:id/content", InternalAuthMiddleware(), InternalDownloadHandler)
	api.Patch("/internal/files/:id", InternalAuthMiddleware(), InternalUpdateHandler)

	log.Println("Septimus Drive Service starting on port 4001...")
	log.Fatal(app.Listen(":4001"))
}
