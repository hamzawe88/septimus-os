package events

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/google/uuid"
	"github.com/nats-io/nats.go"
)

var NatsConn *nats.Conn
var JetStream nats.JetStreamContext

func ConnectNATS() {
	natsURL := os.Getenv("NATS_URL")
	if natsURL == "" {
		natsURL = "nats://localhost:4222"
	}

	// Connect to NATS Server
	nc, err := nats.Connect(natsURL, nats.Timeout(10*time.Second))
	if err != nil {
		log.Fatal("Error connecting to NATS: ", err)
	}

	NatsConn = nc
	log.Println("Connected to NATS successfully")

	// Initialize JetStream
	js, err := nc.JetStream()
	if err != nil {
		log.Fatal("Error initializing JetStream: ", err)
	}

	JetStream = js

	// Create streams if they do not exist.
	// "events.>" matches any depth (events.messages.created has 3 tokens);
	// the old "events.*" only matched 2-token subjects, so every publish
	// to events.messages.created / events.tasks.updated timed out.
	createStream("COMPANY_OS_EVENTS", "events.>")
}

func createStream(streamName, subject string) {
	stream, err := JetStream.StreamInfo(streamName)
	if err != nil {
		// Stream doesn't exist, create it
		_, err = JetStream.AddStream(&nats.StreamConfig{
			Name:     streamName,
			Subjects: []string{subject},
		})
		if err != nil {
			log.Printf("Error creating stream %s: %v", streamName, err)
		} else {
			log.Printf("Stream %s created successfully", streamName)
		}
	} else if len(stream.Config.Subjects) != 1 || stream.Config.Subjects[0] != subject {
		// Stream exists with stale subjects (e.g. "events.*" from an older
		// build) — update it in place so publishes stop timing out.
		cfg := stream.Config
		cfg.Subjects = []string{subject}
		if _, err := JetStream.UpdateStream(&cfg); err != nil {
			log.Printf("Error updating stream %s subjects: %v", streamName, err)
		} else {
			log.Printf("Stream %s subjects updated to %s", streamName, subject)
		}
	} else {
		log.Printf("Stream %s already exists", stream.Config.Name)
	}
}

// PublishEvent publishes a message to NATS JetStream
func PublishEvent(subject string, data []byte) error {
	if JetStream == nil {
		return fmt.Errorf("NATS JetStream is not initialized")
	}
	_, err := JetStream.Publish(subject, data)
	if err != nil {
		log.Printf("Failed to publish event to %s: %v", subject, err)
		return err
	}
	return nil
}

// PublishTenantEvent publishes an event stamped with the workspace it belongs
// to, and refuses to publish one that isn't.
//
// Consumers on the AI side read workspace_id off the payload and, when it was
// missing, used to fall back to "the oldest workspace in the database". Thirteen
// of the twenty-two publish sites — task creation, message creation, entity
// create/update, subtasks, workflow triggers — sent no workspace_id at all, so
// every tenant's events were processed into the first customer's workspace:
// their embeddings, their memory, their agents. Nothing errored, because
// guessing a tenant is indistinguishable from knowing one.
//
// The workspace id is stamped here rather than in each payload literal so that
// a publisher cannot forget it: passing uuid.Nil is a hard error, not a default.
func PublishTenantEvent(subject string, workspaceID uuid.UUID, payload map[string]interface{}) error {
	if workspaceID == uuid.Nil {
		return fmt.Errorf("refusing to publish %s without a workspace id", subject)
	}
	if payload == nil {
		payload = map[string]interface{}{}
	}
	// Authoritative: the caller's own workspace_id key, if any, is overwritten.
	payload["workspace_id"] = workspaceID.String()

	data, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal %s payload: %w", subject, err)
	}
	return PublishEvent(subject, data)
}

// RequestEvent sends a message over core NATS and waits for a reply
func RequestEvent(subject string, data []byte, timeout time.Duration) ([]byte, error) {
	if NatsConn == nil {
		return nil, fmt.Errorf("NATS connection is not initialized")
	}
	msg, err := NatsConn.Request(subject, data, timeout)
	if err != nil {
		log.Printf("Failed to request event on %s: %v", subject, err)
		return nil, err
	}
	return msg.Data, nil
}
