 
import React, { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiPost } from "@/lib/apiClient";
import { useLocalization } from "@/contexts/LocalizationContext";

interface AddEmployeeModalProps {
 isOpen: boolean;
 onClose: () => void;
 onSuccess: () => void;
}

export default function AddEmployeeModal({ isOpen, onClose, onSuccess }: AddEmployeeModalProps) {
 const { t } = useLocalization();
 const [loading, setLoading] = useState(false);
 const [formData, setFormData] = useState({
  name: "",
  email: "",
  department: "",
  role: "",
  salary: "",
  status: "active",
 });

 if (!isOpen) return null;

 const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  try {
   setLoading(true);
   await apiPost("/employees", {
    name: formData.name,
    data: {
     email: formData.email,
     department: formData.department,
     role: formData.role,
     salary: Number(formData.salary) || 0,
     status: formData.status,
     joinDate: new Date().toISOString().split("T")[0],
     created_at: new Date().toISOString(),
    },
   });
   onSuccess();
   onClose();
  } catch (err) {
   console.error("Failed to add employee", err);
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

    <h2 className="text-xl font-bold text-foreground mb-6">{t("hr.addEmployee")}</h2>

    <form onSubmit={handleSubmit} className="space-y-4">
     <div>
      <label htmlFor="field-1" className="block text-sm font-medium text-foreground mb-1">{t("hr.employeeName")}</label>
      <input placeholder={t("hr.employeeName")} title={t("hr.employeeName")} aria-label={t("hr.employeeName")} id="field-1" 
       type="text" 
       required
       className="w-full border border-border rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand focus:border-transparent outline-none"
       value={formData.name}
       onChange={(e) => setFormData({...formData, name: e.target.value})}
      />
     </div>
     
     <div>
      <label htmlFor="field-2" className="block text-sm font-medium text-foreground mb-1">{t("hr.email")}</label>
      <input placeholder={t("hr.email")} title={t("hr.email")} aria-label={t("hr.email")} id="field-2" 
       type="email" 
       required
       className="w-full border border-border rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand focus:border-transparent outline-none"
       value={formData.email}
       onChange={(e) => setFormData({...formData, email: e.target.value})}
      />
     </div>

     <div className="grid grid-cols-2 gap-4">
      <div>
       <label htmlFor="field-3" className="block text-sm font-medium text-foreground mb-1">{t("hr.department")}</label>
      <input placeholder={t("hr.department")} title={t("hr.department")} aria-label={t("hr.department")} id="field-3" 
        type="text" 
        required
        className="w-full border border-border rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand focus:border-transparent outline-none"
        value={formData.department}
        onChange={(e) => setFormData({...formData, department: e.target.value})}
       />
      </div>
      <div>
       <label htmlFor="field-4" className="block text-sm font-medium text-foreground mb-1">{t("hr.jobTitle")}</label>
      <input placeholder={t("hr.jobTitle")} title={t("hr.jobTitle")} aria-label={t("hr.jobTitle")} id="field-4" 
        type="text" 
        required
        className="w-full border border-border rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand focus:border-transparent outline-none"
        value={formData.role}
        onChange={(e) => setFormData({...formData, role: e.target.value})}
       />
      </div>
     </div>

     <div>
      <label htmlFor="field-5" className="block text-sm font-medium text-foreground mb-1">{t("hr.baseSalary")}</label>
      <input placeholder={t("hr.baseSalary")} title={t("hr.baseSalary")} aria-label={t("hr.baseSalary")} id="field-5" 
       type="number" 
       required
       min="0"
       className="w-full border border-border rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand focus:border-transparent outline-none"
       value={formData.salary}
       onChange={(e) => setFormData({...formData, salary: e.target.value})}
      />
     </div>

     <div className="flex justify-end gap-3 mt-8">
      <Button type="button" variant="outline" onClick={onClose}>
       {t("common.cancel")}
      </Button>
      <Button type="submit" disabled={loading} className="bg-brand hover:bg-brand/90">
       {loading ? t("hr.adding") : t("hr.saveEmployee")}
      </Button>
     </div>
    </form>
   </div>
  </div>
 );
}
