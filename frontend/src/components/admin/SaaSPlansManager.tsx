import React, { useState, useEffect } from "react";
import { Plus, Edit2, Trash2, Check, Sparkles, AlertTriangle, ShieldCheck, Zap } from "lucide-react";
import { useLocalization } from "@/contexts/LocalizationContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { apiGet, apiPut, apiPost, apiDelete } from "@/lib/apiClient";
import { useToastStore } from "@/store/useToastStore";

interface SaaSPlan {
  id?: string;
  tier_id: string;
  name_en: string;
  name_ar: string;
  price: number;
  currency: string;
  description_en: string;
  description_ar: string;
  features_en: string;
  features_ar: string;
  recommended: boolean;
  color: string;
  is_active: boolean;
  /** Entitlements: which feature_keys this plan unlocks (enforced by the backend). */
  features?: Record<string, boolean>;
  /** Entitlements: per-resource caps (-1 = unlimited). */
  limits?: Record<string, number>;
}

interface EntitlementCatalog {
  feature_keys: string[];
  limit_keys: string[];
  tiers: string[];
  defaults: Record<string, { features: Record<string, boolean>; limits: Record<string, number> }>;
  unlimited: number;
}

export default function SaaSPlansManager() {
  const { t, isRtl } = useLocalization();
  const { toast } = useToastStore();
  const [plans, setPlans] = useState<SaaSPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<SaaSPlan | null>(null);

  // Dynamic Features List State (display-only marketing bullets)
  const [featuresList, setFeaturesList] = useState<string[]>([]);
  const [newFeature, setNewFeature] = useState("");

  // Entitlements State (what the backend actually enforces)
  const [catalog, setCatalog] = useState<EntitlementCatalog | null>(null);
  const [entFeatures, setEntFeatures] = useState<Record<string, boolean>>({});
  const [entLimits, setEntLimits] = useState<Record<string, number>>({});

  // Form State
  const [formData, setFormData] = useState<SaaSPlan>({
    tier_id: "",
    name_en: "",
    name_ar: "",
    price: 0,
    currency: "USD",
    description_en: "",
    description_ar: "",
    features_en: "[]",
    features_ar: "[]",
    recommended: false,
    color: "brand",
    is_active: true
  });

  const fetchPlans = async () => {
    setIsLoading(true);
    try {
      const data = await apiGet("/admin/plans");
      setPlans((data as SaaSPlan[]) || []);
    } catch {
      toast.error(t('admin.fetchError'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Defer the initial fetch slightly to avoid synchronous setState inside useEffect
    // since isLoading is already initialized to true.
    const timer = setTimeout(() => {
      fetchPlans();
      apiGet("/admin/entitlement-catalog")
        .then((d) => setCatalog(d as EntitlementCatalog))
        .catch(() => {});
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOpenModal = (plan?: SaaSPlan) => {
    if (plan) {
      setEditingPlan(plan);
      setFormData(plan);
      try {
        setFeaturesList(JSON.parse(isRtl ? (plan.features_ar || "[]") : (plan.features_en || "[]")));
      } catch {
        setFeaturesList([]);
      }
      // Entitlements: the plan's own overrides, else the tier's built-in defaults.
      const tierDefaults = catalog?.defaults?.[plan.tier_id];
      setEntFeatures(
        plan.features && Object.keys(plan.features).length > 0
          ? plan.features
          : tierDefaults?.features || {}
      );
      setEntLimits(
        plan.limits && Object.keys(plan.limits).length > 0
          ? plan.limits
          : tierDefaults?.limits || {}
      );
    } else {
      setEditingPlan(null);
      setFormData({
        tier_id: "",
        name_en: "",
        name_ar: "",
        price: 0,
        currency: "USD",
        description_en: "",
        description_ar: "",
        features_en: "[]",
        features_ar: "[]",
        recommended: false,
        color: "brand",
        is_active: true
      });
      setFeaturesList(isRtl ? ["ميزة 1", "ميزة 2"] : ["Feature 1", "Feature 2"]);
      setEntFeatures(catalog?.defaults?.free?.features || {});
      setEntLimits(catalog?.defaults?.free?.limits || {});
    }
    setNewFeature("");
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const currentFeatures = JSON.stringify(featuresList);

      // Copy fields so backend doesn't complain about missing values
      const payload = {
        ...formData,
        name_en: !isRtl ? formData.name_en : (formData.name_en || formData.name_ar),
        name_ar: isRtl ? formData.name_ar : (formData.name_ar || formData.name_en),
        description_en: !isRtl ? formData.description_en : (formData.description_en || formData.description_ar),
        description_ar: isRtl ? formData.description_ar : (formData.description_ar || formData.description_en),
        features_en: !isRtl ? formData.features_en : (formData.features_en && formData.features_en !== "[]" ? formData.features_en : currentFeatures),
        features_ar: isRtl ? formData.features_ar : (formData.features_ar && formData.features_ar !== "[]" ? formData.features_ar : currentFeatures),
        // Entitlements the backend enforces (RequireFeature / quota limits).
        features: entFeatures,
        limits: entLimits,
      };

      if (editingPlan && editingPlan.id) {
        await apiPut(`/admin/plans/${editingPlan.id}`, payload);
        toast.success(t('admin.planUpdated'));
      } else {
        await apiPost("/admin/plans", payload);
        toast.success(t('admin.planCreated'));
      }
      setIsModalOpen(false);
      fetchPlans();
    } catch {
      toast.error(t('admin.userUpdateError'));
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm(t('admin.deleteConfirm'))) {
      try {
        await apiDelete(`/admin/plans/${id}`);
        toast.success(t('admin.planDeleted'));
        fetchPlans();
      } catch {
        toast.error(t('admin.deleteError'));
      }
    }
  };

  return (
    <div className="space-y-8 pb-12 text-slate-800 dark:text-slate-100 w-full" dir={isRtl ? "rtl" : "ltr"}>
      
      {/* Header Card - Premium Glassmorphism */}
      <div className="relative overflow-hidden rounded-[2rem] bg-white/60 dark:bg-slate-900/40 backdrop-blur-xl border border-white/40 dark:border-slate-800/60 shadow-lg shadow-slate-200/20 dark:shadow-none p-8 md:p-10">
        <div className="absolute -top-40 -end-40 w-96 h-96 bg-brand/10 rounded-full blur-[100px] pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-3">
              <Sparkles className="w-8 h-8 text-brand" />
              {t('admin.saasManager') || "SaaS Plans Manager"}
            </h1>
            <p className="text-slate-500 dark:text-slate-400 max-w-2xl text-sm font-medium">
              {isRtl 
                ? "إدارة باقات الاشتراك، تعديل الأسعار، التحكم بالمميزات، وتخصيص ألوان وتصنيفات كل باقة باحترافية."
                : "Manage subscription plans, edit prices, control features, and customize colors and tiers professionally."}
            </p>
          </div>
          
          <Button 
            onClick={() => handleOpenModal()} 
            className="bg-brand hover:bg-brand-hover text-white shadow-lg shadow-brand/25 ring-1 ring-white/20 transition-all rounded-xl h-12 px-6 font-bold"
          >
            <Plus className="w-5 h-5 me-2" />
            {t('admin.addPlan')}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center py-32">
          <Zap className="w-10 h-10 text-brand animate-pulse opacity-50" />
        </div>
      ) : plans.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white/50 dark:bg-slate-900/50 rounded-[2rem] border border-dashed border-slate-300 dark:border-slate-700">
          <ShieldCheck className="w-16 h-16 text-slate-300 dark:text-slate-600 mb-4" />
          <h3 className="text-xl font-bold mb-2">{t('admin.noPlans') || "No Plans Found"}</h3>
          <p className="text-slate-500 text-sm max-w-sm text-center">
            {isRtl ? "لم تقم بإضافة أي باقات اشتراك حتى الآن. ابدأ بإنشاء أول باقة لك." : "You haven't added any subscription plans yet. Start by creating your first plan."}
          </p>
          <Button onClick={() => handleOpenModal()} variant="outline" className="mt-6 font-bold rounded-xl">
            {t('admin.addPlan')}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 items-start">
          {plans.map((plan) => {
            let parsedFeaturesAr: string[] = [];
            let parsedFeaturesEn: string[] = [];
            try { parsedFeaturesAr = JSON.parse(plan.features_ar || "[]"); } catch {}
            try { parsedFeaturesEn = JSON.parse(plan.features_en || "[]"); } catch {}

            return (
              <div 
                key={plan.id}
                className={`relative bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-[2rem] p-8 border transition-all duration-300 flex flex-col h-full
                  ${!plan.is_active ? 'opacity-70 grayscale-[30%]' : ''}
                  ${plan.recommended 
                    ? "border-brand shadow-xl shadow-brand/10 md:-mt-4 ring-1 ring-brand/20" 
                    : "border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700"
                  }
                `}
              >
                {/* Status Badges */}
                <div className="absolute top-6 end-6 flex flex-col gap-2 items-end">
                  {!plan.is_active && (
                    <span className="flex items-center gap-1.5 text-rose-500 bg-rose-500/10 px-3 py-1 rounded-full text-xs font-bold border border-rose-500/20">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {t('admin.inactive')}
                    </span>
                  )}
                  {plan.recommended && (
                    <span className="flex items-center gap-1.5 text-white bg-gradient-to-r from-brand to-brand-hover px-3 py-1 rounded-full text-xs font-bold shadow-md shadow-brand/30">
                      <Sparkles className="w-3.5 h-3.5" />
                      {t('admin.recommended') || "Recommended"}
                    </span>
                  )}
                </div>

                <div className="mb-6 mt-2">
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`w-3 h-3 rounded-full bg-${plan.color}-500 shadow-[0_0_10px_rgba(0,0,0,0.2)] shadow-${plan.color}-500/50`} style={{ backgroundColor: plan.color === 'brand' ? '#6366f1' : plan.color }} />
                    <span className="text-xs font-bold tracking-widest text-slate-400 uppercase">{plan.tier_id}</span>
                  </div>
                  <h3 className="text-2xl font-black mb-2 text-slate-900 dark:text-white">
                    {isRtl ? plan.name_ar : plan.name_en}
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 min-h-[40px] leading-relaxed">
                    {isRtl ? plan.description_ar : plan.description_en}
                  </p>
                </div>

                <div className="mb-8 p-4 bg-slate-50 dark:bg-slate-950/50 rounded-2xl border border-slate-100 dark:border-slate-800/50">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-black tracking-tight text-slate-900 dark:text-white">
                      {plan.price === 0 ? (isRtl ? "مجاني" : "Free") : plan.price}
                    </span>
                    {plan.price > 0 && (
                      <span className="text-slate-500 font-bold">{plan.currency}</span>
                    )}
                  </div>
                  <span className="text-xs text-slate-400 font-medium mt-1 block">
                    / {isRtl ? "شهرياً للشركة" : "month per tenant"}
                  </span>
                </div>

                <div className="space-y-3 mb-8 flex-1">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
                    {isRtl ? "المميزات المضمنة" : "Included Features"}
                  </h4>
                  {(isRtl ? parsedFeaturesAr : parsedFeaturesEn).map((feat, idx) => (
                    <div key={idx} className="flex items-start gap-3">
                      <div className={`mt-0.5 p-1 rounded-full ${plan.recommended ? 'bg-brand/10 text-brand' : 'bg-emerald-500/10 text-emerald-500'}`}>
                        <Check className="w-3 h-3" />
                      </div>
                      <span className="text-sm text-slate-700 dark:text-slate-300 font-medium leading-relaxed">{feat}</span>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-3 pt-6 border-t border-slate-100 dark:border-slate-800">
                  <Button 
                    onClick={() => handleOpenModal(plan)} 
                    variant="outline" 
                    className="flex-1 rounded-xl h-11 font-bold border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                  >
                    <Edit2 className="w-4 h-4 me-2" />
                    {isRtl ? "تعديل" : "Edit"}
                  </Button>
                  <Button 
                    onClick={() => handleDelete(plan.id!)} 
                    variant="outline" 
                    className="flex-none rounded-xl h-11 w-11 p-0 border-rose-200 dark:border-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-900/30 text-rose-500 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modern Edit/Create Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-3xl p-0 overflow-hidden bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-2xl rounded-[2rem]" dir={isRtl ? "rtl" : "ltr"}>
          <DialogHeader className="p-8 md:p-10 pb-0">
            <DialogTitle className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-3">
              <Sparkles className="w-6 h-6 text-brand" />
              {editingPlan ? (isRtl ? "تعديل الباقة" : "Edit Plan") : (isRtl ? "إضافة باقة جديدة" : "Add New Plan")}
            </DialogTitle>
            <DialogDescription className="text-slate-500 dark:text-slate-400 mt-2 text-base">
              {isRtl ? "قم بتخصيص تفاصيل الباقة، الأسعار، والمميزات التي ستظهر للعملاء." : "Customize the plan details, pricing, and features shown to customers."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSave} className="p-8 md:p-10 space-y-10 overflow-y-auto max-h-[70vh]">
            {/* Toggles */}
            <div className="flex flex-wrap items-center gap-8 p-6 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-800">
              <label className="flex items-center gap-3 cursor-pointer group">
                <div className={`w-14 h-7 rounded-full transition-colors relative flex items-center shrink-0 ${formData.is_active ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'}`}>
                  <input type="checkbox" checked={formData.is_active} onChange={e => setFormData({...formData, is_active: e.target.checked})} className="hidden" />
                  <div className={`w-5 h-5 bg-white rounded-full shadow-sm absolute transition-all ${formData.is_active ? (isRtl ? 'start-1' : 'start-8') : (isRtl ? 'start-8' : 'start-1')}`} />
                </div>
                <span className="text-base font-bold text-slate-700 dark:text-slate-300 group-hover:text-emerald-500 transition-colors">
                  {t('admin.active') || "Active (Visible)"}
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer group">
                <div className={`w-14 h-7 rounded-full transition-colors relative flex items-center shrink-0 ${formData.recommended ? 'bg-brand' : 'bg-slate-300 dark:bg-slate-700'}`}>
                  <input type="checkbox" checked={formData.recommended} onChange={e => setFormData({...formData, recommended: e.target.checked})} className="hidden" />
                  <div className={`w-5 h-5 bg-white rounded-full shadow-sm absolute transition-all ${formData.recommended ? (isRtl ? 'start-1' : 'start-8') : (isRtl ? 'start-8' : 'start-1')}`} />
                </div>
                <span className="text-base font-bold text-slate-700 dark:text-slate-300 group-hover:text-brand transition-colors">
                  {t('admin.recommended') || "Recommended Badge"}
                </span>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-3">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t('admin.planTier') || "الرمز (TIER ID)"}</label>
                <input required value={formData.tier_id} onChange={e => setFormData({...formData, tier_id: e.target.value})} placeholder="e.g. starter, pro, enterprise" className="w-full px-5 h-14 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-base font-medium focus:ring-2 focus:ring-brand focus:border-transparent outline-none transition-all shadow-sm" />
              </div>

              <div className="space-y-3">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t('admin.planColor') || "Color Theme"}</label>
                <div className="flex flex-wrap gap-4 h-14 items-center">
                  {['brand', 'blue', 'emerald', 'violet', 'rose', 'amber'].map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setFormData({...formData, color})}
                      className={`shrink-0 w-10 h-10 rounded-full transition-all flex items-center justify-center ${formData.color === color ? 'ring-4 ring-offset-2 ring-offset-white dark:ring-offset-slate-950 ring-slate-900 dark:ring-white scale-110' : 'hover:scale-110 shadow-sm'}`}
                      style={{ backgroundColor: color === 'brand' ? '#6366f1' : `var(--${color}-500, ${color})` }}
                    >
                      {formData.color === color && <Check className="w-5 h-5 text-white shadow-sm" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{isRtl ? "الاسم" : "Name"}</label>
                <input required value={isRtl ? formData.name_ar : formData.name_en} onChange={e => setFormData(isRtl ? {...formData, name_ar: e.target.value} : {...formData, name_en: e.target.value})} className="w-full px-5 h-14 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-lg font-bold focus:ring-2 focus:ring-brand focus:border-transparent outline-none transition-all shadow-sm" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t('admin.planPrice') || "السعر"}</label>
                  <input required type="number" step="0.01" value={formData.price} onChange={e => setFormData({...formData, price: parseFloat(e.target.value)})} className="w-full px-5 h-14 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xl font-black focus:ring-2 focus:ring-brand focus:border-transparent outline-none transition-all shadow-sm" />
                </div>
                <div className="space-y-3">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t('admin.planCurrency') || "العملة"}</label>
                  <input required value={formData.currency} onChange={e => setFormData({...formData, currency: e.target.value})} className="w-full px-5 h-14 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-base font-bold uppercase focus:ring-2 focus:ring-brand focus:border-transparent outline-none transition-all shadow-sm" />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{isRtl ? "الوصف" : "Description"}</label>
              <textarea required value={isRtl ? formData.description_ar : formData.description_en} onChange={e => setFormData(isRtl ? {...formData, description_ar: e.target.value} : {...formData, description_en: e.target.value})} className="w-full p-5 h-32 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-base font-medium focus:ring-2 focus:ring-brand focus:border-transparent outline-none transition-all resize-none shadow-sm" />
            </div>

            <div className="space-y-4">
              <label className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                {isRtl ? "المميزات المضمنة" : "Included Features"}
              </label>
              
              <div className="space-y-3">
                {featuresList.map((feat, idx) => (
                  <div key={idx} className="flex items-center gap-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 p-3 rounded-xl group transition-all hover:shadow-sm">
                    <div className="w-8 h-8 rounded-full bg-brand/10 text-brand flex items-center justify-center shrink-0">
                      <Check className="w-4 h-4" />
                    </div>
                    <span className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-300">{feat}</span>
                    <button 
                      type="button" 
                      onClick={() => setFeaturesList(featuresList.filter((_, i) => i !== idx))}
                      className="w-8 h-8 rounded-full hover:bg-rose-100 dark:hover:bg-rose-500/20 text-slate-400 hover:text-rose-500 flex items-center justify-center transition-colors md:opacity-0 group-hover:opacity-100"
                      title={isRtl ? "حذف" : "Delete"}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}

                {featuresList.length === 0 && (
                  <div className="text-center py-6 bg-slate-50/50 dark:bg-slate-900/20 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-slate-400 text-sm">
                    {isRtl ? "لا توجد مميزات مضافة بعد" : "No features added yet"}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <input 
                    type="text" 
                    value={newFeature}
                    onChange={(e) => setNewFeature(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (newFeature.trim()) {
                          setFeaturesList([...featuresList, newFeature.trim()]);
                          setNewFeature("");
                        }
                      }
                    }}
                    placeholder={isRtl ? "اكتب الميزة واضغط Enter..." : "Type feature and press Enter..."}
                    className="flex-1 px-4 h-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-brand focus:border-transparent outline-none transition-all shadow-sm"
                  />
                  <Button 
                    type="button"
                    onClick={() => {
                      if (newFeature.trim()) {
                        setFeaturesList([...featuresList, newFeature.trim()]);
                        setNewFeature("");
                      }
                    }}
                    className="h-12 px-6 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold rounded-xl shadow-md transition-all"
                  >
                    <Plus className="w-4 h-4 me-2" />
                    {isRtl ? "إضافة" : "Add"}
                  </Button>
                </div>
              </div>
            </div>

            {/* ─── Entitlements: what the backend actually enforces ─── */}
            <div className="pt-8 border-t border-slate-200 dark:border-slate-800 space-y-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-brand shrink-0" />
                  {isRtl ? "صلاحيات الباقة (تُطبَّق فعلياً)" : "Plan Entitlements (enforced)"}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  {isRtl
                    ? "المميزات التي تُفتح والحدود التي تُطبَّق على مساحات العمل المشتركة في هذه الباقة."
                    : "Features unlocked and limits enforced for workspaces on this plan."}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(catalog?.feature_keys || []).map((key) => {
                  const on = !!entFeatures[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setEntFeatures({ ...entFeatures, [key]: !on })}
                      className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl border transition-colors text-start ${
                        on
                          ? "border-brand bg-brand/5 text-slate-900 dark:text-white"
                          : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400"
                      }`}
                    >
                      <span className="text-sm font-mono truncate">{key}</span>
                      <span className={`w-10 h-5 rounded-full relative shrink-0 transition-colors ${on ? "bg-brand" : "bg-slate-300 dark:bg-slate-700"}`}>
                        <span className={`w-4 h-4 bg-white rounded-full shadow absolute top-0.5 transition-all ${on ? "start-5" : "start-0.5"}`} />
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {(catalog?.limit_keys || []).map((key) => (
                  <div key={key}>
                    <label htmlFor={`limit-${key}`} className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 font-mono">
                      {key}
                    </label>
                    <input
                      id={`limit-${key}`}
                      type="number"
                      value={entLimits[key] ?? 0}
                      onChange={(e) => setEntLimits({ ...entLimits, [key]: Number(e.target.value) })}
                      className="w-full h-11 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-400">{isRtl ? "استخدم القيمة -1 لغير محدود." : "Use -1 for unlimited."}</p>
            </div>

            <div className="pt-8 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-4">
              <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)} className="h-14 px-8 text-base font-bold rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800">
                {isRtl ? "إلغاء" : "Cancel"}
              </Button>
              <Button type="submit" className="h-14 px-10 bg-brand hover:bg-brand-hover text-white text-base font-bold rounded-xl shadow-xl shadow-brand/30 transition-all hover:scale-105 active:scale-95">
                <Check className="w-6 h-6 me-2" />
                {isRtl ? "حفظ الباقة" : "Save Plan"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
