export interface Subscription {
  id: string;
  workspace_id: string;
  stripe_customer_id: string;
  stripe_subscription_id?: string;
  tier: 'free' | 'starter' | 'business' | 'enterprise';
  status: 'trialing' | 'active' | 'past_due' | 'canceled';
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
}

export interface Invoice {
  id: string;
  workspace_id: string;
  stripe_invoice_id: string;
  amount_paid: number; // in cents
  currency: string;
  status: 'paid' | 'open' | 'void' | 'uncollectible';
  invoice_pdf_url?: string;
  paid_at: string;
}

export interface QuotaItem {
  current: number;
  max: number;
}

export interface BillingUsage {
  users: QuotaItem;
  projects: QuotaItem;
  storage_gb: QuotaItem;
  /** Real LLM tokens consumed this month (from ai_token_usages), replacing the
   *  old estimated `ai_queries` counter. Optional so a shape change degrades
   *  instead of crashing the dashboard. */
  ai_tokens?: QuotaItem;
}

export interface WorkspaceTenantInfo {
  ID: string;
  Slug: string;
  Name: string;
  Industry: string;
  Tier: 'free' | 'starter' | 'business' | 'enterprise';
  Status: string;
}

export interface BillingStatusResponse {
  workspace: WorkspaceTenantInfo;
  subscription: Subscription;
  invoices: Invoice[];
  usage: BillingUsage;
}

export interface CheckoutSessionResponse {
  session_id: string;
  url: string;
  amount: number;
  currency: string;
  tier: string;
}
