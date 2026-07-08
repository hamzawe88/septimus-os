package agents

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"github.com/google/generative-ai-go/genai"
	openai "github.com/sashabaranov/go-openai"
	"google.golang.org/api/option"
)

// LLMProvider is the abstract interface for all AI models (OpenAI, Gemini, etc.)
type LLMProvider interface {
	// GenerateStructuredOutput prompts the LLM and parses the JSON response into the provided struct
	GenerateStructuredOutput(ctx context.Context, systemPrompt, userPrompt string, result interface{}) error
}

// -----------------------------------------------------------------------------
// OpenAI Provider
// -----------------------------------------------------------------------------

type OpenAIProvider struct {
	client *openai.Client
	model  string
}

func NewOpenAIProvider(apiKey string, model string) *OpenAIProvider {
	return &OpenAIProvider{
		client: openai.NewClient(apiKey),
		model:  model,
	}
}

func (p *OpenAIProvider) GenerateStructuredOutput(ctx context.Context, systemPrompt, userPrompt string, result interface{}) error {
	req := openai.ChatCompletionRequest{
		Model: p.model,
		Messages: []openai.ChatCompletionMessage{
			{
				Role:    openai.ChatMessageRoleSystem,
				Content: systemPrompt,
			},
			{
				Role:    openai.ChatMessageRoleUser,
				Content: userPrompt,
			},
		},
		ResponseFormat: &openai.ChatCompletionResponseFormat{
			Type: openai.ChatCompletionResponseFormatTypeJSONObject,
		},
	}

	resp, err := p.client.CreateChatCompletion(ctx, req)
	if err != nil {
		return fmt.Errorf("OpenAI API error: %w", err)
	}

	if len(resp.Choices) == 0 {
		return fmt.Errorf("OpenAI API returned empty choices")
	}

	content := resp.Choices[0].Message.Content
	err = json.Unmarshal([]byte(content), result)
	if err != nil {
		return fmt.Errorf("failed to parse OpenAI JSON output: %w. Content: %s", err, content)
	}

	return nil
}

// -----------------------------------------------------------------------------
// Gemini Provider
// -----------------------------------------------------------------------------

type GeminiProvider struct {
	client *genai.Client
	model  string
}

func NewGeminiProvider(ctx context.Context, apiKey string, model string) (*GeminiProvider, error) {
	client, err := genai.NewClient(ctx, option.WithAPIKey(apiKey))
	if err != nil {
		return nil, err
	}
	return &GeminiProvider{
		client: client,
		model:  model,
	}, nil
}

func (p *GeminiProvider) GenerateStructuredOutput(ctx context.Context, systemPrompt, userPrompt string, result interface{}) error {
	model := p.client.GenerativeModel(p.model)
	
	// Enforce JSON output for Gemini
	model.ResponseMIMEType = "application/json"
	
	model.SystemInstruction = &genai.Content{
		Parts: []genai.Part{genai.Text(systemPrompt)},
	}

	resp, err := model.GenerateContent(ctx, genai.Text(userPrompt))
	if err != nil {
		return fmt.Errorf("Gemini API error: %w", err)
	}

	if len(resp.Candidates) == 0 {
		return fmt.Errorf("Gemini API returned empty candidates")
	}

	part := resp.Candidates[0].Content.Parts[0]
	text, ok := part.(genai.Text)
	if !ok {
		return fmt.Errorf("Gemini API returned non-text part")
	}

	err = json.Unmarshal([]byte(text), result)
	if err != nil {
		return fmt.Errorf("failed to parse Gemini JSON output: %w. Content: %s", err, text)
	}

	return nil
}

// -----------------------------------------------------------------------------
// Factory
// -----------------------------------------------------------------------------

func GetProvider(ctx context.Context, providerName, apiKey, model string) (LLMProvider, error) {
	switch providerName {
	case "openai":
		return NewOpenAIProvider(apiKey, model), nil
	case "gemini":
		return NewGeminiProvider(ctx, apiKey, model)
	default:
		// Fallback to OpenAI if not recognized, or return error
		log.Printf("Unknown provider '%s', falling back to OpenAI", providerName)
		return NewOpenAIProvider(apiKey, model), nil
	}
}
