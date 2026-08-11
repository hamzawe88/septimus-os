package services

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"
)

func TestWorkflowNodesEncryptedRoundtrip(t *testing.T) {
	t.Setenv("SETTINGS_ENC_KEY", "workflow-test-key")
	nodes := []byte(`[{"data":{"actionHeaders":{"Authorization":"Bearer secret"}}}]`)
	stored, err := EncodeWorkflowNodes(nodes)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(stored, []byte("Bearer secret")) {
		t.Fatal("stored workflow nodes leak a header secret")
	}
	if !strings.Contains(string(stored), encryptedWorkflowNodesKey) {
		t.Fatal("stored workflow nodes are not wrapped as encrypted data")
	}
	decoded, err := DecodeWorkflowNodes(stored)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(decoded, nodes) {
		t.Fatalf("roundtrip mismatch: %s", decoded)
	}
}

func TestDecodeWorkflowNodesAcceptsLegacyArray(t *testing.T) {
	legacy := []byte(`[{"id":"legacy"}]`)
	decoded, err := DecodeWorkflowNodes(legacy)
	if err != nil || !bytes.Equal(decoded, legacy) {
		t.Fatalf("legacy decode failed: %s, %v", decoded, err)
	}
}

func TestWorkflowSecretRedactionAndMerge(t *testing.T) {
	original := []byte(`[
		{"id":"node-1","data":{
			"actionUrl":"https://hooks.example/tenant/secret-path",
			"actionHeaders":{"Authorization":"Bearer top-secret","X-Safe":"visible"},
			"label":"Notify"
		}}
	]`)

	redacted, err := RedactWorkflowSecrets(original)
	if err != nil {
		t.Fatal(err)
	}
	text := string(redacted)
	if strings.Contains(text, "top-secret") || strings.Contains(text, "secret-path") {
		t.Fatalf("redacted workflow leaked a secret: %s", text)
	}
	if !strings.Contains(text, WorkflowSecretPlaceholder) || !strings.Contains(text, "visible") {
		t.Fatalf("redaction removed safe data or omitted placeholders: %s", text)
	}

	var edited []map[string]interface{}
	if err := json.Unmarshal(redacted, &edited); err != nil {
		t.Fatal(err)
	}
	edited[0]["data"].(map[string]interface{})["label"] = "Notify safely"
	incoming, _ := json.Marshal(edited)

	merged, err := MergeWorkflowSecretPlaceholders(incoming, original)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(merged), "top-secret") || !strings.Contains(string(merged), "secret-path") {
		t.Fatalf("merge did not restore stored secrets: %s", merged)
	}
	if !strings.Contains(string(merged), "Notify safely") {
		t.Fatalf("merge discarded safe edit: %s", merged)
	}
}

func TestWorkflowSecretMergeMatchesReorderedNodesByID(t *testing.T) {
	original := []byte(`[
		{"id":"a","data":{"token":"secret-a"}},
		{"id":"b","data":{"token":"secret-b"}}
	]`)
	incoming := []byte(`[
		{"id":"b","data":{"token":"__SEPTIMUS_SECRET_REDACTED__"}},
		{"id":"a","data":{"token":"__SEPTIMUS_SECRET_REDACTED__"}}
	]`)
	merged, err := MergeWorkflowSecretPlaceholders(incoming, original)
	if err != nil {
		t.Fatal(err)
	}
	var nodes []map[string]interface{}
	if err := json.Unmarshal(merged, &nodes); err != nil {
		t.Fatal(err)
	}
	if nodes[0]["data"].(map[string]interface{})["token"] != "secret-b" {
		t.Fatalf("node b received the wrong secret: %s", merged)
	}
}
