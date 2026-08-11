package services

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/septimus-os/backend-core/models"
	"github.com/septimus-os/backend-core/services/crypto"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

const encryptedWorkflowNodesKey = "_encrypted"
const WorkflowSecretPlaceholder = "__SEPTIMUS_SECRET_REDACTED__"

// EncodeWorkflowNodes encrypts the complete node graph because action URLs,
// headers, webhook secrets, and credentials can all appear inside node data.
func EncodeWorkflowNodes(nodes []byte) (datatypes.JSON, error) {
	encrypted, err := crypto.Encrypt(string(nodes))
	if err != nil {
		return nil, err
	}
	wrapper, err := json.Marshal(map[string]string{encryptedWorkflowNodesKey: encrypted})
	return datatypes.JSON(wrapper), err
}

// DecodeWorkflowNodes accepts legacy plaintext arrays only so the startup
// migration can convert them. New writes are always encrypted.
func DecodeWorkflowNodes(stored []byte) ([]byte, error) {
	var wrapper map[string]json.RawMessage
	if json.Unmarshal(stored, &wrapper) == nil {
		if raw, ok := wrapper[encryptedWorkflowNodesKey]; ok {
			var encrypted string
			if err := json.Unmarshal(raw, &encrypted); err != nil {
				return nil, err
			}
			plain, err := crypto.Decrypt(encrypted)
			return []byte(plain), err
		}
	}
	if !json.Valid(stored) {
		return nil, fmt.Errorf("invalid workflow node JSON")
	}
	return stored, nil
}

func EnsureWorkflowNodesEncrypted(db *gorm.DB) error {
	var workflows []models.Workflow
	if err := db.Find(&workflows).Error; err != nil {
		return err
	}
	for _, workflow := range workflows {
		var wrapper map[string]json.RawMessage
		if json.Unmarshal(workflow.Nodes, &wrapper) == nil {
			if _, encrypted := wrapper[encryptedWorkflowNodesKey]; encrypted {
				continue
			}
		}
		plain, err := DecodeWorkflowNodes(workflow.Nodes)
		if err != nil {
			return fmt.Errorf("decode workflow %s nodes: %w", workflow.ID, err)
		}
		encoded, err := EncodeWorkflowNodes(plain)
		if err != nil {
			return fmt.Errorf("encrypt workflow %s nodes: %w", workflow.ID, err)
		}
		if err := db.Model(&workflow).Update("nodes", encoded).Error; err != nil {
			return fmt.Errorf("save workflow %s encrypted nodes: %w", workflow.ID, err)
		}
	}
	return nil
}

// RedactWorkflowSecrets returns an API-safe copy of a decrypted workflow.
// Managers can edit the graph without passwords, bearer tokens, signing
// secrets, or credential-bearing webhook URLs ever leaving the server.
func RedactWorkflowSecrets(nodes []byte) ([]byte, error) {
	var value interface{}
	if err := json.Unmarshal(nodes, &value); err != nil {
		return nil, err
	}
	redactWorkflowValue(value, "")
	return json.Marshal(value)
}

// MergeWorkflowSecretPlaceholders restores values hidden by
// RedactWorkflowSecrets when an existing graph is saved without replacing its
// credentials. Node arrays are matched by React Flow's stable id, so reordering
// cannot attach a credential to the wrong action.
func MergeWorkflowSecretPlaceholders(incoming, existing []byte) ([]byte, error) {
	var nextValue, oldValue interface{}
	if err := json.Unmarshal(incoming, &nextValue); err != nil {
		return nil, err
	}
	if err := json.Unmarshal(existing, &oldValue); err != nil {
		return nil, err
	}
	return json.Marshal(mergeWorkflowValue(nextValue, oldValue, ""))
}

func redactWorkflowValue(value interface{}, key string) {
	switch typed := value.(type) {
	case map[string]interface{}:
		for childKey, child := range typed {
			if isWorkflowSecretKey(childKey) {
				if text, ok := child.(string); ok && text != "" {
					typed[childKey] = WorkflowSecretPlaceholder
					continue
				}
			}
			redactWorkflowValue(child, childKey)
		}
	case []interface{}:
		for _, child := range typed {
			redactWorkflowValue(child, key)
		}
	}
}

func mergeWorkflowValue(incoming, existing interface{}, key string) interface{} {
	if isWorkflowSecretKey(key) {
		if text, ok := incoming.(string); ok && text == WorkflowSecretPlaceholder {
			return existing
		}
	}

	switch next := incoming.(type) {
	case map[string]interface{}:
		old, _ := existing.(map[string]interface{})
		for childKey, child := range next {
			next[childKey] = mergeWorkflowValue(child, old[childKey], childKey)
		}
		return next
	case []interface{}:
		old, _ := existing.([]interface{})
		oldByID := make(map[string]interface{}, len(old))
		for _, child := range old {
			if object, ok := child.(map[string]interface{}); ok {
				if id, ok := object["id"].(string); ok && id != "" {
					oldByID[id] = child
				}
			}
		}
		for index, child := range next {
			var previous interface{}
			if object, ok := child.(map[string]interface{}); ok {
				if id, ok := object["id"].(string); ok {
					previous = oldByID[id]
				}
			}
			if previous == nil && index < len(old) {
				previous = old[index]
			}
			next[index] = mergeWorkflowValue(child, previous, key)
		}
		return next
	default:
		return incoming
	}
}

func isWorkflowSecretKey(key string) bool {
	normalized := strings.NewReplacer("-", "", "_", "", ".", "").Replace(strings.ToLower(key))
	for _, marker := range []string{
		"password",
		"passwd",
		"secret",
		"token",
		"apikey",
		"authorization",
		"cookie",
		"webhookurl",
		"actionurl",
	} {
		if strings.Contains(normalized, marker) {
			return true
		}
	}
	return false
}
