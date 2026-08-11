
import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiGet, apiPost } from "@/lib/apiClient";
import { useLocalization } from "@/contexts/LocalizationContext";

interface AddLeaveRequestModalProps {
 isOpen: boolean;
 onClose: () => void;
 onSuccess: () => void;
}

interface EmployeeOption {
 id: string;
 name: string;
}

export default function AddLeaveRequestModal({ isOpen, onClose, onSuccess }: AddLeaveRequestModalProps) {
 const { t } = useLocalization();
 const [loading, setLoading] = useState(false);
 const [employees, setEmployees] = useState<EmployeeOption[]>([]);
 const [formData, setFormData] = useState({
  employeeId: "",
  type: "annual",
  startDate: "",
  endDate: "",
 });

 // Load the directory so the request links to a real employee_id — the server
 // needs it to deduct the right person's leave balance on approval.
 useEffect(() => {
  if (!isOpen) return;
  let active = true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  apiGet<{ data: any[] }>(`/employees`)
   .then(res => {
    if (!active) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setEmployees((res.data || []).map((e: any) => ({ id: e.id, name: e.data?.full_name || e.name || "—" })));
   })
   .catch(err => console.error("Failed to load employees", err));
  return () => { active = false; };
 }, [isOpen]);

 if (!isOpen) return null;

 const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  try {
   setLoading(true);
   // The server computes the day count from the date span and starts the
   // request as pending; approval later deducts from the leave balance.
   await apiPost("/leave-requests", {
    employee_id: formData.employeeId,
    leave_type: formData.type,
    start_date: formData.startDate,
    end_date: formData.endDate,
   });
   onSuccess();
   onClose();
  } catch (err) {
   console.error("Failed to add leave request", err);
  } finally {
   setLoading(false);
  }
 };

 return (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
   <div className="bg-card rounded-xl shadow-lg w-full max-w-md p-6 relative">
    <button title={t("common.close")} aria-label={t("common.close")} onClick={onClose}
     className="absolute top-4 end-4 p-2 text-muted-foreground hover:bg-muted hover:text-muted-foreground rounded-full transition-colors">
     <X className="w-5 h-5" />
    </button>

    <h2 className="text-xl font-bold text-foreground mb-6">{t("hr.submitLeave")}</h2>

    <form onSubmit={handleSubmit} className="space-y-4">
     <div>
      <label htmlFor="field-1" className="block text-sm font-medium text-foreground mb-1">{t("hr.employee")}</label>
      <select id="field-1" title={t("hr.employee")} aria-label={t("hr.employee")}
       required
       className="w-full border border-border rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand focus:border-transparent outline-none"
       value={formData.employeeId}
       onChange={(e) => setFormData({...formData, employeeId: e.target.value})}
      >
       <option value="" disabled>{t("hr.selectEmployee", "Select an employee")}</option>
       {employees.map(emp => (
        <option key={emp.id} value={emp.id}>{emp.name}</option>
       ))}
      </select>
     </div>

     <div>
      <label htmlFor="field-2" className="block text-sm font-medium text-foreground mb-1">{t("hr.leaveType")}</label>
      <select id="field-2" title={t("hr.leaveType")} aria-label={t("hr.leaveType")} 
       className="w-full border border-border rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand focus:border-transparent outline-none"
       value={formData.type}
       onChange={(e) => setFormData({...formData, type: e.target.value})}
      >
       <option value="annual">{t("hr.leaveTypes.annual")}</option>
       <option value="sick">{t("hr.leaveTypes.sick")}</option>
       <option value="unpaid">{t("hr.leaveTypes.unpaid")}</option>
       <option value="emergency">{t("hr.leaveTypes.emergency")}</option>
      </select>
     </div>
     
     <div className="grid grid-cols-2 gap-4">
      <div>
       <label htmlFor="field-3" className="block text-sm font-medium text-foreground mb-1">{t("hr.startDate")}</label>
      <input id="field-3" title={t("hr.startDate")} aria-label={t("hr.startDate")} placeholder={t("hr.startDate")}
        type="date" 
        required
        className="w-full border border-border rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand focus:border-transparent outline-none"
        value={formData.startDate}
        onChange={(e) => setFormData({...formData, startDate: e.target.value})}
       />
      </div>
      <div>
       <label htmlFor="field-4" className="block text-sm font-medium text-foreground mb-1">{t("hr.endDate")}</label>
      <input id="field-4" title={t("hr.endDate")} aria-label={t("hr.endDate")} placeholder={t("hr.endDate")}
        type="date" 
        required
        className="w-full border border-border rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand focus:border-transparent outline-none"
        value={formData.endDate}
        onChange={(e) => setFormData({...formData, endDate: e.target.value})}
       />
      </div>
     </div>

     <div className="flex justify-end gap-3 mt-8">
      <Button type="button" variant="outline" onClick={onClose}>
       {t("common.cancel")}
      </Button>
      <Button type="submit" disabled={loading} className="bg-brand hover:bg-brand/90">
       {loading ? t("hr.submitting") : t("hr.submitRequest")}
      </Button>
     </div>
    </form>
   </div>
  </div>
 );
}
