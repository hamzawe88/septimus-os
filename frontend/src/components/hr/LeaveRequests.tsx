/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState, useEffect } from "react";
import { Search, Plus, Calendar, Check, X, Clock, BrainCircuit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiGet, apiPut, apiPost, AI_BASE_URL } from "@/lib/apiClient";
import AddLeaveRequestModal from "./AddLeaveRequestModal";
import { useLocalization } from "@/contexts/LocalizationContext";

interface LeaveRequest {
  id: string;
  employeeName: string;
  type: "annual" | "sick" | "unpaid" | string;
  startDate: string;
  endDate: string;
  days: number;
  status: "pending" | "approved" | "rejected" | string;
  createdAt: string;
  _originalEntity?: any;
}

export default function LeaveRequests() {
  const { t, isRtl } = useLocalization();
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  
  const [reviewingReq, setReviewingReq] = useState<LeaveRequest | null>(null);
  const [reviewResult, setReviewResult] = useState<string | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);

  const fetchLeaveRequests = async () => {
    try {
      setIsLoading(true);
      const workspaceId = localStorage.getItem("currentWorkspaceId") || "";
      const res = await apiGet<{data: any[]}>(`/entities?workspace_id=${workspaceId}&type=hr_leave`);
      if (res.data) {
        const mapped: LeaveRequest[] = res.data.map((entity: any) => ({
          id: entity.id,
          employeeName: entity.data?.employeeName || entity.data?.employee_name || t("common.unspecified"),
          type: entity.data?.type || "annual",
          startDate: entity.data?.startDate || t("common.unspecified"),
          endDate: entity.data?.endDate || t("common.unspecified"),
          days: parseInt(entity.data?.days || "0", 10),
          status: entity.data?.status || "pending",
          createdAt: new Date(entity.created_at).toLocaleDateString('en-CA'),
          _originalEntity: entity
        }));
        setRequests(mapped);
      }
      setIsLoading(false);
    } catch (err) {
      console.error("Failed to fetch leaves", err);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Defer to a microtask so state updates run outside the synchronous effect body
    void Promise.resolve().then(fetchLeaveRequests);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateStatus = async (reqId: string, newStatus: string) => {
    const reqToUpdate = requests.find(r => r.id === reqId);
    if (!reqToUpdate) return;

    // Optimistic update
    setRequests(prev => prev.map(r => r.id === reqId ? { ...r, status: newStatus } : r));

    try {
      const workspaceId = localStorage.getItem("currentWorkspaceId") || "";
      const entity = reqToUpdate._originalEntity;
      if (entity) {
        const updatedData = { ...(entity.data as any), status: newStatus };
        await apiPut(`/entities/${reqId}?workspace_id=${workspaceId}`, {
          name: entity.name,
          type: entity.type,
          data: updatedData
        });
      }
    } catch (err) {
      console.error("Failed to update status", err);
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-full text-slate-500">{t("hr.loadingLeaveRequests")}</div>;
  }

  const handleAIReview = async (req: LeaveRequest) => {
    setReviewingReq(req);
    setIsReviewing(true);
    setReviewResult(null);

    try {
      const workspaceId = localStorage.getItem("currentWorkspaceId") || "";
      const response = await apiPost<{reply: string}>('/ai/chat', {
        agent_type: 'hr',
        message: t("hr.aiReviewPrompt", `Please review this leave request for employee {employeeName}. Type: {type}, Days: {days} from {startDate} to {endDate}. State your recommendation (approve/reject) based on HR policy.`)
          .replace("{employeeName}", req.employeeName)
          .replace("{type}", req.type)
          .replace("{days}", req.days.toString())
          .replace("{startDate}", req.startDate)
          .replace("{endDate}", req.endDate),
        context: { workspace_id: workspaceId, request: req, lang: isRtl ? 'ar' : 'en' },
      }, AI_BASE_URL);
      
      setReviewResult(response.reply);
    } catch (err) {
      console.error("AI Review failed", err);
      setReviewResult(t("hr.aiReviewError"));
    } finally {
      setIsReviewing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case "pending": return <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 flex items-center gap-1"><Clock className="w-3 h-3"/> {t("hr.pending")}</span>;
      case "approved": return <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 flex items-center gap-1"><Check className="w-3 h-3"/> {t("hr.approved")}</span>;
      case "rejected": return <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-rose-100 text-rose-700 flex items-center gap-1"><X className="w-3 h-3"/> {t("hr.rejected")}</span>;
      default: return <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 flex items-center gap-1">{status}</span>;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type?.toLowerCase()) {
      case "annual": return <span className="text-blue-600 font-medium bg-blue-50 px-2 py-0.5 rounded text-sm">{t("hr.annual")}</span>;
      case "sick": return <span className="text-orange-600 font-medium bg-orange-50 px-2 py-0.5 rounded text-sm">{t("hr.sick")}</span>;
      case "unpaid": return <span className="text-slate-600 font-medium bg-slate-50 px-2 py-0.5 rounded text-sm">{t("hr.unpaid")}</span>;
      default: return <span className="text-slate-600 font-medium bg-slate-50 px-2 py-0.5 rounded text-sm">{type}</span>;
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#f8fafc] w-full overflow-hidden">
      {/* Header */}
      <div className="flex-none px-8 py-6 border-b border-slate-200 bg-white">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Calendar className="w-6 h-6 text-brand" />
              {t("hr.leaveRequests")}
            </h1>
            <p className="text-slate-500 mt-1">
              {t("hr.leaveRequestsDesc")}
            </p>
          </div>
          <div className="flex gap-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute end-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder={t("hr.searchRequestNo")}
                className="ps-4 pe-9 py-2 border border-slate-200 rounded-md text-sm w-64 focus:outline-none focus:border-brand"
              />
            </div>
            <Button onClick={() => setIsAddModalOpen(true)} className="bg-brand hover:bg-brand/90 gap-2">
              <Plus className="w-4 h-4" />
              {t("hr.newRequest")}
            </Button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm text-end">
            <thead className="bg-[#f8fafc] text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 font-medium">{t("hr.requestNo")}</th>
                <th className="px-6 py-4 font-medium">{t("hr.employee")}</th>
                <th className="px-6 py-4 font-medium">{t("hr.leaveType")}</th>
                <th className="px-6 py-4 font-medium">{t("hr.duration")}</th>
                <th className="px-6 py-4 font-medium">{t("hr.daysCount")}</th>
                <th className="px-6 py-4 font-medium">{t("common.status")}</th>
                <th className="px-6 py-4 font-medium">{t("hr.submissionDate")}</th>
                <th className="px-6 py-4 font-medium text-start">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-700">
              {requests.map((req) => (
                <tr key={req.id} className="hover:bg-[#f8fafc] transition-colors group">
                  <td className="px-6 py-4 font-bold text-slate-600">{req.id.substring(0, 8)}</td>
                  <td className="px-6 py-4 font-medium text-slate-900">{req.employeeName}</td>
                  <td className="px-6 py-4">{getTypeBadge(req.type)}</td>
                  <td className="px-6 py-4 text-slate-600">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-slate-400">{t("common.from")} {req.startDate}</span>
                      <span className="text-xs text-slate-400">{t("common.to")} {req.endDate}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 font-bold text-slate-700">{req.days} {t("hr.days")}</td>
                  <td className="px-6 py-4">{getStatusBadge(req.status)}</td>
                  <td className="px-6 py-4 text-slate-500">{req.createdAt}</td>
                  <td className="px-6 py-4 text-start">
                    {req.status === "pending" ? (
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => handleAIReview(req)}
                          className="p-1.5 text-brand hover:bg-brand/10 rounded-md transition-colors border border-transparent hover:border-brand/20" 
                          title={t("hr.aiReviewTitle")}
                        >
                          <BrainCircuit className="w-4 h-4" />
                        </button>
                        <div className="w-px h-4 bg-slate-200 mx-1"></div>
                        <button 
                          onClick={() => updateStatus(req.id, "approved")}
                          className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors" 
                          title={t("hr.approve")}
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => updateStatus(req.id, "rejected")}
                          className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-md transition-colors" 
                          title={t("hr.reject")}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">{t("hr.processed")}</span>
                    )}
                  </td>
                </tr>
              ))}
              {requests.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-slate-500">
                    {t("hr.noLeaveRequests")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {isAddModalOpen && (
          <AddLeaveRequestModal 
            isOpen={isAddModalOpen}
            onClose={() => setIsAddModalOpen(false)} 
            onSuccess={() => {
              setIsAddModalOpen(false);
              fetchLeaveRequests();
            }} 
          />
        )}

        {/* AI Review Modal */}
        {reviewingReq && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-brand/5">
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  <BrainCircuit className="w-5 h-5 text-brand" />
                  {t("hr.aiReviewTitle")}
                </h3>
                <button onClick={() => setReviewingReq(null)} className="text-slate-400 hover:bg-slate-100 p-1 rounded-full" title={t("common.close")}>
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6">
                <div className="mb-4">
                  <p className="text-sm font-medium text-slate-700">{t("hr.employeeRequest")} {reviewingReq.employeeName}</p>
                  <p className="text-xs text-slate-500">{t("common.from")} {reviewingReq.startDate} {t("common.to")} {reviewingReq.endDate}</p>
                </div>
                
                <div className="bg-slate-50 rounded-xl p-4 min-h-[100px] border border-slate-100">
                  {isReviewing ? (
                    <div className="flex flex-col items-center justify-center h-full text-brand space-y-3">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand"></div>
                      <p className="text-sm font-medium animate-pulse">{t("hr.aiEvaluating")}</p>
                    </div>
                  ) : (
                    <div className="text-slate-700 text-sm whitespace-pre-wrap leading-relaxed">
                      {reviewResult}
                    </div>
                  )}
                </div>
              </div>
              <div className="p-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
                <Button variant="outline" onClick={() => setReviewingReq(null)}>
                  {t("common.close")}
                </Button>
                {!isReviewing && reviewResult && (
                  <>
                    <Button 
                      variant="outline" 
                      className="text-rose-600 border-rose-200 hover:bg-rose-50"
                      onClick={() => { updateStatus(reviewingReq.id, 'rejected'); setReviewingReq(null); }}
                    >
                      {t("hr.rejectRequest")}
                    </Button>
                    <Button 
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={() => { updateStatus(reviewingReq.id, 'approved'); setReviewingReq(null); }}
                    >
                      {t("hr.approve")}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
