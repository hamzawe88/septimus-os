package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// odooRPC performs a single JSON-RPC 2.0 call against {serverURL}/jsonrpc.
func odooRPC(client *http.Client, serverURL, service, method string, args []interface{}) (json.RawMessage, error) {
	payload := map[string]interface{}{
		"jsonrpc": "2.0",
		"method":  "call",
		"params": map[string]interface{}{
			"service": service,
			"method":  method,
			"args":    args,
		},
		"id": time.Now().UnixNano(),
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to encode RPC payload: %w", err)
	}

	req, err := http.NewRequest("POST", strings.TrimSuffix(serverURL, "/")+"/jsonrpc", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("failed to build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to reach Odoo server: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	var rpcResp struct {
		Result json.RawMessage `json:"result"`
		Error  *struct {
			Message string `json:"message"`
			Data    struct {
				Message string `json:"message"`
			} `json:"data"`
		} `json:"error"`
	}
	if err := json.Unmarshal(respBody, &rpcResp); err != nil {
		return nil, fmt.Errorf("Odoo returned a non-JSON-RPC response (status %d)", resp.StatusCode)
	}
	if rpcResp.Error != nil {
		msg := rpcResp.Error.Data.Message
		if msg == "" {
			msg = rpcResp.Error.Message
		}
		return nil, fmt.Errorf("Odoo error: %s", msg)
	}
	return rpcResp.Result, nil
}

// PushOdooSettlement authenticates against the workspace's connected Odoo
// instance and creates a draft journal entry (account.move) carrying the
// settlement reference and details. Returns the created record id.
func PushOdooSettlement(serverURL, database, username, apiKey, reference, narration string) (int64, error) {
	if serverURL == "" || database == "" || username == "" || apiKey == "" {
		return 0, fmt.Errorf("Odoo integration is not fully configured (missing server URL, database, username, or API key)")
	}
	if reference == "" {
		return 0, fmt.Errorf("settlement reference is required")
	}

	client := &http.Client{Timeout: 15 * time.Second}

	// 1. Authenticate → numeric uid
	authResult, err := odooRPC(client, serverURL, "common", "authenticate",
		[]interface{}{database, username, apiKey, map[string]interface{}{}})
	if err != nil {
		return 0, err
	}
	var uid int64
	if err := json.Unmarshal(authResult, &uid); err != nil || uid == 0 {
		return 0, fmt.Errorf("Odoo authentication failed (check database, username, and API key)")
	}

	// 2. Create a draft journal entry carrying the settlement details
	createResult, err := odooRPC(client, serverURL, "object", "execute_kw",
		[]interface{}{database, uid, apiKey, "account.move", "create",
			[]interface{}{map[string]interface{}{
				"move_type": "entry",
				"ref":       reference,
				"narration": narration,
			}},
		})
	if err != nil {
		return 0, err
	}
	var recordID int64
	if err := json.Unmarshal(createResult, &recordID); err != nil {
		return 0, fmt.Errorf("failed to parse Odoo create response: %w", err)
	}
	return recordID, nil
}
