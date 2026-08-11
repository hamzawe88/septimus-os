package models

import (
	"time"

	"github.com/google/uuid"
)

// PinnedTaskChecklistItem represents a single item in a pinned task checklist
type PinnedTaskChecklistItem struct {
	ID          string     `json:"id"`
	Text        string     `json:"text"`
	IsCompleted bool       `json:"is_completed"`
	CompletedBy *uuid.UUID `json:"completed_by,omitempty"`
}

// PinnedTaskTimeline represents the progress and deadlines of a task
type PinnedTaskTimeline struct {
	StartDate          *time.Time `json:"start_date,omitempty"`
	DueDate            *time.Time `json:"due_date,omitempty"`
	ProgressPercentage int        `json:"progress_percentage"`
}

// ChannelPinnedTaskPayload is the JSONB Data structure for the channel_pinned_task entity type
type ChannelPinnedTaskPayload struct {
	WorkspaceID       uuid.UUID                 `json:"workspace_id"`
	ChannelID         uuid.UUID                 `json:"channel_id"`
	OriginalMessageID *uuid.UUID                `json:"original_message_id,omitempty"`
	CreatorID         uuid.UUID                 `json:"creator_id"`
	Assignees         []uuid.UUID               `json:"assignees"` // Can be empty
	Title             string                    `json:"title"`
	Description       string                    `json:"description"`
	Timeline          PinnedTaskTimeline        `json:"timeline"`
	Checklist         []PinnedTaskChecklistItem `json:"checklist"`
}
