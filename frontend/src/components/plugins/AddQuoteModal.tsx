import React, { useState } from "react";
import { X, Plus, Trash2, FileText, CheckCircle2, ShieldCheck, ArrowRight, DollarSign } from "lucide-react";
import { fetchWithAuth, API_BASE_URL } from '@/lib/apiClient';
import type { LeadEntity } from "@/types/crm";
import { useLocalization } from "@/contexts/LocalizationContext";

interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

interface AddQuoteModalProps {
  lead: LeadEntity;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddQuoteModal({ lead, onClose, onSuccess }: AddQuoteModalProps) {
  const defaultVal = Number(lead.data?.value || 1000);
  
  const { baseCurrency, secondaryCurrency, formatCurrency, t } = useLocalization();
  const [useSecondaryCurrency, setUseSecondaryCurrency] = useState(false);
	const [conversionKey] = useState(() => {
		if (typeof globalThis.crypto?.randomUUID === "function") {
			return globalThis.crypto.randomUUID();
		}
		return `crm-conversion-${Date.now()}-${Math.random().toString(36).slice(2)}`;
	});

  const [quoteNumber, setQuoteNumber] = useState(() => `QT-${Date.now().toString().slice(-6)}`);
  const [validUntil, setValidUntil] = useState(() => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]);
  const [taxRatePercent, setTaxRatePercent] = useState(15);
  const [items, setItems] = useState<LineItem[]>([
    {
      id: "1",
      description: `Enterprise Solution / Implementation for ${lead.data?.company || "Client"}`,
      quantity: 1,
      unitPrice: isNaN(defaultVal) ? 1000 : defaultVal,
    },
  ]);
  const [notes, setNotes] = useState(() => t("plugins.crm.defaultQuoteTerms"));
  const [loading, setLoading] = useState(false);
  const [bridgeLoading, setBridgeLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Financial calculations
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const taxRate = Math.min(100, Math.max(0, Number(taxRatePercent) || 0)) / 100;
  const taxAmount = subtotal * taxRate;
  const totalAmount = subtotal + taxAmount;

  const handleAddItem = () => {
    setItems([
      ...items,
      {
        id: Date.now().toString(),
        description: "New Service / Item Description",
        quantity: 1,
        unitPrice: 500,
      },
    ]);
  };

  const handleRemoveItem = (id: string) => {
    if (items.length <= 1) return;
    setItems(items.filter((i) => i.id !== id));
  };

  const handleItemChange = (id: string, field: keyof LineItem, val: string | number) => {
    setItems(
      items.map((item) => {
        if (item.id === id) {
          return { ...item, [field]: val };
        }
        return item;
      })
    );
  };

  // Action 1: Save Quote as Draft
  const handleSaveQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      const quoteData = {
		opportunity_id: lead.id,
        company: lead.data?.company || "Unknown Client",
        contact_person: lead.data?.contact_person || "",
        email: lead.data?.email || "",
        quote_number: quoteNumber,
        currency: useSecondaryCurrency ? secondaryCurrency : baseCurrency,
        items,
        subtotal,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        status: "draft",
        valid_until: validUntil,
        notes,
        created_date: new Date().toISOString(),
      };

	  const res = await fetchWithAuth(`${API_BASE_URL}/crm/quotes`, {
        method: "POST",
		body: JSON.stringify(quoteData),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server responded with status ${res.status}`);
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      console.error("Failed to save quotation:", err);
      setErrorMsg(err instanceof Error ? err.message : "Failed to save quotation.");
    } finally {
      setLoading(false);
    }
  };

  // Action 2: Quote-to-Invoice Bridge (Convert to Invoice & Mark Closed Won)
  const handleInvoiceBridge = async () => {
    setBridgeLoading(true);
    setErrorMsg(null);

    try {
      const response = await fetchWithAuth(`${API_BASE_URL}/crm/quotes/convert-to-invoice`, {
        method: "POST",
        headers: {
          "Idempotency-Key": conversionKey,
        },
        body: JSON.stringify({
		  opportunity_id: lead.id,
          quote_number: quoteNumber,
          valid_until: validUntil,
          currency: useSecondaryCurrency ? secondaryCurrency : baseCurrency,
          tax_rate: taxRate,
          items,
          notes,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Quote conversion failed (${response.status})`);
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      console.error("Invoice Bridge failed:", err);
      setErrorMsg(err instanceof Error ? err.message : "Invoice Bridge conversion failed.");
    } finally {
      setBridgeLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-4">
      <div className="bg-card text-foreground w-full max-w-4xl rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-gradient-to-r from-slate-900 to-slate-800 text-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-lg ltr:me-3 rtl:ms-3">
              <FileText className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold">{t("plugins.crm.quoteEngineTitle")}</h2>
              <p className="text-xs text-slate-300">
                {t("plugins.crm.client")} <span className="font-semibold text-white">{lead.data?.company || t("common.unknownCompany")}</span> ({lead.data?.email || t("common.noEmail")})
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close modal"
            onClick={onClose}
            className="p-2 text-white/70 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          
          {errorMsg && (
            <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm flex items-center justify-between">
              <span>⚠️ {errorMsg}</span>
              <button onClick={() => setErrorMsg(null)} className="text-xs underline font-bold">{t("common.dismiss")}</button>
            </div>
          )}

          {/* Quote Meta info */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-muted p-4 rounded-xl border border-border">
            <div>
              <label htmlFor="quoteNumber" className="block text-xs font-semibold text-muted-foreground uppercase mb-1">{t("plugins.crm.quoteRef")}</label>
              <input
                id="quoteNumber"
                type="text"
                value={quoteNumber}
                onChange={(e) => setQuoteNumber(e.target.value)}
                className="w-full bg-card border border-border rounded-lg p-2 text-sm font-mono font-bold text-foreground focus:border-purple-500 outline-none text-start"
                dir="ltr"
              />
            </div>
            <div>
              <label htmlFor="validUntil" className="block text-xs font-semibold text-muted-foreground uppercase mb-1">{t("plugins.crm.validUntil")}</label>
              <input
                id="validUntil"
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className="w-full bg-card border border-border rounded-lg p-2 text-sm text-foreground focus:border-purple-500 outline-none text-start"
                dir="ltr"
              />
            </div>
            <div>
              <label htmlFor="taxRate" className="block text-xs font-semibold text-muted-foreground uppercase mb-1">{t("plugins.crm.taxRate")}</label>
              <div className="relative">
                <input
                  id="taxRate"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  required
                  value={taxRatePercent}
                  onChange={(event) => setTaxRatePercent(Number(event.target.value))}
                  className="w-full bg-card border border-border rounded-lg p-2 pe-9 text-sm font-mono text-foreground focus:border-purple-500 outline-none text-start"
                  dir="ltr"
                />
                <span className="absolute inset-y-0 end-3 flex items-center text-xs font-semibold text-muted-foreground" aria-hidden>%</span>
              </div>
            </div>
          </div>

          {/* Line Items Table */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-purple-600" />
                {t("plugins.crm.lineItems")}
                <label className="flex items-center gap-2 ltr:ms-4 rtl:me-4 cursor-pointer" htmlFor="secondary-currency-checkbox">
                  <input id="secondary-currency-checkbox" type="checkbox" checked={useSecondaryCurrency} onChange={() => setUseSecondaryCurrency(!useSecondaryCurrency)} className="cursor-pointer" aria-label="Use secondary currency" />
                  <span className="text-[10px] uppercase text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded" dir="ltr">
                    {t("common.useSecondaryCurrency")} ({secondaryCurrency})
                  </span>
                </label>
              </h3>
              <button
                type="button"
                onClick={handleAddItem}
                className="text-xs font-semibold px-3 py-1.5 bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 rounded-lg flex items-center gap-1.5 transition-colors shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" /> {t("plugins.crm.addLineItem")}
              </button>
            </div>

            <div className="border border-border rounded-xl overflow-hidden shadow-2xs">
              <table className="w-full text-start border-collapse">
                <thead className="bg-muted text-muted-foreground text-xs font-semibold uppercase text-start">
                  <tr>
                    <th className="p-3 w-1/2 text-start">{t("plugins.crm.description")}</th>
                    <th className="p-3 w-1/6 text-center">{t("plugins.crm.qty")}</th>
                    <th className="p-3 w-1/6 ltr:text-end rtl:text-start">{t("plugins.crm.unitPrice")}</th>
                    <th className="p-3 w-1/6 ltr:text-end rtl:text-start">{t("plugins.crm.total")}</th>
                    <th className="p-3 w-12 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-sm">
                  {items.map((item) => (
                    <tr key={item.id} className="hover:bg-muted/50">
                      <td className="p-2.5">
                        <input
                          type="text"
                          aria-label="Item description"
                          value={item.description}
                          onChange={(e) => handleItemChange(item.id, "description", e.target.value)}
                          className="w-full bg-transparent border border-transparent hover:border-border focus:border-purple-500 focus:bg-card rounded p-1 text-foreground outline-none transition-colors"
                          placeholder={t("plugins.crm.itemDescPlaceholder")}
                        />
                      </td>
                      <td className="p-2.5">
                        <input
                          type="number"
                          aria-label="Item quantity"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => handleItemChange(item.id, "quantity", Number(e.target.value))}
                          className="w-full text-center bg-transparent border border-transparent hover:border-border focus:border-purple-500 focus:bg-card rounded p-1 text-foreground outline-none transition-colors font-mono"
                        />
                      </td>
                      <td className="p-2.5">
                        <input
                          type="number"
                          aria-label="Item unit price"
                          min="0"
                          step="0.01"
                          value={item.unitPrice}
                          onChange={(e) => handleItemChange(item.id, "unitPrice", Number(e.target.value))}
                          className="w-full ltr:text-end rtl:text-start bg-transparent border border-transparent hover:border-border focus:border-purple-500 focus:bg-card rounded p-1 text-foreground outline-none transition-colors font-mono text-start"
                          dir="ltr"
                        />
                      </td>
                      <td className="p-2.5 ltr:text-end rtl:text-start font-mono font-semibold text-foreground" dir="ltr">
                        {formatCurrency(item.quantity * item.unitPrice, useSecondaryCurrency)}
                      </td>
                      <td className="p-2.5 text-center">
                        <button
                          type="button"
                          aria-label="Remove item"
                          onClick={() => handleRemoveItem(item.id)}
                          disabled={items.length <= 1}
                          className="p-1 text-muted-foreground hover:text-rose-600 disabled:opacity-30 disabled:hover:text-muted-foreground transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals & Notes Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            <div>
              <label htmlFor="notes" className="block text-xs font-semibold text-muted-foreground uppercase mb-1">{t("plugins.crm.termsAndNotes")}</label>
              <textarea
                id="notes"
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-muted border border-border rounded-xl p-3 text-sm text-foreground focus:bg-card focus:border-purple-500 outline-none transition-all resize-none"
              />
            </div>

            <div className="bg-muted p-5 rounded-xl border border-border space-y-3 flex flex-col justify-center">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>{t("plugins.crm.subtotal")}</span>
                <span className="font-mono font-semibold" dir="ltr">{formatCurrency(subtotal, useSecondaryCurrency)}</span>
              </div>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>{t("plugins.crm.vat")} ({taxRatePercent || 0}%)</span>
                <span className="font-mono font-semibold text-purple-700" dir="ltr">{formatCurrency(taxAmount, useSecondaryCurrency)}</span>
              </div>
              <div className="pt-3 border-t border-border flex justify-between items-baseline">
                <span className="text-base font-bold text-foreground">{t("plugins.crm.totalAmount")}</span>
                <span className="text-2xl font-black text-emerald-600 font-mono" dir="ltr">{formatCurrency(totalAmount, useSecondaryCurrency)}</span>
              </div>
            </div>
          </div>

        </div>

        {/* Modal Footer (Action Buttons) */}
        <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-4 border-t border-border bg-muted gap-4">
          <button
            type="button"
            onClick={onClose}
            disabled={loading || bridgeLoading}
            className="w-full sm:w-auto px-4 py-2.5 text-sm font-medium text-foreground bg-card border border-border rounded-xl hover:bg-muted transition-colors disabled:opacity-50"
          >
            {t("common.cancel")}
          </button>

          <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
            {/* Action 1: Save Quote Only */}
            <button
              type="button"
              onClick={handleSaveQuote}
              disabled={loading || bridgeLoading}
              className="w-full sm:w-auto px-5 py-2.5 bg-brand hover:bg-brand-dark text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors shadow-sm disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4 text-purple-400" />
              {loading ? t("common.saving") : t("plugins.crm.saveQuote")}
            </button>

            {/* Action 2: Quote-to-Invoice Bridge */}
            <button
              type="button"
              onClick={handleInvoiceBridge}
              disabled={loading || bridgeLoading}
              className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-md transition-all transform hover:scale-[1.01] disabled:opacity-50"
            >
              <ShieldCheck className="w-4 h-4 ltr:me-1 rtl:ms-1" />
              {bridgeLoading ? t("plugins.crm.processingBridge") : t("plugins.crm.invoiceBridgeAction")}
              <ArrowRight className="w-4 h-4 rtl:rotate-180" />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
