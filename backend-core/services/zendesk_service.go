package services

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// CreateZendeskTicket creates a real ticket in the workspace's connected
// Zendesk instance via the Tickets API (Basic auth: {email}/token:{api_token}).
// Returns the created ticket id.
func CreateZendeskTicket(subdomain, adminEmail, apiToken, subject, description, requesterName, requesterEmail string) (int64, error) {
	if subdomain == "" || adminEmail == "" || apiToken == "" {
		return 0, fmt.Errorf("Zendesk integration is not fully configured (missing subdomain, admin email, or API token)")
	}
	if subject == "" || description == "" {
		return 0, fmt.Errorf("subject and description are required")
	}

	cleanSubdomain := strings.TrimSuffix(strings.TrimPrefix(subdomain, "https://"), ".zendesk.com")
	url := fmt.Sprintf("https://%s.zendesk.com/api/v2/tickets.json", cleanSubdomain)

	ticket := map[string]interface{}{
		"subject": subject,
		"comment": map[string]string{"body": description},
	}
	if requesterEmail != "" {
		ticket["requester"] = map[string]string{
			"name":  requesterName,
			"email": requesterEmail,
		}
	}
	body, err := json.Marshal(map[string]interface{}{"ticket": ticket})
	if err != nil {
		return 0, fmt.Errorf("failed to encode ticket payload: %w", err)
	}

	req, err := http.NewRequest("POST", url, bytes.NewReader(body))
	if err != nil {
		return 0, fmt.Errorf("failed to build request: %w", err)
	}
	auth := base64.StdEncoding.EncodeToString([]byte(adminEmail + "/token:" + apiToken))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Basic "+auth)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return 0, fmt.Errorf("failed to reach Zendesk API: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return 0, fmt.Errorf("Zendesk credentials are invalid (check admin email and API token)")
	}
	if resp.StatusCode >= 300 {
		var parsed struct {
			Error       string `json:"error"`
			Description string `json:"description"`
		}
		if json.Unmarshal(respBody, &parsed) == nil && parsed.Description != "" {
			return 0, fmt.Errorf("Zendesk rejected the ticket: %s", parsed.Description)
		}
		return 0, fmt.Errorf("Zendesk API returned status %d", resp.StatusCode)
	}

	var created struct {
		Ticket struct {
			ID int64 `json:"id"`
		} `json:"ticket"`
	}
	if err := json.Unmarshal(respBody, &created); err != nil {
		return 0, fmt.Errorf("failed to parse Zendesk response: %w", err)
	}
	return created.Ticket.ID, nil
}
