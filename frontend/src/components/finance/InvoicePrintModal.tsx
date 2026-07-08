"use client";

import React from "react";
import { X, Printer, Download, Building2, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocalization } from "@/contexts/LocalizationContext";

export interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discountRate: number; // percentage e.g. 5
  taxRate: number; // percentage e.g. 15
}

export interface SMEInvoiceData {
  invoiceNumber?: string;
  clientName?: string;
  clientCompany?: string;
  clientTaxId?: string;
  clientEmail?: string;
  clientAddress?: string;
  issueDate?: string;
  dueDate?: string;
  status?: string;
  lineItems?: LineItem[];
  subtotal?: number;
  totalDiscount?: number;
  totalTax?: number;
  amount?: number; // Grand Total
  paymentTerms?: string;
  bankIban?: string;
  notes?: string;
  // Legacy mappings
  client_name?: string;
  due_date?: string;
  [key: string]: unknown;
}

interface InvoicePrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoiceData: SMEInvoiceData;
  invoiceId?: string;
}

export default function InvoicePrintModal({
  isOpen,
  onClose,
  invoiceData,
  invoiceId = "INV-2026-0001",
}: InvoicePrintModalProps) {
  const { t } = useLocalization();

  if (!isOpen) return null;

  // Normalize data between legacy simple format and new SME format
  const invoiceNum = invoiceData.invoiceNumber || invoiceId || "INV-2026-0001";
  const clientName = invoiceData.clientName || invoiceData.client_name || t("finance.unspecifiedClient");
  const clientCompany = invoiceData.clientCompany || t("finance.clientCompanyPlaceholder");
  const clientTaxId = invoiceData.clientTaxId || t("finance.notListed");
  const issueDate = invoiceData.issueDate || new Date().toISOString().split("T")[0];
  const dueDate = invoiceData.dueDate || invoiceData.due_date || new Date().toISOString().split("T")[0];
  const iban = invoiceData.bankIban || "SA98 1000 0000 1234 5678 9012";
  const paymentTerms = invoiceData.paymentTerms || t("finance.dueOnReceipt");

  // If no line items exist (legacy invoice), create a default line item from amount
  const fallbackAmount = Number(invoiceData.amount) || 0;
  const items: LineItem[] =
    invoiceData.lineItems && invoiceData.lineItems.length > 0
      ? invoiceData.lineItems
      : [
          {
            id: "1",
            description: `${t("finance.consultingServices")} - ${clientName}`,
            quantity: 1,
            unitPrice: fallbackAmount > 0 ? fallbackAmount / 1.15 : 1000,
            discountRate: 0,
            taxRate: 15,
          },
        ];

  // Calculate totals if not already computed
  const computedSubtotal =
    invoiceData.subtotal !== undefined
      ? invoiceData.subtotal
      : items.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0);

  const computedDiscount =
    invoiceData.totalDiscount !== undefined
      ? invoiceData.totalDiscount
      : items.reduce((acc, item) => acc + (item.quantity * item.unitPrice * item.discountRate) / 100, 0);

  const computedTax =
    invoiceData.totalTax !== undefined
      ? invoiceData.totalTax
      : items.reduce(
          (acc, item) =>
            acc +
            ((item.quantity * item.unitPrice * (1 - item.discountRate / 100)) * item.taxRate) / 100,
          0
        );

  const computedGrandTotal =
    invoiceData.amount !== undefined ? Number(invoiceData.amount) : computedSubtotal - computedDiscount + computedTax;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm overflow-y-auto p-4 print:p-0 print:bg-white print:static">
      {/* Modal Container */}
      <div className="bg-white text-slate-900 w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-8 print:my-0 print:shadow-none print:border-none print:rounded-none print:max-w-full">
        {/* Top Control Bar (Hidden on Print) */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 print:hidden">
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-brand" />
            <h2 className="text-lg font-bold text-slate-800">{t("finance.previewInvoice")}</h2>
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={handlePrint}
              className="bg-brand hover:bg-brand/90 text-white gap-2 shadow-sm font-semibold"
              title={t("finance.printSavePDF")}
              aria-label={t("finance.printSavePDF")}
            >
              <Download className="w-4 h-4" />
              {t("finance.printSavePDF")}
            </Button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
              title={t("common.close")}
              aria-label={t("common.close")}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable A4 Sheet */}
        <div className="p-8 md:p-12 space-y-8 bg-white" id="printable-invoice-area">
          {/* Header & Logo Section */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-200 pb-8 gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center text-brand font-black text-2xl">
                  S
                </div>
                <div>
                  <h1 className="text-2xl font-black text-slate-900 tracking-tight">SEPTIMUS OS</h1>
                  <p className="text-xs font-semibold text-brand tracking-wider uppercase">Enterprise Financial Suite</p>
                </div>
              </div>
              <p className="text-sm text-slate-500 font-medium">{t("finance.companyNameLong")}</p>
              <div className="text-xs text-slate-500 space-y-0.5">
                <p><span className="font-semibold text-slate-700">{t("finance.taxIdVAT")}</span> 300123456700003</p>
                <p><span className="font-semibold text-slate-700">{t("finance.addressLabel")}</span> {t("finance.companyAddressValue")}</p>
              </div>
            </div>

            <div className="text-start md:text-end bg-slate-50 p-6 rounded-2xl border border-slate-200/80 min-w-[240px]">
              <div className="inline-block px-3 py-1 bg-brand/10 text-brand text-xs font-bold rounded-full mb-3 uppercase tracking-wider">
                {t("finance.taxInvoiceLabel")}
              </div>
              <h3 className="text-2xl font-black text-slate-900 font-mono mb-1">{invoiceNum}</h3>
              <div className="text-xs text-slate-600 space-y-1 mt-3">
                <p className="flex justify-between md:justify-end gap-4">
                  <span className="text-slate-400">{t("finance.issueDateLabel")}</span>
                  <span className="font-semibold text-slate-800 font-mono">{issueDate}</span>
                </p>
                <p className="flex justify-between md:justify-end gap-4">
                  <span className="text-slate-400">{t("finance.dueDateLabel")}</span>
                  <span className="font-semibold text-slate-800 font-mono">{dueDate}</span>
                </p>
              </div>
            </div>
          </div>

          {/* Bill To & Payment Info Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50/50 p-6 rounded-2xl border border-slate-100">
            <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-brand" />
                {t("finance.billToLabel")}
              </h4>
              <p className="text-lg font-bold text-slate-900">{clientName}</p>
              <p className="text-sm font-medium text-slate-700 mt-0.5">{clientCompany}</p>
              <div className="text-xs text-slate-500 space-y-1 mt-2">
                <p><span className="font-semibold text-slate-700">{t("finance.taxIdLabel")}</span> {clientTaxId}</p>
                {invoiceData.clientEmail && <p><span className="font-semibold text-slate-700">{t("finance.emailLabel")}</span> {invoiceData.clientEmail}</p>}
                {invoiceData.clientAddress && <p><span className="font-semibold text-slate-700">{t("finance.addressLabel2")}</span> {invoiceData.clientAddress}</p>}
              </div>
            </div>

            <div className="md:border-e md:border-slate-200 md:pe-6">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-brand" />
                {t("finance.paymentTermsTitle")}
              </h4>
              <p className="text-sm font-semibold text-slate-800">{paymentTerms}</p>
              <div className="text-xs text-slate-500 space-y-1.5 mt-2">
                <p><span className="font-semibold text-slate-700">{t("finance.recipientBank")}</span> {t("finance.bankName")}</p>
                <p className="font-mono bg-white px-2 py-1 rounded border border-slate-200 text-slate-800 font-semibold inline-block">
                  IBAN: {iban}
                </p>
              </div>
            </div>
          </div>

          {/* Line Items Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-end border-collapse">
              <thead>
                <tr className="border-b-2 border-slate-900 text-xs font-black text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-2">#</th>
                  <th className="py-3 px-4">{t("finance.descDetailsLabel")}</th>
                  <th className="py-3 px-3 text-center">{t("finance.quantityLabel2")}</th>
                  <th className="py-3 px-3 text-start">{t("finance.unitPriceLabel2")}</th>
                  <th className="py-3 px-3 text-center">{t("finance.discountLabel2")}</th>
                  <th className="py-3 px-3 text-center">{t("finance.tax15Label")}</th>
                  <th className="py-3 px-2 text-start">{t("finance.totalLabel2")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {items.map((item, index) => {
                  const itemSubtotal = item.quantity * item.unitPrice;
                  const itemDiscount = (itemSubtotal * item.discountRate) / 100;
                  const itemTax = ((itemSubtotal - itemDiscount) * item.taxRate) / 100;
                  const itemTotal = itemSubtotal - itemDiscount + itemTax;

                  return (
                    <tr key={item.id || index} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-4 px-2 font-mono text-slate-400 font-semibold">{index + 1}</td>
                      <td className="py-4 px-4 font-bold text-slate-800">{item.description}</td>
                      <td className="py-4 px-3 text-center font-mono font-medium text-slate-700">{item.quantity}</td>
                      <td className="py-4 px-3 text-start font-mono text-slate-700">${item.unitPrice.toFixed(2)}</td>
                      <td className="py-4 px-3 text-center font-mono text-slate-500">
                        {item.discountRate > 0 ? `${item.discountRate}%` : "-"}
                      </td>
                      <td className="py-4 px-3 text-center font-mono text-slate-600">{item.taxRate}%</td>
                      <td className="py-4 px-2 text-start font-mono font-bold text-slate-900">${itemTotal.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Financial Summary & QR Code Section */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 pt-6 border-t border-slate-200">


            <div className="md:col-span-2"></div>

            {/* Financial Calculation Table */}
            <div className="md:col-span-5 space-y-3 bg-slate-50/80 p-6 rounded-2xl border border-slate-200">
              <div className="flex justify-between text-sm text-slate-600">
                <span>{t("finance.subtotalLabel2")}</span>
                <span className="font-mono font-semibold text-slate-800">${computedSubtotal.toFixed(2)}</span>
              </div>
              {computedDiscount > 0 && (
                <div className="flex justify-between text-sm text-rose-600 font-medium">
                  <span>{t("finance.totalDiscountLabel2")}</span>
                  <span className="font-mono">-${computedDiscount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm text-slate-600">
                <span>{t("finance.vatLabel2")}</span>
                <span className="font-mono font-semibold text-slate-800">${computedTax.toFixed(2)}</span>
              </div>
              <div className="border-t border-slate-300 pt-3 flex justify-between items-center text-lg font-black text-slate-900">
                <span>{t("finance.grandTotalLabel2")}</span>
                <span className="font-mono text-xl text-brand">${computedGrandTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Footer Notes */}
          <div className="pt-8 border-t border-slate-100 text-center md:text-end text-xs text-slate-400 space-y-1">
            <p className="font-semibold text-slate-600">
              {invoiceData.notes || t("finance.invoiceNotesDefault2")}
            </p>
            <p>{t("finance.electronicInvoiceNote")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
