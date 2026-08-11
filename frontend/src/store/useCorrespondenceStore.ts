import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiGet, apiPost, apiPut, apiDelete, getCurrentWorkspaceId } from '../lib/apiClient';

export interface CorrespondenceTemplate {
  id: string;
  workspace_id: string;
  name: string;
  type: string; // 'internal_memo' | 'external_letter' | 'decree' | 'circular'
  header_html: string;
  footer_html: string;
  layout_config: {
    logo_url?: string;
    logo_base64?: string; // Custom uploaded base64 logo for the project/organization
    font_size_header?: number; // e.g. 18 (pt)
    font_size_body?: number; // e.g. 14 (pt)
    font_size_footer?: number; // e.g. 10 (pt)
    font_weight?: 'normal' | 'medium' | 'bold' | 'black';
    font_style?: 'normal' | 'italic';
    font_color?: string; // HEX color or preset e.g. #000000, #1e293b, #1e3a8a, #065f46, #7f1d1d
    header_layout_preset?: 'split_classic' | 'modern_banner' | 'minimalist_emblem';
    footer_disclaimer_text?: string;
    show_qr?: boolean;
    show_serial?: boolean;
    margin_top?: number;
    margin_bottom?: number;
    font_family?: string;
    // Sovereign Canvas block visibility & customization tokens
    show_tax_id?: boolean;
    tax_id_value?: string;
    show_commercial_reg?: boolean;
    commercial_reg_value?: string;
    show_hijri_date?: boolean;
    show_gregorian_date?: boolean;
    show_confidentiality?: boolean;
    show_urgent?: boolean;
    header_title_ar?: string;
    header_title_en?: string;
    header_subtitle?: string;
    header_border?: boolean;
    qr_position?: 'bottom-left' | 'bottom-right' | 'bottom-center';
    qr_size_mm?: number;
    show_hmac_checksum?: boolean;
    show_signature_box?: boolean;
    signatory_title?: string;
    footer_text?: string;
    show_page_numbers?: boolean;
    // Sovereign Header & Footer Studio customization tokens
    header_bg_type?: 'transparent' | 'solid' | 'gradient' | 'boxed';
    header_bg_color?: string;
    header_bg_gradient_start?: string;
    header_bg_gradient_end?: string;
    header_divider_thickness?: number;
    header_divider_style?: 'solid' | 'double' | 'dashed' | 'gradient';
    header_logo_align?: 'start' | 'center' | 'end';
    header_font_slant?: 'normal' | 'italic';
    footer_font_slant?: 'normal' | 'italic';
    footer_font_color?: string;
  };
  created_at?: string;
  updated_at?: string;
}

export interface CorrespondenceForwardLog {
  id: string;
  correspondence_id: string;
  from_user_id: string;
  to_user_id: string;
  to_node_path: string;
  note?: string;
  action_required?: string;
  created_at?: string;
}

export interface Correspondence {
  id: string;
  workspace_id: string;
  serial_number: string;
  title: string;
  content: string;
  status: string; // 'draft' | 'pending_signature' | 'signed' | 'archived'
  template_id?: string;
  confidentiality: string; // 'public' | 'confidential' | 'top_secret'
  urgent: boolean;
  signed_by?: string;
  signed_at?: string;
  qr_code?: string;
  forwarding_path: string;
  created_at?: string;
  updated_at?: string;
  forward_logs?: CorrespondenceForwardLog[];
}

interface CorrespondenceState {
  templates: CorrespondenceTemplate[];
  correspondences: Correspondence[];
  activeTab: 'dashboard' | 'designer' | 'editor' | 'archive';
  selectedTemplate: CorrespondenceTemplate | null;
  selectedCorrespondence: Correspondence | null;
  loading: boolean;
  searchQuery: string;
  filterStatus: string;
  filterConfidentiality: string;

  // Actions
  setActiveTab: (tab: 'dashboard' | 'designer' | 'editor' | 'archive') => void;
  setSelectedTemplate: (template: CorrespondenceTemplate | null) => void;
  setSelectedCorrespondence: (item: Correspondence | null) => void;
  setSearchQuery: (query: string) => void;
  setFilterStatus: (status: string) => void;
  setFilterConfidentiality: (conf: string) => void;

  // API Callbacks
  fetchTemplates: () => Promise<void>;
  createTemplate: (data: Partial<CorrespondenceTemplate>) => Promise<CorrespondenceTemplate>;
  updateTemplate: (id: string, data: Partial<CorrespondenceTemplate>) => Promise<CorrespondenceTemplate>;
  deleteTemplate: (id: string) => Promise<void>;

  fetchCorrespondences: (params?: { status?: string; search?: string; limit?: number }) => Promise<void>;
  fetchCorrespondenceById: (id: string) => Promise<Correspondence>;
  createCorrespondence: (data: Partial<Correspondence>) => Promise<Correspondence>;
  signCorrespondence: (id: string) => Promise<{ qr_code: string; signed_at: string }>;
  forwardCorrespondence: (id: string, data: { to_user_id: string; to_node_path: string; note?: string; action_required?: string }) => Promise<void>;
  archiveCorrespondence: (id: string) => Promise<void>;

  // AI Helpers
  aiRewrite: (title: string, content: string, tone?: string) => Promise<{ rewritten_title: string; rewritten_content: string; suggestions?: string[] }>;
  aiAudit: (title: string, content: string) => Promise<{ compliance_score: number; legal_risks: string[]; formatting_suggestions: string[] }>;
}

const PRELOADED_TEMPLATES: CorrespondenceTemplate[] = [
  {
    id: 'tpl_project_sovereign',
    workspace_id: 'default',
    name: 'قالب مراسلات المشروع الرسمية الموحد (Sovereign Project Letter)',
    type: 'external_letter',
    header_html: '',
    footer_html: '',
    layout_config: {
      header_title_ar: 'إدارة العمليات والمراسلات الرسمية',
      header_title_en: 'Sovereign Operations & Official Correspondence',
      header_subtitle: 'نظام إدارة المراسلات والقرارات السيادية للمشاريع',
      header_layout_preset: 'modern_banner',
      font_size_header: 18,
      font_size_body: 14,
      font_size_footer: 10,
      font_weight: 'bold',
      font_color: '#1e293b',
      show_qr: true,
      show_serial: true,
      show_hijri_date: true,
      show_gregorian_date: true,
      show_confidentiality: true,
      footer_disclaimer_text: 'هذه المراسلة وثيقة سيادية معتمدة ومحمية بموجب بروتوكولات الأرشفة والتوقيع الرقمي للمشروع.',
      qr_position: 'bottom-left',
      qr_size_mm: 26,
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'tpl_project_decree',
    workspace_id: 'default',
    name: 'قالب القرارات والتعميمات التنظيمية (Project Decree & Circular)',
    type: 'decree',
    header_html: '',
    footer_html: '',
    layout_config: {
      header_title_ar: 'المكتب التنفيذي - قرارات وتعاميم المشروع',
      header_title_en: 'Executive Office - Project Decrees & Circulars',
      header_subtitle: 'قرار إداري داخلي وتكليف مهام رسمية',
      header_layout_preset: 'split_classic',
      font_size_header: 20,
      font_size_body: 15,
      font_size_footer: 10,
      font_weight: 'black',
      font_color: '#065f46',
      show_qr: true,
      show_serial: true,
      show_hijri_date: true,
      show_gregorian_date: true,
      show_urgent: true,
      footer_disclaimer_text: 'يعمل بهذا التعميم والقرار فور صدروه وتعميده عبر القنوات المؤسسية الرسمية.',
      qr_position: 'bottom-right',
      qr_size_mm: 28,
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'tpl_project_contract',
    workspace_id: 'default',
    name: 'قالب مذكرات التفاهم والاتفاقيات الذكية (Smart Agreement & MOU)',
    type: 'internal_memo',
    header_html: '',
    footer_html: '',
    layout_config: {
      header_title_ar: 'إدارة الشؤون التعاقدية والمناقصات الرسمية',
      header_title_en: 'Contractual Affairs & Smart Tendering Directorate',
      header_subtitle: 'وثيقة تفاهم وعقد خدمة فني معتمد',
      header_layout_preset: 'minimalist_emblem',
      font_size_header: 16,
      font_size_body: 13,
      font_size_footer: 9,
      font_weight: 'medium',
      font_color: '#1e3a8a',
      show_qr: true,
      show_serial: true,
      show_hijri_date: false,
      show_gregorian_date: true,
      show_confidentiality: true,
      footer_disclaimer_text: 'تخضع هذه الاتفاقية لأحكام وبنود الحوكمة الذكية للمشروع وتعتبر ملزمة عند توقيع الأطراف.',
      qr_position: 'bottom-center',
      qr_size_mm: 24,
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export const useCorrespondenceStore = create<CorrespondenceState>()(
  persist(
    (set, get) => ({
      templates: PRELOADED_TEMPLATES,
      correspondences: [],
      activeTab: 'dashboard',
      selectedTemplate: PRELOADED_TEMPLATES[0] || null,
      selectedCorrespondence: null,
      loading: false,
      searchQuery: '',
      filterStatus: 'all',
      filterConfidentiality: 'all',

      setActiveTab: (tab) => set({ activeTab: tab }),
      setSelectedTemplate: (template) => set({ selectedTemplate: template }),
      setSelectedCorrespondence: (item) => set({ selectedCorrespondence: item }),
      setSearchQuery: (query) => set({ searchQuery: query }),
      setFilterStatus: (status) => set({ filterStatus: status }),
      setFilterConfidentiality: (conf) => set({ filterConfidentiality: conf }),

      fetchTemplates: async () => {
        set({ loading: true });
        try {
          const res = await apiGet<{ data?: CorrespondenceTemplate[] } | CorrespondenceTemplate[]>('/correspondence-templates');
          const list = ('data' in res && Array.isArray(res.data)) ? res.data : (Array.isArray(res) ? res : []);
          if (list.length > 0) {
            set({ templates: list });
          } else if (get().templates.length === 0) {
            set({ templates: PRELOADED_TEMPLATES });
          }
        } catch (err) {
          console.warn('Backend API not reached or error fetching templates, preserving local-first state:', err);
          if (get().templates.length === 0) {
            set({ templates: PRELOADED_TEMPLATES });
          }
        } finally {
          set({ loading: false });
        }
      },

      createTemplate: async (data) => {
        set({ loading: true });
        try {
          const res = await apiPost<{ data?: CorrespondenceTemplate } | CorrespondenceTemplate>('/correspondence-templates', data);
          const newTpl = ('data' in res && res.data) ? res.data : (res as CorrespondenceTemplate);
          set((state) => ({ templates: [newTpl, ...state.templates], selectedTemplate: newTpl }));
          return newTpl;
        } catch (err) {
          console.warn('API error saving template, persisting locally via local-first fallback:', err);
          const newTpl: CorrespondenceTemplate = {
            id: data.id || `tpl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            workspace_id: data.workspace_id || getCurrentWorkspaceId(),
            name: data.name || 'قالب مراسلات مخصص (Custom Template)',
            type: data.type || 'external_letter',
            header_html: data.header_html || '',
            footer_html: data.footer_html || '',
            layout_config: data.layout_config || {},
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          set((state) => ({ templates: [newTpl, ...state.templates], selectedTemplate: newTpl }));
          return newTpl;
        } finally {
          set({ loading: false });
        }
      },

      updateTemplate: async (id, data) => {
        set({ loading: true });
        try {
          const res = await apiPut<{ data?: CorrespondenceTemplate } | CorrespondenceTemplate>(`/correspondence-templates/${id}`, data);
          const updated = ('data' in res && res.data) ? res.data : (res as CorrespondenceTemplate);
          set((state) => ({
            templates: state.templates.map((t) => (t.id === id ? updated : t)),
            selectedTemplate: state.selectedTemplate?.id === id ? updated : state.selectedTemplate,
          }));
          return updated;
        } catch (err) {
          console.warn('API error updating template, updating locally via local-first fallback:', err);
          const current = get().templates.find((t) => t.id === id) || PRELOADED_TEMPLATES[0] || {
            id,
            workspace_id: getCurrentWorkspaceId(),
            name: 'قالب مخصص',
            type: 'external_letter',
            header_html: '',
            footer_html: '',
            layout_config: {},
          };
          const updated: CorrespondenceTemplate = {
            id,
            workspace_id: current.workspace_id || getCurrentWorkspaceId(),
            name: data.name ?? current.name ?? 'قالب مخصص',
            type: data.type ?? current.type ?? 'external_letter',
            header_html: data.header_html ?? current.header_html ?? '',
            footer_html: data.footer_html ?? current.footer_html ?? '',
            layout_config: { ...current.layout_config, ...data.layout_config },
            created_at: current.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          set((state) => ({
            templates: state.templates.map((t) => (t.id === id ? updated : t)),
            selectedTemplate: state.selectedTemplate?.id === id ? updated : state.selectedTemplate,
          }));
          return updated;
        } finally {
          set({ loading: false });
        }
      },

      deleteTemplate: async (id) => {
        set({ loading: true });
        try {
          await apiDelete(`/correspondence-templates/${id}`);
        } catch (err) {
          console.warn('API error deleting template, deleting locally via local-first fallback:', err);
        } finally {
          set((state) => ({
            templates: state.templates.filter((t) => t.id !== id),
            selectedTemplate: state.selectedTemplate?.id === id ? null : state.selectedTemplate,
          }));
          set({ loading: false });
        }
      },

  fetchCorrespondences: async (params) => {
    set({ loading: true });
    try {
      let query = '';
      if (params) {
        const qParams = new URLSearchParams();
        if (params.status && params.status !== 'all') qParams.append('status', params.status);
        if (params.search) qParams.append('search', params.search);
        if (params.limit) qParams.append('limit', params.limit.toString());
        query = qParams.toString() ? `?${qParams.toString()}` : '';
      }
      const res = await apiGet<{ data?: Correspondence[] } | Correspondence[]>(`/correspondences${query}`);
      const list = ('data' in res && Array.isArray(res.data)) ? res.data : (Array.isArray(res) ? res : []);
      set({ correspondences: list });
    } catch (err) {
      console.error('Failed to fetch correspondences:', err);
    } finally {
      set({ loading: false });
    }
  },

  fetchCorrespondenceById: async (id) => {
    set({ loading: true });
    try {
      const res = await apiGet<{ data?: Correspondence } | Correspondence>(`/correspondences/${id}`);
      const item = ('data' in res && res.data) ? res.data : (res as Correspondence);
      set({ selectedCorrespondence: item });
      return item;
    } finally {
      set({ loading: false });
    }
  },

  createCorrespondence: async (data) => {
    set({ loading: true });
    try {
      const res = await apiPost<{ data?: Correspondence } | Correspondence>('/correspondences', data);
      const newItem = ('data' in res && res.data) ? res.data : (res as Correspondence);
      set((state) => ({
        correspondences: [newItem, ...state.correspondences],
        selectedCorrespondence: newItem,
      }));
      return newItem;
    } finally {
      set({ loading: false });
    }
  },

  signCorrespondence: async (id) => {
    set({ loading: true });
    try {
      const res = await apiPost<{ data?: { qr_code: string; signed_at: string }; qr_code?: string; signed_at?: string }>(`/correspondences/${id}/sign`, {});
      const result = ('data' in res && res.data) ? res.data : { qr_code: res.qr_code || '', signed_at: res.signed_at || '' };
      set((state) => ({
        correspondences: state.correspondences.map((c) =>
          c.id === id ? { ...c, status: 'signed', qr_code: result.qr_code, signed_at: result.signed_at } : c
        ),
        selectedCorrespondence:
          state.selectedCorrespondence?.id === id
            ? { ...state.selectedCorrespondence, status: 'signed', qr_code: result.qr_code, signed_at: result.signed_at }
            : state.selectedCorrespondence,
      }));
      return result;
    } finally {
      set({ loading: false });
    }
  },

  forwardCorrespondence: async (id, data) => {
    set({ loading: true });
    try {
      await apiPost(`/correspondences/${id}/forward`, data);
      await get().fetchCorrespondenceById(id);
    } finally {
      set({ loading: false });
    }
  },

  archiveCorrespondence: async (id) => {
    set({ loading: true });
    try {
      await apiPost(`/correspondences/${id}/archive`, {});
      set((state) => ({
        correspondences: state.correspondences.map((c) => (c.id === id ? { ...c, status: 'archived' } : c)),
        selectedCorrespondence:
          state.selectedCorrespondence?.id === id ? { ...state.selectedCorrespondence, status: 'archived' } : state.selectedCorrespondence,
      }));
    } finally {
      set({ loading: false });
    }
  },

  // Endpoint paths passed to apiPost are relative to API_BASE_URL (/api/v1) — do
  // NOT prefix them with /api/v1. These two carried the prefix, so the request
  // went to /api/v1/api/v1/ai/correspondence/* and 404'd: letter audit and
  // rewrite were dead from the UI while the sidecar handlers worked fine.
  // workspace_id in the body is ignored by the sidecar (it trusts the JWT-stamped
  // X-Workspace-Id header); it is left here only to match the request schema.
  aiRewrite: async (title, content, tone = 'formal_institutional') => {
    const workspaceId = getCurrentWorkspaceId();
    const res = await apiPost<{ data?: { rewritten_title: string; rewritten_content: string; suggestions?: string[] }; rewritten_title?: string; rewritten_content?: string; suggestions?: string[] }>(`/ai/correspondence/rewrite`, {
      workspace_id: workspaceId,
      title,
      content,
      tone,
    });
    const result = ('data' in res && res.data)
      ? res.data
      : {
          rewritten_title: res.rewritten_title,
          rewritten_content: res.rewritten_content,
          suggestions: res.suggestions,
        };
    if (!result.rewritten_title || !result.rewritten_content) {
      throw new Error('Incomplete AI correspondence rewrite response');
    }
    return {
      rewritten_title: result.rewritten_title,
      rewritten_content: result.rewritten_content,
      suggestions: result.suggestions,
    };
  },

  aiAudit: async (title, content) => {
    const workspaceId = getCurrentWorkspaceId();
    const res = await apiPost<{ data?: { compliance_score: number; legal_risks: string[]; formatting_suggestions: string[] }; compliance_score?: number; legal_risks?: string[]; formatting_suggestions?: string[] }>(`/ai/correspondence/audit`, {
      workspace_id: workspaceId,
      title,
      content,
    });
    const result = ('data' in res && res.data)
      ? res.data
      : {
          compliance_score: res.compliance_score,
          legal_risks: res.legal_risks,
          formatting_suggestions: res.formatting_suggestions,
        };
    if (
      typeof result.compliance_score !== 'number'
      || !Array.isArray(result.legal_risks)
      || !Array.isArray(result.formatting_suggestions)
    ) {
      throw new Error('Incomplete AI correspondence audit response');
    }
    return {
      compliance_score: result.compliance_score,
      legal_risks: result.legal_risks,
      formatting_suggestions: result.formatting_suggestions,
    };
  },
}), { name: 'septimus_correspondence_state' }) );
