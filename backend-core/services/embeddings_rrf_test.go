package services

import (
	"testing"

	"github.com/google/uuid"
	"github.com/septimus-os/backend-core/models"
)

func doc(id uuid.UUID, content string) models.DocumentEmbedding {
	return models.DocumentEmbedding{EntityID: id, Content: content}
}

func TestReciprocalRankFusion(t *testing.T) {
	idA, idB, idC := uuid.New(), uuid.New(), uuid.New()

	dense := []models.DocumentEmbedding{doc(idA, "A"), doc(idB, "B"), doc(idC, "C")}
	lexical := []models.DocumentEmbedding{doc(idC, "C"), doc(idA, "A")}

	// A is ranked highly by both arms → should fuse to the top.
	// C appears in both too (rank3 dense, rank1 lexical) → second.
	// B appears once (rank2 dense) → last.
	fused := reciprocalRankFusion(10, dense, lexical)
	if len(fused) != 3 {
		t.Fatalf("expected 3 fused docs, got %d", len(fused))
	}
	gotOrder := []uuid.UUID{fused[0].EntityID, fused[1].EntityID, fused[2].EntityID}
	want := []uuid.UUID{idA, idC, idB}
	for i := range want {
		if gotOrder[i] != want[i] {
			t.Errorf("fused[%d] = %v, want %v", i, gotOrder[i], want[i])
		}
	}
}

func TestReciprocalRankFusionDedupsAndCaps(t *testing.T) {
	idA, idB := uuid.New(), uuid.New()
	dense := []models.DocumentEmbedding{doc(idA, "A"), doc(idB, "B")}
	lexical := []models.DocumentEmbedding{doc(idA, "A")} // duplicate of A

	fused := reciprocalRankFusion(1, dense, lexical)
	if len(fused) != 1 {
		t.Fatalf("limit=1 should cap to 1, got %d", len(fused))
	}
	if fused[0].EntityID != idA {
		t.Errorf("top doc = %v, want %v (A ranked by both arms)", fused[0].EntityID, idA)
	}
}

func TestCapResults(t *testing.T) {
	list := []models.DocumentEmbedding{doc(uuid.New(), "1"), doc(uuid.New(), "2"), doc(uuid.New(), "3")}
	if got := capResults(list, 2); len(got) != 2 {
		t.Errorf("capResults limit 2 => len %d, want 2", len(got))
	}
	if got := capResults(list, 10); len(got) != 3 {
		t.Errorf("capResults limit 10 => len %d, want 3 (no truncation)", len(got))
	}
}
