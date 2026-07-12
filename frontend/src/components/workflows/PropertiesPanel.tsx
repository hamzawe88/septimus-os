import React, { useState } from 'react';
import { Node } from 'reactflow';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, Trash2 } from 'lucide-react';
import { useLocalization } from "@/contexts/LocalizationContext";

interface PropertiesPanelProps {
  selectedNode: Node | null;
  onUpdateNodeData: (id: string, data: Record<string, unknown>) => void;
  onClose: () => void;
}

export default function PropertiesPanel({ selectedNode, onUpdateNodeData, onClose }: PropertiesPanelProps) {
  const { isRtl } = useLocalization();
  const [newHeaderKey, setNewHeaderKey] = useState('');
  const [newHeaderValue, setNewHeaderValue] = useState('');

  if (!selectedNode) return null;

  const handleDataChange = (field: string, value: unknown) => {
    onUpdateNodeData(selectedNode.id, { ...selectedNode.data, [field]: value });
  };

  const headers: Record<string, string> = (selectedNode.data.actionHeaders as Record<string, string>) || {};

  const addHeader = () => {
    if (!newHeaderKey.trim()) return;
    const updated = { ...headers, [newHeaderKey.trim()]: newHeaderValue };
    handleDataChange('actionHeaders', updated);
    setNewHeaderKey('');
    setNewHeaderValue('');
  };

  const removeHeader = (key: string) => {
    const updated = { ...headers };
    delete updated[key];
    handleDataChange('actionHeaders', updated);
  };

  return (
    <aside className="w-full flex flex-col h-full bg-white dark:bg-slate-900 z-10" dir={isRtl ? "rtl" : "ltr"}>
      <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
        <div>
          <h3 className="font-bold text-slate-800 dark:text-white">{isRtl ? "خصائص العقدة" : "Node Properties"}</h3>
          <p className="text-xs text-slate-500 uppercase">{selectedNode.type}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-8 px-2 text-slate-400 hover:text-slate-700">
          {isRtl ? "إغلاق" : "Close"}
        </Button>
      </div>

      <div className="p-4 flex flex-col gap-4 overflow-y-auto">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">{isRtl ? "التسمية" : "Label"}</label>
          <Input 
            value={selectedNode.data.label || ''} 
            onChange={(e) => handleDataChange('label', e.target.value)} 
            placeholder={isRtl ? "اسم العقدة" : "Node Label"} 
            className="h-8"
          />
        </div>
        
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">{isRtl ? "الوصف" : "Description"}</label>
          <Input 
            value={selectedNode.data.description || ''} 
            onChange={(e) => handleDataChange('description', e.target.value)} 
            placeholder={isRtl ? "وصف اختياري" : "Optional description"} 
            className="h-8"
          />
        </div>

        {/* ─── Trigger Node Config ─── */}
        {selectedNode.type === 'trigger' && (
          <div className="space-y-3 mt-2 border-t pt-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">{isRtl ? "حدث التشغيل" : "Trigger Event"}</label>
              <select 
                className="w-full h-8 px-2 border border-slate-200 dark:border-slate-700 rounded-md text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-white"
                value={selectedNode.data.triggerEvent as string || ''}
                onChange={(e) => handleDataChange('triggerEvent', e.target.value)}
                title={isRtl ? "اختر الحدث" : "Select Trigger Event"}
                aria-label={isRtl ? "حدث التشغيل" : "Trigger Event"}
              >
                <option value="">{isRtl ? "اختر حدثاً..." : "Select Event..."}</option>
                <option value="task.created">{isRtl ? "إنشاء مهمة" : "Task Created"}</option>
                <option value="task.transitioned">{isRtl ? "تغيّر حالة مهمة" : "Task Transitioned"}</option>
                <option value="document.uploaded">{isRtl ? "رفع مستند" : "Document Uploaded"}</option>
                <option value="message.created">{isRtl ? "إنشاء رسالة" : "Message Created"}</option>
                <option value="cron">{isRtl ? "مجدول زمني (Cron)" : "Scheduled Run (Cron)"}</option>
              </select>
            </div>

            {/* Cron-specific config */}
            {selectedNode.data.triggerEvent === 'cron' && (
              <div className="space-y-3 bg-violet-50 dark:bg-violet-500/5 p-3 rounded-xl border border-violet-200 dark:border-violet-800/50">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-violet-700 dark:text-violet-300">{isRtl ? "تعبير Cron" : "Cron Expression"}</label>
                  <Input 
                    value={selectedNode.data.cronExpression || ''} 
                    onChange={(e) => handleDataChange('cronExpression', e.target.value)} 
                    placeholder="0 17 * * *" 
                    className="h-8 font-mono text-sm"
                    dir="ltr"
                  />
                  <p className="text-[10px] text-violet-500 dark:text-violet-400">
                    {isRtl ? "مثال: 0 17 * * * = كل يوم الساعة 5 مساءً" : "Example: 0 17 * * * = Every day at 5 PM"}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-violet-700 dark:text-violet-300">{isRtl ? "أو: تكرار كل (دقائق)" : "Or: Repeat every (minutes)"}</label>
                  <Input 
                    type="number"
                    value={selectedNode.data.intervalMinutes || ''} 
                    onChange={(e) => handleDataChange('intervalMinutes', parseInt(e.target.value) || 60)} 
                    placeholder="60" 
                    className="h-8"
                  />
                  <p className="text-[10px] text-violet-500 dark:text-violet-400">
                    {isRtl ? "بديل مبسّط: تعبير Cron يأخذ الأولوية إن وُجد." : "Simplified fallback — Cron expression takes priority if set."}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── Condition Node Config ─── */}
        {selectedNode.type === 'condition' && (
          <div className="space-y-3 mt-2 border-t pt-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">{isRtl ? "الحقل" : "Field"}</label>
              <Input 
                value={selectedNode.data.field || ''} 
                onChange={(e) => handleDataChange('field', e.target.value)} 
                placeholder={isRtl ? "مثل: status, priority" : "e.g. status, priority"} 
                className="h-8"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">{isRtl ? "العملية" : "Operator"}</label>
              <select 
                className="w-full h-8 px-2 border border-slate-200 dark:border-slate-700 rounded-md text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-white"
                value={selectedNode.data.operator as string || ''}
                onChange={(e) => handleDataChange('operator', e.target.value)}
                title={isRtl ? "اختر العملية" : "Select Operator"}
                aria-label={isRtl ? "عملية الشرط" : "Condition Operator"}
              >
                <option value="">{isRtl ? "اختر..." : "Select..."}</option>
                <option value="eq">{isRtl ? "يساوي" : "Equals (eq)"}</option>
                <option value="neq">{isRtl ? "لا يساوي" : "Not Equals (neq)"}</option>
                <option value="contains">{isRtl ? "يحتوي" : "Contains"}</option>
                <option value="gt">{isRtl ? "أكبر من" : "Greater Than (gt)"}</option>
                <option value="lt">{isRtl ? "أصغر من" : "Less Than (lt)"}</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">{isRtl ? "القيمة" : "Value"}</label>
              <Input 
                value={selectedNode.data.value || ''} 
                onChange={(e) => handleDataChange('value', e.target.value)} 
                placeholder={isRtl ? "مثل: done, 2" : "e.g. done, 2"} 
                className="h-8"
              />
            </div>
          </div>
        )}

        {/* ─── Action Node Config ─── */}
        {selectedNode.type === 'action' && (
          <div className="space-y-3 mt-2 border-t pt-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">{isRtl ? "نوع الإجراء" : "Action Type"}</label>
              <select 
                className="w-full h-8 px-2 border border-slate-200 dark:border-slate-700 rounded-md text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-white"
                value={selectedNode.data.actionType as string || ''}
                onChange={(e) => handleDataChange('actionType', e.target.value)}
                title={isRtl ? "اختر نوع الإجراء" : "Select Action Type"}
                aria-label={isRtl ? "نوع الإجراء" : "Action Type"}
              >
                <option value="">{isRtl ? "اختر إجراءً..." : "Select Action..."}</option>
                <option value="send_chat">{isRtl ? "إرسال رسالة محادثة" : "Send Chat Message"}</option>
                <option value="update_task_status">{isRtl ? "تحديث حالة المهمة" : "Update Task Status"}</option>
                <option value="send_email">{isRtl ? "إرسال بريد إلكتروني" : "Send Email"}</option>
                <option value="send_slack">{isRtl ? "إرسال تنبيه Slack" : "Send Slack Notification"}</option>
                <option value="http">{isRtl ? "خطاف ويب صادر" : "HTTP Webhook"}</option>
                <option value="trigger_ai_agent">{isRtl ? "تشغيل وكيل ذكاء اصطناعي" : "Trigger AI Agent"}</option>
              </select>
            </div>

            {/* Send Chat */}
            {selectedNode.data.actionType === 'send_chat' && (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">{isRtl ? "القناة / المجموعة (المعرّف)" : "Channel / Group (ID)"}</label>
                  <Input 
                    value={selectedNode.data.channelId || ''} 
                    onChange={(e) => handleDataChange('channelId', e.target.value)} 
                    placeholder="Channel UUID" 
                    className="h-8"
                    dir="ltr"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">{isRtl ? "محتوى الرسالة" : "Message Content"}</label>
                  <textarea 
                    value={selectedNode.data.messageText || ''} 
                    onChange={(e) => handleDataChange('messageText', e.target.value)} 
                    placeholder={isRtl ? "مرحباً {{title}}" : "Hello {{title}}"} 
                    className="w-full h-24 p-2 border border-slate-200 dark:border-slate-700 rounded-md text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-white"
                  />
                </div>
              </>
            )}

            {/* Update Task Status */}
            {selectedNode.data.actionType === 'update_task_status' && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">{isRtl ? "الحالة الجديدة" : "New Status"}</label>
                <select 
                  className="w-full h-8 px-2 border border-slate-200 dark:border-slate-700 rounded-md text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-white"
                  value={selectedNode.data.newStatus as string || ''}
                  onChange={(e) => handleDataChange('newStatus', e.target.value)}
                  title={isRtl ? "اختر الحالة" : "Select New Status"}
                  aria-label={isRtl ? "الحالة الجديدة" : "New Status"}
                >
                  <option value="">{isRtl ? "اختر حالة..." : "Select Status..."}</option>
                  <option value="todo">{isRtl ? "للتنفيذ" : "To Do"}</option>
                  <option value="in_progress">{isRtl ? "قيد التنفيذ" : "In Progress"}</option>
                  <option value="review">{isRtl ? "مراجعة" : "Review"}</option>
                  <option value="done">{isRtl ? "مكتمل" : "Done"}</option>
                </select>
              </div>
            )}

            {/* Send Email */}
            {selectedNode.data.actionType === 'send_email' && (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">{isRtl ? "البريد الإلكتروني" : "Email Address"}</label>
                  <Input 
                    value={selectedNode.data.emailAddress || ''} 
                    onChange={(e) => handleDataChange('emailAddress', e.target.value)} 
                    placeholder="user@example.com" 
                    className="h-8"
                    dir="ltr"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">{isRtl ? "الموضوع" : "Subject"}</label>
                  <Input 
                    value={selectedNode.data.emailSubject || ''} 
                    onChange={(e) => handleDataChange('emailSubject', e.target.value)} 
                    placeholder={isRtl ? "تحديث مهم..." : "Important Update..."} 
                    className="h-8"
                  />
                </div>
              </>
            )}

            {/* Send Slack */}
            {selectedNode.data.actionType === 'send_slack' && (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">{isRtl ? "رابط Webhook في Slack" : "Slack Webhook URL"}</label>
                  <Input 
                    value={selectedNode.data.slackWebhookUrl || ''} 
                    onChange={(e) => handleDataChange('slackWebhookUrl', e.target.value)} 
                    placeholder="https://hooks.slack.com/services/..." 
                    className="h-8 font-mono text-xs"
                    dir="ltr"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">{isRtl ? "نص الرسالة" : "Message Text"}</label>
                  <textarea 
                    value={selectedNode.data.messageText || ''} 
                    onChange={(e) => handleDataChange('messageText', e.target.value)} 
                    placeholder={isRtl ? "تنبيه: تم إنشاء مهمة {{title}}" : "Alert: Task created {{title}}"} 
                    className="w-full h-24 p-2 border border-slate-200 dark:border-slate-700 rounded-md text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-white"
                  />
                </div>
              </>
            )}

            {/* HTTP Webhook */}
            {selectedNode.data.actionType === 'http' && (
              <div className="space-y-3 bg-orange-50 dark:bg-orange-500/5 p-3 rounded-xl border border-orange-200 dark:border-orange-800/50">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-orange-700 dark:text-orange-300">{isRtl ? "طريقة الإرسال" : "HTTP Method"}</label>
                  <select 
                    className="w-full h-8 px-2 border border-orange-200 dark:border-orange-700 rounded-md text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-white"
                    value={selectedNode.data.actionMethod as string || 'POST'}
                    onChange={(e) => handleDataChange('actionMethod', e.target.value)}
                    title={isRtl ? "طريقة الإرسال" : "HTTP Method"}
                    aria-label={isRtl ? "طريقة الإرسال" : "HTTP Method"}
                  >
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="GET">GET</option>
                    <option value="DELETE">DELETE</option>
                    <option value="PATCH">PATCH</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-orange-700 dark:text-orange-300">{isRtl ? "رابط الوجهة" : "Webhook URL"}</label>
                  <Input 
                    value={selectedNode.data.actionUrl || ''} 
                    onChange={(e) => handleDataChange('actionUrl', e.target.value)} 
                    placeholder="https://api.example.com/webhook" 
                    className="h-8 font-mono text-sm"
                    dir="ltr"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-orange-700 dark:text-orange-300">{isRtl ? "قالب جسم الطلب (JSON)" : "JSON Body Template"}</label>
                  <textarea 
                    value={selectedNode.data.actionBody || ''} 
                    onChange={(e) => handleDataChange('actionBody', e.target.value)} 
                    placeholder={'{"status": "{{status}}", "title": "{{title}}"}'}
                    className="w-full h-24 p-2 border border-orange-200 dark:border-orange-700 rounded-md text-sm font-mono bg-white dark:bg-slate-800 text-slate-800 dark:text-white"
                    dir="ltr"
                  />
                </div>

                {/* Custom Headers */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-orange-700 dark:text-orange-300">{isRtl ? "ترويسات مخصصة" : "Custom Headers"}</label>
                  {Object.entries(headers).map(([key, val]) => (
                    <div key={key} className="flex items-center gap-1.5 bg-white dark:bg-slate-800 rounded-lg p-1.5 border border-orange-100 dark:border-orange-900/30">
                      <span className="text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300 truncate flex-1">{key}</span>
                      <span className="text-[10px] text-slate-400">:</span>
                      <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate flex-1">{val}</span>
                      <button onClick={() => removeHeader(key)} className="text-rose-400 hover:text-rose-600 p-0.5" aria-label={isRtl ? "حذف ترويسة" : "Remove header"}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                  <div className="flex gap-1.5">
                    <Input
                      value={newHeaderKey}
                      onChange={(e) => setNewHeaderKey(e.target.value)}
                      placeholder={isRtl ? "المفتاح" : "Key"}
                      className="h-7 text-xs flex-1 font-mono"
                      dir="ltr"
                    />
                    <Input
                      value={newHeaderValue}
                      onChange={(e) => setNewHeaderValue(e.target.value)}
                      placeholder={isRtl ? "القيمة" : "Value"}
                      className="h-7 text-xs flex-1 font-mono"
                      dir="ltr"
                    />
                    <Button size="sm" variant="outline" onClick={addHeader} className="h-7 px-2 border-orange-300 text-orange-600 hover:bg-orange-50" aria-label={isRtl ? "إضافة ترويسة" : "Add header"}>
                      <Plus size={14} />
                    </Button>
                  </div>
                  <p className="text-[10px] text-orange-400">
                    {isRtl ? "مثال: Authorization → Bearer sk-xxx" : "Example: Authorization → Bearer sk-xxx"}
                  </p>
                </div>
              </div>
            )}

            {/* Trigger AI Agent */}
            {selectedNode.data.actionType === 'trigger_ai_agent' && (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">{isRtl ? "نوع الوكيل" : "Agent Type"}</label>
                  <select 
                    className="w-full h-8 px-2 border border-slate-200 dark:border-slate-700 rounded-md text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-white"
                    value={selectedNode.data.agentType as string || ''}
                    onChange={(e) => handleDataChange('agentType', e.target.value)}
                    title={isRtl ? "اختر نوع الوكيل" : "Select Agent Type"}
                    aria-label={isRtl ? "نوع الوكيل" : "Agent Type"}
                  >
                    <option value="">{isRtl ? "اختر وكيلاً..." : "Select Agent..."}</option>
                    <option value="general">{isRtl ? "عام" : "General AI"}</option>
                    <option value="sales">{isRtl ? "المبيعات" : "Sales"}</option>
                    <option value="hr">{isRtl ? "الموارد البشرية" : "Human Resources (HR)"}</option>
                    <option value="data">{isRtl ? "تحليل البيانات" : "Data Analytics"}</option>
                    <option value="support">{isRtl ? "الدعم التقني" : "Technical Support"}</option>
                    <option value="code">{isRtl ? "البرمجة والتطوير" : "Software Engineering"}</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">{isRtl ? "أمر المهمة" : "Task Prompt"}</label>
                  <textarea 
                    value={selectedNode.data.agentPrompt || ''} 
                    onChange={(e) => handleDataChange('agentPrompt', e.target.value)} 
                    placeholder={isRtl ? "حلّل التالي: {{task_data}}" : "Analyze the following: {{task_data}}"} 
                    className="w-full h-24 p-2 border border-slate-200 dark:border-slate-700 rounded-md text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">{isRtl ? "إرسال الرد إلى قناة (اختياري)" : "Send Reply to Channel (Optional)"}</label>
                  <Input 
                    value={selectedNode.data.channelId || ''} 
                    onChange={(e) => handleDataChange('channelId', e.target.value)} 
                    placeholder="Channel UUID" 
                    className="h-8 font-mono text-sm"
                    dir="ltr"
                  />
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
