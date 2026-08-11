import React from "react";
import { ArrowUpRight, ArrowDownRight, Clock } from "lucide-react";
import { useLocalization } from "@/contexts/LocalizationContext";

interface TransactionEntity {
  ID: string;
  CreatedAt?: string;
  data?: {
    client_name?: string;
    category?: string;
    amount?: number | string;
    issue_date?: string;
    date?: string;
    status?: string;
  };
}

interface RecentTransactionsProps {
  invoices: TransactionEntity[];
  expenses: TransactionEntity[];
}

export default function RecentTransactions({ invoices, expenses }: RecentTransactionsProps) {
  const { t } = useLocalization();

  // Combine, sort, and slice the most recent transactions
  const combined = [
    ...invoices.map(i => ({
      id: i.ID,
      type: 'invoice',
      title: i.data?.client_name || t("finance.salesInvoiceLabel"),
      amount: Number(i.data?.amount) || 0,
      date: i.data?.issue_date || i.CreatedAt,
      status: i.data?.status || 'pending'
    })),
    ...expenses.map(e => ({
      id: e.ID,
      type: 'expense',
      title: e.data?.category || t("finance.generalExpenseLabel"),
      amount: Number(e.data?.amount) || 0,
      date: e.data?.date || e.CreatedAt,
      status: 'paid'
    }))
  ];

  const sorted = combined.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()).slice(0, 5);

  return (
    <div className="bg-card dark:bg-card rounded-xl shadow-sm border border-border dark:border-border p-6 h-full transition-colors duration-300">
      <div className="flex justify-between items-center mb-6">
        <h3 className="font-bold text-foreground dark:text-muted-foreground">{t("finance.recentTransactionsTitle")}</h3>
        <button className="text-sm text-brand hover:underline">{t("finance.viewAllBtn")}</button>
      </div>

      <div className="space-y-4">
        {sorted.length === 0 ? (
          <p className="text-center text-muted-foreground dark:text-muted-foreground py-8">{t("finance.noRecentTransactions")}</p>
        ) : (
          sorted.map((tx, idx) => (
            <div key={idx} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted dark:hover:bg-card/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-full ${
                  tx.type === 'invoice'
                    ? 'bg-success/10 text-success dark:bg-success/20 dark:text-success'
                    : 'bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive'
                }`}>
                  {tx.type === 'invoice' ? <ArrowDownRight className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                </div>
                <div>
                  <p className="font-semibold text-sm text-foreground dark:text-muted-foreground">{tx.title}</p>
                  <p className="text-xs text-muted-foreground dark:text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3" />
                    {tx.date ? new Date(tx.date).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }) : t("finance.unspecifiedDate")}
                  </p>
                </div>
              </div>

              <div className="text-start">
                <p className={`font-bold text-sm ${
                  tx.type === 'invoice'
                    ? 'text-success dark:text-success'
                    : 'text-foreground dark:text-muted-foreground'
                }`}>
                  {tx.type === 'invoice' ? '+' : '-'}${tx.amount.toLocaleString()}
                </p>
                <span className={`text-[10px] px-2 py-0.5 rounded-full mt-1 inline-block ${
                  tx.status === 'paid'
                    ? 'bg-success/10 text-success dark:bg-success/20 dark:text-success'
                    : 'bg-warning/10 text-warning dark:bg-warning/20 dark:text-warning'
                }`}>
                  {tx.status === 'paid' ? t("finance.statusPaid") : t("finance.statusPending")}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
