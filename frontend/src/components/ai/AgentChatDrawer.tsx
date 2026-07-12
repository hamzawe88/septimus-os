import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Bot, User, Sparkles, Loader2, Maximize2, Minimize2 } from 'lucide-react';
import type { PublicationContext, Subscription } from 'centrifuge';
import { apiPost, AI_BASE_URL } from '@/lib/apiClient';
import { useLocalization } from '@/contexts/LocalizationContext';
import { useAppStore } from '@/store/useAppStore';

export type AgentType = 'crm' | 'hr' | 'finance' | 'general' | 'supervisor';

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

export default function AgentChatDrawer({ isOpen, onClose, agentType, title, contextData }: AgentChatDrawerProps) {
  const { isRtl } = useLocalization();
  const getWelcomeMessage = () => {
    if (isRtl) {
      if (agentType === 'crm') return 'مرحباً! أنا مساعد الـ CRM. أستطيع مساعدتك في صياغة الردود، تلخيص التذاكر، أو تحليل بيانات العملاء. ماذا تحتاج؟';
      if (agentType === 'hr') return 'مرحباً! أنا مساعد الموارد البشرية. أستطيع التحقق من أرصدة الإجازات، شرح سياسات الشركة، أو معالجة الطلبات. كيف أساعدك؟';
      if (agentType === 'finance') return 'مرحباً! أنا المساعد المالي. أستطيع تلخيص المصروفات، إيجاد الفواتير غير المدفوعة، أو إنشاء التقارير. ماذا تريد أن تفعل؟';
      if (agentType === 'supervisor') return 'مرحباً! أنا Septimus Copilot. أدير كل الأقسام (المهام، CRM، الموارد البشرية، المالية) وأنسّق بينها. اسألني أي شيء.';
      return 'مرحباً! كيف أساعدك اليوم؟';
    }
    if (agentType === 'crm') return 'Hello! I am your CRM Assistant. I can help you draft replies, summarize tickets, or analyze customer data. What do you need?';
    if (agentType === 'hr') return 'Hello! I am your HR Assistant. I can check leave balances, explain company policies, or process requests. How can I help?';
    if (agentType === 'finance') return 'Hello! I am your Finance Assistant. I can summarize expenses, find unpaid invoices, or generate reports. What would you like to do?';
    if (agentType === 'supervisor') return 'Hi! I am Septimus Copilot. I coordinate every department (Tasks, CRM, HR, Finance). Ask me anything.';
    return 'Hello! How can I help you today?';
  };

  const centrifuge = useAppStore((s) => s.centrifuge);
  const [messages, setMessages] = useState<Message[]>([{ id: '1', role: 'assistant', content: getWelcomeMessage() }]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
      const ctx: Record<string, unknown> = contextData ? { ...contextData } : {};
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
        thread_id: 'default-thread'
      }, AI_BASE_URL);

      // HTTP reply is authoritative — reconcile the streamed text to it.
      if (streaming) {
        setAssistant(response.reply);
      } else {
        setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: response.reply }]);
      }
    } catch (err) {
      console.error("AI chat error", err);
      const errText = isRtl ? "عذراً، حدث خطأ أثناء الاتصال بالذكاء الاصطناعي." : "Sorry, an error occurred while connecting to the AI.";
      if (streaming) {
        setAssistant(errText);
      } else {
        setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: errText }]);
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

  const agentThemeColors: Record<AgentType, string> = {
    crm: 'text-indigo-500 bg-indigo-50 border-indigo-200',
    hr: 'text-rose-500 bg-rose-50 border-rose-200',
    finance: 'text-emerald-500 bg-emerald-50 border-emerald-200',
    supervisor: 'text-purple-500 bg-purple-50 border-purple-200',
    general: 'text-brand bg-brand-light border-brand/20'
  };
  const theme = agentThemeColors[agentType] || agentThemeColors.general;

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40 transition-opacity" onClick={onClose} />
      
      <div className={`fixed top-0 bottom-0 end-0 ${isExpanded ? 'w-full md:w-3/4 lg:w-2/3' : 'w-full md:w-[450px]'} bg-white dark:bg-slate-900 shadow-2xl border-s border-slate-200 dark:border-slate-800 z-50 flex flex-col transition-all duration-300 ease-in-out transform`}>
        
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${theme}`}>
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                {title || 'AI Assistant'}
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">Beta</span>
              </h2>
              <p className="text-xs text-slate-500 font-medium">Powered by Septimus Engine</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsExpanded(!isExpanded)} 
              className="p-2 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors hidden md:block"
              title={isExpanded ? 'Minimize' : 'Maximize'}
              aria-label={isExpanded ? 'Minimize' : 'Maximize'}
            >
              {isExpanded ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </button>
            <button 
              onClick={onClose} 
              className="p-2 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg transition-colors"
              title="Close"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-white dark:bg-slate-900">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-brand text-white' : theme.replace('border', '')}`}>
                {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>
              <div className={`max-w-[80%] rounded-2xl p-4 ${msg.role === 'user' ? 'bg-brand text-white rounded-se-none' : 'bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-ss-none'}`}>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
              </div>
            </div>
          ))}
          
          {isTyping && (
            <div className="flex gap-3">
               <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${theme.replace('border', '')}`}>
                <Bot className="w-4 h-4" />
              </div>
              <div className="bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-4 rounded-2xl rounded-ss-none flex items-center gap-1.5">
                 <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:0ms]" />
                 <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:150ms]" />
                 <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          
          {/* Quick Actions based on agent type */}
          {messages.length === 1 && (
             <div className="flex flex-wrap gap-2 mb-4">
                {agentType === 'crm' && (
                  <>
                    <button onClick={() => handleSend('Draft a polite reply to the customer')} className="text-xs px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full font-medium transition-colors text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">✍️ Draft Reply</button>
                    <button onClick={() => handleSend('Summarize the history of this ticket')} className="text-xs px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full font-medium transition-colors text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">📝 Summarize Ticket</button>
                  </>
                )}
                {agentType === 'hr' && (
                  <>
                    <button onClick={() => handleSend('Review leave policy')} className="text-xs px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full font-medium transition-colors text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">📖 Leave Policy</button>
                    <button onClick={() => handleSend('Check available vacation days')} className="text-xs px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full font-medium transition-colors text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">🏖️ Check Balance</button>
                  </>
                )}
                {agentType === 'finance' && (
                  <>
                    <button onClick={() => handleSend('Summarize expenses for this month')} className="text-xs px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full font-medium transition-colors text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">📊 Monthly Summary</button>
                    <button onClick={() => handleSend('List unpaid invoices')} className="text-xs px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full font-medium transition-colors text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">⚠️ Unpaid Invoices</button>
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
              className="w-full resize-none border border-slate-200 dark:border-slate-700 rounded-2xl py-3 ps-4 pe-12 bg-slate-50 dark:bg-slate-800/50 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand/50 min-h-[56px] max-h-32 text-sm"
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
            <span className="text-[10px] text-slate-400 font-medium">AI can make mistakes. Verify important information.</span>
          </div>
        </div>
      </div>
    </>
  );
}
