export const CRM_STAGES = [
  "new",
  "contacted",
  "qualified",
  "proposal",
  "negotiation",
  "closed_won",
  "closed_lost",
] as const;

export type CRMStage = (typeof CRM_STAGES)[number];

const LEGACY_STAGE_ALIASES: Record<string, CRMStage> = {
  quote_sent: "proposal",
  won: "closed_won",
  lost: "closed_lost",
  closing: "negotiation",
};

export function normalizeCRMStage(value: unknown): CRMStage {
  const raw = String(value || "new").trim().toLowerCase();
  if ((CRM_STAGES as readonly string[]).includes(raw)) {
    return raw as CRMStage;
  }
  return LEGACY_STAGE_ALIASES[raw] || "new";
}

export function isClosedCRMStage(stage: CRMStage): boolean {
  return stage === "closed_won" || stage === "closed_lost";
}

export const CRM_STAGE_LABEL_KEYS: Record<CRMStage, string> = {
  new: "crm.columnNew",
  contacted: "crm.columnContacted",
  qualified: "crm.columnQualified",
  proposal: "crm.columnProposal",
  negotiation: "crm.columnNegotiation",
  closed_won: "crm.columnClosedWon",
  closed_lost: "crm.columnClosedLost",
};

export interface CRMLeadEntity {
  id: string;
  created_at?: string;
  data?: {
    company?: string;
    name?: string;
    contact_person?: string;
    status?: string;
    stage?: string;
    value?: number | string;
  };
}
