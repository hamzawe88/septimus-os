import React, { useState, useEffect } from "react";
import { Save, Key, Globe, CreditCard, Loader2 } from "lucide-react";
import { useLocalization } from "@/contexts/LocalizationContext";
import { Button } from "@/components/ui/button";
import { apiGet, apiPut } from "@/lib/apiClient";
import { useToastStore } from "@/store/useToastStore";

interface PaymentGateway {
  id: string;
  gateway_name: string;
  is_active: boolean;
  is_test_mode: boolean;
  credentials: Record<string, string>;
  currency: string;
  sort_order: number;
}

export default function PaymentSettings() {
  const { t, isRtl } = useLocalization();
  const { toast } = useToastStore();
  const [gateways, setGateways] = useState<PaymentGateway[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState<string | null>(null); // Gateway ID being saved

  const fetchGateways = async () => {
    setIsLoading(true);
    try {
      const data = await apiGet("/admin/payment-gateways");
      setGateways(data as PaymentGateway[]);
    } catch {
      toast.error(t('admin.fetchError', 'Failed to fetch settings'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchGateways();
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCredentialChange = (id: string, key: string, value: string) => {
    setGateways(prev => prev.map(g => {
      if (g.id === id) {
        return {
          ...g,
          credentials: {
            ...g.credentials,
            [key]: value
          }
        };
      }
      return g;
    }));
  };

  const handleSettingChange = (id: string, field: keyof PaymentGateway, value: string | boolean) => {
    setGateways(prev => prev.map(g => {
      if (g.id === id) {
        return { ...g, [field]: value };
      }
      return g;
    }));
  };

  const handleSave = async (gateway: PaymentGateway) => {
    setIsSaving(gateway.id);
    try {
      await apiPut(`/admin/payment-gateways/${gateway.id}`, {
        is_active: gateway.is_active,
        is_test_mode: gateway.is_test_mode,
        currency: gateway.currency,
        credentials: gateway.credentials,
      });
      toast.success(t('admin.settingsSaved', 'Settings saved successfully!'));
    } catch {
      toast.error(t('admin.saveError', 'Failed to save settings'));
    } finally {
      setIsSaving(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-brand" />
      </div>
    );
  }

  return (
    <div className="space-y-6" dir={isRtl ? "rtl" : "ltr"}>
      <div>
        <h2 className="text-2xl font-bold text-foreground dark:text-white mb-2 flex items-center gap-2">
          <CreditCard className="w-6 h-6 text-brand" />
          {t('admin.paymentGateways', 'Payment Gateways')}
        </h2>
        <p className="text-muted-foreground dark:text-muted-foreground">
          Configure payment integrations like Stripe, Moamalat, and OnePay to accept subscriptions.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {gateways.map(gateway => (
          <div key={gateway.id} className={`bg-card dark:bg-[#1a1a1a] rounded-xl border transition-all ${gateway.is_active ? 'border-brand shadow-md shadow-brand/5' : 'border-border dark:border-slate-800 shadow-sm'} p-6 relative overflow-hidden`}>
            {/* Header */}
            <div className="flex justify-between items-start mb-6 pb-6 border-b border-border dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold text-white shadow-inner
                  ${gateway.gateway_name === 'stripe' ? 'bg-[#635BFF]' : 
                    gateway.gateway_name === 'moamalat' ? 'bg-[#005138]' : 'bg-[#E31837]'}`}>
                  {gateway.gateway_name.substring(0, 1).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-foreground dark:text-white capitalize">
                    {gateway.gateway_name}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${gateway.is_active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' : 'bg-muted text-muted-foreground dark:bg-slate-800 dark:text-muted-foreground'}`}>
                      {gateway.is_active ? 'Active' : 'Inactive'}
                    </span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${gateway.is_test_mode ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400'}`}>
                      {gateway.is_test_mode ? 'Test Mode' : 'Live Mode'}
                    </span>
                  </div>
                </div>
              </div>
              <label className="flex items-center cursor-pointer">
                <div className="relative">
                  <input type="checkbox" className="sr-only" checked={gateway.is_active} onChange={(e) => handleSettingChange(gateway.id, 'is_active', e.target.checked)} />
                  <div className={`block w-14 h-8 rounded-full transition-colors ${gateway.is_active ? 'bg-brand' : 'bg-slate-300 dark:bg-slate-700'}`}></div>
                  <div className={`dot absolute left-1 top-1 bg-card w-6 h-6 rounded-full transition-transform ${gateway.is_active ? 'transform translate-x-6' : ''}`}></div>
                </div>
              </label>
            </div>

            {/* Form */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground dark:text-slate-300 flex items-center gap-2">
                    <Globe className="w-4 h-4" /> Mode
                  </label>
                  <select 
                    value={gateway.is_test_mode ? "true" : "false"} 
                    onChange={(e) => handleSettingChange(gateway.id, 'is_test_mode', e.target.value === "true")}
                    className="w-full p-2.5 bg-muted dark:bg-[#121212] border border-border dark:border-slate-800 rounded-lg text-sm focus:ring-2 focus:ring-brand focus:border-brand"
                  >
                    <option value="true">Test (Sandbox)</option>
                    <option value="false">Live (Production)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground dark:text-slate-300">Default Currency</label>
                  <select 
                    value={gateway.currency} 
                    onChange={(e) => handleSettingChange(gateway.id, 'currency', e.target.value)}
                    className="w-full p-2.5 bg-muted dark:bg-[#121212] border border-border dark:border-slate-800 rounded-lg text-sm focus:ring-2 focus:ring-brand focus:border-brand"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="LYD">LYD (د.ل)</option>
                    <option value="EUR">EUR (€)</option>
                  </select>
                </div>
              </div>

              <div className="pt-2">
                <h4 className="text-sm font-bold text-foreground dark:text-white mb-3 flex items-center gap-2">
                  <Key className="w-4 h-4 text-muted-foreground" /> API Credentials
                </h4>
                <div className="space-y-3">
                  {Object.keys(gateway.credentials).map(key => (
                    <div key={key}>
                      <label className="block text-xs font-medium text-muted-foreground dark:text-muted-foreground mb-1 capitalize">
                        {key.replace(/_/g, ' ')}
                      </label>
                      <input 
                        type={key.includes('secret') ? 'password' : 'text'}
                        value={gateway.credentials[key] || ''}
                        onChange={(e) => handleCredentialChange(gateway.id, key, e.target.value)}
                        placeholder={`Enter ${key.replace(/_/g, ' ')}`}
                        className="w-full p-2.5 bg-muted dark:bg-[#121212] border border-border dark:border-slate-800 rounded-lg text-sm focus:ring-2 focus:ring-brand focus:border-brand font-mono"
                        dir="ltr"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 flex justify-end">
                <Button 
                  onClick={() => handleSave(gateway)} 
                  disabled={isSaving === gateway.id}
                  className="bg-brand hover:bg-brand/90 text-white min-w-[120px]"
                >
                  {isSaving === gateway.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Save Changes
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
