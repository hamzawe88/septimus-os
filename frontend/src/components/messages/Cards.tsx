import { EntityData } from "@/types";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── EntityCard ─────────────────────────────────────────────────────────────

interface EntityCardProps {
  entityType: string;
  entityId: string;
  data: EntityData;
}

export function EntityCard({ entityType, entityId, data }: EntityCardProps) {
  const formattedJson = JSON.stringify(data, null, 2);

  return (
    <div className="entity-card">
      <div className="entity-card-header">
        <div className="entity-card-title">
          <span className="entity-card-pulse" aria-hidden>
            <span className="entity-card-pulse-ring" />
            <span className="entity-card-pulse-dot" />
          </span>
          New Entity: {entityType}
        </div>
        <span className="entity-card-id" aria-label={`Entity ID: ${entityId}`}>
          ID: {entityId}
        </span>
      </div>
      <div className="entity-card-body">
        <pre className="entity-card-json" aria-label="Entity JSON data">
          {formattedJson}
        </pre>
      </div>
    </div>
  );
}

// ─── AIProposalCard ──────────────────────────────────────────────────────────

interface AIProposalCardProps {
  title: string;
  description: string;
  onApprove?: () => void;
  onDismiss?: () => void;
}

export function AIProposalCard({
  title,
  description,
  onApprove,
  onDismiss,
}: AIProposalCardProps) {
  return (
    <div className="ai-proposal-card">
      <div className="ai-proposal-header">
        <svg
          className="ai-proposal-icon"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
        </svg>
        <h3 className="ai-proposal-title">{title}</h3>
      </div>
      <div className="ai-proposal-body">
        <p className="ai-proposal-description">{description}</p>
        <div className="ai-proposal-actions" role="group" aria-label="Proposal actions">
          <Button
            size="sm"
            className="ai-proposal-approve"
            onClick={onApprove}
            aria-label="Approve this AI proposal"
          >
            <CheckCircle2 className="w-4 h-4" aria-hidden />
            Approve Action
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="ai-proposal-dismiss"
            onClick={onDismiss}
            aria-label="Dismiss this AI proposal"
          >
            <XCircle className="w-4 h-4" aria-hidden />
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  );
}
