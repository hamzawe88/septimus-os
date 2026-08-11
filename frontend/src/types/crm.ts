/**
 * CRM shared types.
 *
 * `LeadEntity`/`LeadData` used to live inside the legacy `plugins/CRMLeadsView`
 * component, which meant a live component (AddQuoteModal, rendered by
 * LeadsKanban) had to import from a dead view just to get a type — keeping ~580
 * lines of unreachable legacy UI alive in the bundle graph. The shapes belong
 * here so the legacy view can be removed.
 *
 * Note: these describe the LEGACY free-form entity envelope (`{id, data:{...}}`)
 * still accepted by the quote modal. New CRM work uses the typed `/crm/*` API
 * (accounts, opportunities, quotes) backed by the schema registry.
 */

export interface LeadData {
  company?: string;
  email?: string;
  status?: string;
  value?: string | number;
  contact_person?: string;
  phone?: string;
  [key: string]: unknown;
}

export interface LeadEntity {
  id: string;
  created_at: string;
  data: LeadData;
}
