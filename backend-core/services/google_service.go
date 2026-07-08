package services

import (
	"context"
	"fmt"
	"log"
	"time"

	"golang.org/x/oauth2"
	calendar "google.golang.org/api/calendar/v3"
	drive "google.golang.org/api/drive/v3"
	"google.golang.org/api/option"
	"google.golang.org/api/sheets/v4"
)

// Config represents standard oauth config (ideally retrieved from env in production)
func GetClient(accessToken string, refreshToken string, expiry time.Time) *oauth2.Token {
	return &oauth2.Token{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		Expiry:       expiry,
		TokenType:    "Bearer",
	}
}

// CreateDriveFolder creates a new folder in Google Drive and returns its ID and WebViewLink
func CreateDriveFolder(ctx context.Context, token *oauth2.Token, folderName string) (string, string, error) {
	// We should initialize a config to generate an HTTP client
	// For simplicity, we create a token source directly.
	config := &oauth2.Config{}
	client := config.Client(ctx, token)

	srv, err := drive.NewService(ctx, option.WithHTTPClient(client))
	if err != nil {
		return "", "", fmt.Errorf("unable to retrieve Drive client: %v", err)
	}

	folder := &drive.File{
		Name:     folderName,
		MimeType: "application/vnd.google-apps.folder",
	}

	createdFolder, err := srv.Files.Create(folder).Fields("id", "webViewLink").Do()
	if err != nil {
		return "", "", fmt.Errorf("unable to create folder: %v", err)
	}

	// Make the folder accessible (e.g. anyone with link can view)
	// For corporate, this might be restricted to domain or specific emails
	permission := &drive.Permission{
		Type: "anyone",
		Role: "reader",
	}
	_, err = srv.Permissions.Create(createdFolder.Id, permission).Do()
	if err != nil {
		log.Printf("Warning: failed to set folder permissions: %v", err)
	}

	return createdFolder.Id, createdFolder.WebViewLink, nil
}

// CreateCalendarEvent creates an event for a sprint
func CreateCalendarEvent(ctx context.Context, token *oauth2.Token, summary string, description string, start string, end string) (string, string, error) {
	config := &oauth2.Config{}
	client := config.Client(ctx, token)

	srv, err := calendar.NewService(ctx, option.WithHTTPClient(client))
	if err != nil {
		return "", "", fmt.Errorf("unable to retrieve Calendar client: %v", err)
	}

	event := &calendar.Event{
		Summary:     summary,
		Description: description,
		Start: &calendar.EventDateTime{
			DateTime: start, // e.g. "2023-10-15T09:00:00-07:00"
			TimeZone: "UTC",
		},
		End: &calendar.EventDateTime{
			DateTime: end,
			TimeZone: "UTC",
		},
	}

	calendarId := "primary"
	createdEvent, err := srv.Events.Insert(calendarId, event).Do()
	if err != nil {
		return "", "", fmt.Errorf("unable to create event: %v", err)
	}

	return createdEvent.Id, createdEvent.HtmlLink, nil
}

// AppendToSheet appends a row of data to a Google Sheet
func AppendToSheet(ctx context.Context, token *oauth2.Token, spreadsheetId string, rangeName string, values []interface{}) error {
	config := &oauth2.Config{}
	client := config.Client(ctx, token)

	srv, err := sheets.NewService(ctx, option.WithHTTPClient(client))
	if err != nil {
		return fmt.Errorf("unable to retrieve Sheets client: %v", err)
	}

	valueRange := &sheets.ValueRange{
		Values: [][]interface{}{values},
	}

	_, err = srv.Spreadsheets.Values.Append(spreadsheetId, rangeName, valueRange).
		ValueInputOption("USER_ENTERED").
		InsertDataOption("INSERT_ROWS").
		Context(ctx).
		Do()

	if err != nil {
		return fmt.Errorf("unable to append data to sheet: %v", err)
	}

	return nil
}

// CreateSpreadsheet creates a new Google Spreadsheet and returns its ID and URL
func CreateSpreadsheet(ctx context.Context, token *oauth2.Token, title string) (string, string, error) {
	config := &oauth2.Config{}
	client := config.Client(ctx, token)

	srv, err := sheets.NewService(ctx, option.WithHTTPClient(client))
	if err != nil {
		return "", "", fmt.Errorf("unable to retrieve Sheets client: %v", err)
	}

	spreadsheet := &sheets.Spreadsheet{
		Properties: &sheets.SpreadsheetProperties{
			Title: title,
		},
	}

	created, err := srv.Spreadsheets.Create(spreadsheet).Context(ctx).Do()
	if err != nil {
		return "", "", fmt.Errorf("unable to create spreadsheet: %v", err)
	}

	return created.SpreadsheetId, created.SpreadsheetUrl, nil
}
