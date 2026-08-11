import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Bot, User, Sparkles, Loader2, Maximize2, Minimize2, Zap } from 'lucide-react';
import type { PublicationContext, Subscription } from 'centrifuge';
import { apiPost, AI_BASE_URL } from '@/lib/apiClient';
import { useLocalization } from '@/contexts/LocalizationContext';
import { useAppStore } from '@/store/useAppStore';

// These strings are sent as `agent_type` and resolved by the sidecar's alias
// table (`agent_rbac._ALIASES`). Keep them in sync: a name the table does not
// know now resolves to the *least* privileged family, so a typo here silently
// produces an agent with no domain tools rather than a working specialist.
//
// 'tasks' and 'correspondence' were missing, which is why the project-management
// agent appeared not to exist — the sidecar has had a "Tasks & Sprints
// Specialist" all along with no way to reach it from the UI.
export type AgentType =
  | 'crm'
  | 'hr'
  | 'tasks'
  | 'correspondence'
  | 'finance'
  | 'general'
  | 'supervisor';

interface AgentChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  agentType: AgentType;
  title?: string;
  contextData?: Record<string, unknown>;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

function MessageRenderer({ content }: { content: string }) {
  let widgetData = null;
  try {
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\n([\s\S]*?)\n```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }
    const data = JSON.parse(jsonStr);

    if (data && data.type === 'generative_ui' && data.widget) {
       widgetData = data;
    }
  } catch {
    // Not JSON or parse failed; fall through to normal text
  }

  if (widgetData) {
     return (
       <div className="mt-2 p-4 border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl flex flex-col gap-2">
          <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-300 font-bold mb-2">
             <Zap className="w-4 h-4" />
             <span>Interactive Widget: {widgetData.widget}</span>
          </div>
          <p className="text-sm text-indigo-600 dark:text-indigo-400">
             Generative UI widget placeholder. In production, this dynamically imports and mounts the {`<${widgetData.widget} />`} React component.
          </p>
          <button className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors w-fit">
             Interact with {widgetData.widget}
          </button>
       </div>
     );
  }

  return <p className="text-sm whitespace-pre-wrap leading-relaxed">{content}</p>;
}

export default function AgentChatDrawer({ isOpen, onClose, agentType, title, contextData }: AgentChatDrawerProps) {
  const { isRtl } = useLocalization();
  const threadIdRef = useRef(crypto.randomUUID());

  // Record<AgentType, …> so a new agent type cannot be added without a greeting.
  // 'tasks' and 'correspondence' previously fell through to the generic line —
  // and, because the greeting was computed once at mount (see the reset effect
  // below), the drawer actually showed the *supervisor's* "I coordinate every
  // department" line while talking to the tasks specialist.
  const WELCOME_AR: Record<AgentType, string> = {
    crm: 'مرحباً! أنا مساعد الـ CRM. أستطيع مساعدتك في صياغة الردود، تلخيص التذاكر، أو تحليل بيانات العملاء. ماذا تحتاج؟',
    hr: 'مرحباً! أنا مساعد الموارد البشرية. أستطيع التحقق من أرصدة الإجازات، شرح سياسات الشركة، أو معالجة الطلبات. كيف أساعدك؟',
    tasks: 'مرحباً! أنا مساعد المشاريع والمهام. أتابع المهام والسبرنتات، أقترح تقدير النقاط، وأساعد في تخطيط الدورات. ماذا تريد؟',
    correspondence: 'مرحباً! أنا مساعد المراسلات والديوان. أصوغ الخطابات الرسمية وأدقّق النبرة والألقاب المعتمدة. بماذا أبدأ؟',
    finance: 'مرحباً! أنا المساعد المالي. أستطيع تلخيص المصروفات، إيجاد الفواتير غير المدفوعة، أو إنشاء التقارير. ماذا تريد أن تفعل؟',
    supervisor: 'مرحباً! أنا Septimus Copilot. أدير كل الأقسام (المهام، CRM، الموارد البشرية، المالية) وأنسّق بينها. اسألني أي شيء.',
    general: 'مرحباً! كيف أساعدك اليوم؟',
  };

  const WELCOME_EN: Record<AgentType, string> = {
    crm: 'Hello! I am your CRM Assistant. I can help you draft replies, summarize tickets, or analyze customer data. What do you need?',
    hr: 'Hello! I am your HR Assistant. I can check leave balances, explain company policies, or process requests. How can I help?',
    tasks: 'Hello! I am your Projects & Tasks Assistant. I track tasks and sprints, suggest point estimates, and help plan cycles. What do you need?',
    correspondence: 'Hello! I am your Correspondence & Diwan Assistant. I draft official letters and audit tone, titles, and compliance. Where shall we start?',
    finance: 'Hello! I am your Finance Assistant. I can summarize expenses, find unpaid invoices, or generate reports. What would you like to do?',
    supervisor: 'Hi! I am Septimus Copilot. I coordinate every department (Tasks, CRM, HR, Finance). Ask me anything.',
    general: 'Hello! How can I help you today?',
  };

  const getWelcomeMessage = () => (isRtl ? WELCOME_AR : WELCOME_EN)[agentType] ?? WELCOME_EN.general;

  const centrifuge = useAppStore((s) => s.centrifuge);
  const [messages, setMessages] = useState<Message[]>([{ id: '1', role: 'assistant', content: getWelcomeMessage() }]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Switching specialists starts a new conversation.
  //
  // The drawer stays mounted across agents, and both the greeting and the thread
  // id were fixed at first mount. So opening the HR copilot and then the tasks
  // copilot kept the HR greeting AND reused the same thread_id — the sidecar
  // checkpoints conversations per thread, so the tasks specialist resumed the HR
  // conversation and answered with the wrong role's context. Same drawer, two
  // agents, one memory.
  const lastAgentRef = useRef(agentType);
  useEffect(() => {
    if (lastAgentRef.current === agentType) return;
    lastAgentRef.current = agentType;
    threadIdRef.current = crypto.randomUUID();
    setMessages([{ id: '1', role: 'assistant', content: getWelcomeMessage() }]);
    // getWelcomeMessage reads agentType and isRtl, both in the dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentType, isRtl]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  if (!isOpen) return null;

  const handleSend = async (text: string = input) => {
    if (!text.trim()) return;

    const userMessage: Message = { id: Date.now().toString(), role: 'user', content: text };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    // Live token streaming via Centrifugo: the sidecar publishes reply tokens to
    // `ai_<streamId>` while generating; the HTTP response stays authoritative.
    const assistantId = (Date.now() + 1).toString();
    const streamId = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    const streaming = !!centrifuge;
    let streamed = '';
    let sub: Subscription | null = null;

    const setAssistant = (content: string) =>
      setMessages(prev => prev.map(m => (m.id === assistantId ? { ...m, content } : m)));

    const onPub = (ctx: PublicationContext) => {
      const d = ctx.data as { type?: string; delta?: string; reply?: string } | undefined;
      if (!d) return;
      if (d.type === 'token' && typeof d.delta === 'string') {
        streamed += d.delta;
        setAssistant(streamed);
      } else if (d.type === 'done' && typeof d.reply === 'string') {
        setAssistant(d.reply);
      }
    };

    const cleanup = () => {
      if (sub) {
        try { sub.off('publication', onPub); sub.unsubscribe(); } catch { /* noop */ }
      }
    };

    try {
      const workspaceId = localStorage.getItem('currentWorkspaceId') || '';
      // Context sent to AI is reference-only. The Go boundary resolves this
      // record under the caller's tenant and projects it through schema-level
      // AI/PII policy; browser objects must never become model context directly.
      const ctx: Record<string, unknown> = {};
      if (typeof contextData?.purpose === 'string') {
        ctx.purpose = contextData.purpose;
      }
      const entityRef = contextData?.entity_ref;
      if (entityRef && typeof entityRef === 'object' && !Array.isArray(entityRef)) {
        const ref = entityRef as Record<string, unknown>;
        if (typeof ref.definition_key === 'string' && typeof ref.record_id === 'string') {
          ctx.entity_ref = { definition_key: ref.definition_key, record_id: ref.record_id };
        }
      }
      ctx.workspace_id = workspaceId;
      ctx.lang = isRtl ? 'ar' : 'en';

      if (streaming && centrifuge) {
        // Placeholder assistant bubble the stream fills in.
        setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '' }]);
        const channel = `ai_${streamId}`; // unique per message
        const existing = centrifuge.getSubscription(channel);
        if (existing) {
          sub = existing;
        } else {
          sub = centrifuge.newSubscription(channel);
          sub.subscribe();
        }
        sub.on('publication', onPub);
        ctx.stream_id = streamId;
      }

      const response = await apiPost<{reply: string}>('/ai/chat', {
        agent_type: agentType,
        message: text,
        context: ctx,
        thread_id: threadIdRef.current
      }, AI_BASE_URL);

      // HTTP reply is authoritative — reconcile the streamed text to it.
      if (streaming) {
        setAssistant(response.reply);
      } else {
        setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: response.reply }]);
      }
    } catch (err) {
      console.error("AI chat error", err);
      // A failed HTTP call does not mean the agent failed. Tokens arrive over
      // Centrifugo independently, so when the stream already produced text the
      // answer is on screen and correct — overwriting it with an error message
      // threw away a complete reply and told the user it had failed. Keep what
      // was streamed and let the request error stay in the console.
      if (streaming && streamed.trim()) {
        setAssistant(streamed);
      } else {
        const errText = isRtl ? "عذراً، حدث خطأ أثناء الاتصال بالذكاء الاصطناعي." : "Sorry, an error occurred while connecting to the AI.";
        if (streaming) {
          setAssistant(errText);
        } else {
          setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: errText }]);
        }
      }
    } finally {
      cleanup();
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Record<AgentType, …> on purpose: adding a member to AgentType without giving
  // it a theme is a compile error, which is how the two missing agents surfaced.
  const agentThemeColors: Record<AgentType, string> = {
    crm: 'text-indigo-500 bg-indigo-50 border-indigo-200',
    hr: 'text-rose-500 bg-rose-50 border-rose-200',
    tasks: 'text-sky-500 bg-sky-50 border-sky-200',
    correspondence: 'text-amber-500 bg-amber-50 border-amber-200',
    finance: 'text-emerald-500 bg-emerald-50 border-emerald-200',
    supervisor: 'text-purple-500 bg-purple-50 border-purple-200',
    general: 'text-brand bg-brand-light border-brand/20'
  };
  const theme = agentThemeColors[agentType] || agentThemeColors.general;

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40 transition-opacity" onClick={onClose} />

      <div className={`fixed top-0 bottom-0 end-0 ${isExpanded ? 'w-full md:w-3/4 lg:w-2/3' : 'w-full md:w-[450px]'} bg-card dark:bg-slate-900 shadow-2xl border-s border-border dark:border-slate-800 z-50 flex flex-col transition-all duration-300 ease-in-out transform`}>

        {/* Header */}
        <div className="p-4 border-b border-border dark:border-slate-800 flex items-center justify-between bg-muted dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${theme}`}>
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-foreground dark:text-slate-100 flex items-center gap-2">
                {title || 'AI Assistant'}
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-200 dark:bg-slate-700 text-muted-foreground dark:text-slate-300">Beta</span>
              </h2>
              <p className="text-xs text-muted-foreground font-medium">Powered by Septimus Engine</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-2 text-muted-foreground hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors hidden md:block"
              title={isExpanded ? 'Minimize' : 'Maximize'}
              aria-label={isExpanded ? 'Minimize' : 'Maximize'}
            >
              {isExpanded ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </button>
            <button
              onClick={onClose}
              className="p-2 text-muted-foreground hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-foreground dark:hover:text-slate-200 rounded-lg transition-colors"
              title="Close"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-card dark:bg-slate-900">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-brand text-white' : theme.replace('border', '')}`}>
                {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>
              <div className={`max-w-[80%] rounded-2xl p-4 ${msg.role === 'user' ? 'bg-brand text-white rounded-se-none' : 'bg-muted dark:bg-slate-800 border border-border dark:border-slate-700 text-foreground dark:text-slate-300 rounded-ss-none'}`}>
                <MessageRenderer content={msg.content} />
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="flex gap-3">
               <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${theme.replace('border', '')}`}>
                <Bot className="w-4 h-4" />
              </div>
              <div className="bg-muted dark:bg-slate-800 border border-border dark:border-slate-700 p-4 rounded-2xl rounded-ss-none flex items-center gap-1.5">
                 <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:0ms]" />
                 <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:150ms]" />
                 <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 border-t border-border dark:border-slate-800 bg-card dark:bg-slate-900">

          {/* Quick Actions based on agent type */}
          {messages.length === 1 && (
             <div className="flex flex-wrap gap-2 mb-4">
                {agentType === 'crm' && (
                  <>
                    <button onClick={() => handleSend('Draft a polite reply to the customer')} className="text-xs px-3 py-1.5 bg-muted dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full font-medium transition-colors text-muted-foreground dark:text-slate-300 border border-border dark:border-slate-700">✍️ Draft Reply</button>
                    <button onClick={() => handleSend('Summarize the history of this ticket')} className="text-xs px-3 py-1.5 bg-muted dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full font-medium transition-colors text-muted-foreground dark:text-slate-300 border border-border dark:border-slate-700">📝 Summarize Ticket</button>
                  </>
                )}
                {agentType === 'hr' && (
                  <>
                    <button onClick={() => handleSend('Review leave policy')} className="text-xs px-3 py-1.5 bg-muted dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full font-medium transition-colors text-muted-foreground dark:text-slate-300 border border-border dark:border-slate-700">📖 Leave Policy</button>
                    <button onClick={() => handleSend('Check available vacation days')} className="text-xs px-3 py-1.5 bg-muted dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full font-medium transition-colors text-muted-foreground dark:text-slate-300 border border-border dark:border-slate-700">🏖️ Check Balance</button>
                  </>
                )}
                {agentType === 'finance' && (
                  <>
                    <button onClick={() => handleSend('Summarize expenses for this month')} className="text-xs px-3 py-1.5 bg-muted dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full font-medium transition-colors text-muted-foreground dark:text-slate-300 border border-border dark:border-slate-700">📊 Monthly Summary</button>
                    <button onClick={() => handleSend('List unpaid invoices')} className="text-xs px-3 py-1.5 bg-muted dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full font-medium transition-colors text-muted-foreground dark:text-slate-300 border border-border dark:border-slate-700">⚠️ Unpaid Invoices</button>
                  </>
                )}
             </div>
          )}

          <div className="relative">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Ask ${title || 'Assistant'}...`}
              className="w-full resize-none border border-border dark:border-slate-700 rounded-2xl py-3 ps-4 pe-12 bg-muted dark:bg-slate-800/50 text-foreground dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand/50 min-h-[56px] max-h-32 text-sm"
              rows={1}
            />
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || isTyping}
              className="absolute end-2 bottom-2 w-10 h-10 rounded-xl bg-brand text-white flex items-center justify-center hover:bg-brand/90 disabled:opacity-50 disabled:hover:bg-brand transition-all shadow-md"
            >
              {isTyping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 ms-0.5" />}
            </button>
          </div>
          <div className="text-center mt-2">
            <span className="text-[10px] text-muted-foreground font-medium">AI can make mistakes. Verify important information.</span>
          </div>
        </div>
      </div>
    </>
  );
}
