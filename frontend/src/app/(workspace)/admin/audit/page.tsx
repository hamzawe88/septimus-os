/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/apiClient";
import { Activity, User, Shield, ShieldAlert, Key } from "lucide-react";

interface AuditLog {
  ID: string;
  user_id: string;
  User?: {
    email: string;
  };
  action: string;
  entity_type: string;
  entity_id: string;
  details: any;
  ip_address: string;
  CreatedAt: string;
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const response = await apiGet("/admin/audit-logs");
        setLogs(response as AuditLog[]);
      } catch (error) {
        console.error("Failed to fetch audit logs", error);
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, []);

  if (loading) {
    return <div className="p-8 text-[var(--color-text-muted)]">Loading audit logs...</div>;
  }

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)] flex items-center gap-2">
          <Activity className="w-6 h-6 text-indigo-500" />
          Audit Logs
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Review critical system actions and security events.
        </p>
      </div>

      <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-start text-sm">
          <thead className="bg-[var(--color-bg-tertiary)] border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
            <tr>
              <th className="p-4 font-medium">Timestamp</th>
              <th className="p-4 font-medium">User</th>
              <th className="p-4 font-medium">Action</th>
              <th className="p-4 font-medium">Entity Type</th>
              <th className="p-4 font-medium">Entity ID</th>
              <th className="p-4 font-medium">IP Address</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {logs.map((log) => (
              <tr key={log.ID} className="hover:bg-[var(--color-bg-tertiary)]/50 transition-colors">
                <td className="p-4 text-[var(--color-text-muted)] whitespace-nowrap">
                  {new Date(log.CreatedAt).toLocaleString()}
                </td>
                <td className="p-4">
                  <div className="flex items-center gap-2 text-[var(--color-text-primary)]">
                    <User className="w-4 h-4 text-slate-400" />
                    {log.User?.email || log.user_id}
                  </div>
                </td>
                <td className="p-4">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    {log.action.includes("delete") ? (
                      <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
                    ) : log.action.includes("create") ? (
                      <Shield className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Key className="w-3.5 h-3.5 text-indigo-400" />
                    )}
                    {log.action}
                  </span>
                </td>
                <td className="p-4 text-[var(--color-text-primary)]">{log.entity_type}</td>
                <td className="p-4 text-xs font-mono text-[var(--color-text-muted)] truncate max-w-[120px]">
                  {log.entity_id}
                </td>
                <td className="p-4 text-xs font-mono text-[var(--color-text-muted)]">
                  {log.ip_address || "N/A"}
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-[var(--color-text-muted)]">
                  No audit logs found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
