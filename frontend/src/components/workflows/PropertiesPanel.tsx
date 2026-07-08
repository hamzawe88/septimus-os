import React from 'react';
import { Node } from 'reactflow';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface PropertiesPanelProps {
  selectedNode: Node | null;
  onUpdateNodeData: (id: string, data: Record<string, unknown>) => void;
  onClose: () => void;
}

export default function PropertiesPanel({ selectedNode, onUpdateNodeData, onClose }: PropertiesPanelProps) {
  if (!selectedNode) return null;

  const handleDataChange = (field: string, value: unknown) => {
    onUpdateNodeData(selectedNode.id, { ...selectedNode.data, [field]: value });
  };

  return (
    <aside className="w-full flex flex-col h-full bg-white dark:bg-slate-900 z-10">
      <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
        <div>
          <h3 className="font-bold text-slate-800">Node Properties</h3>
          <p className="text-xs text-slate-500 uppercase">{selectedNode.type}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-8 px-2 text-slate-400 hover:text-slate-700">
          Close
        </Button>
      </div>

      <div className="p-4 flex flex-col gap-4 overflow-y-auto">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-600">Label</label>
          <Input 
            value={selectedNode.data.label || ''} 
            onChange={(e) => handleDataChange('label', e.target.value)} 
            placeholder="Node Label" 
            className="h-8"
          />
        </div>
        
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-600">Description</label>
          <Input 
            value={selectedNode.data.description || ''} 
            onChange={(e) => handleDataChange('description', e.target.value)} 
            placeholder="Optional description" 
            className="h-8"
          />
        </div>

        {selectedNode.type === 'trigger' && (
          <div className="space-y-3 mt-2 border-t pt-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600">Trigger Event</label>
              <select 
                className="w-full h-8 px-2 border border-slate-200 rounded-md text-sm"
                value={selectedNode.data.triggerEvent as string || ''}
                onChange={(e) => handleDataChange('triggerEvent', e.target.value)}
                title="Select Trigger Event"
                aria-label="Trigger Event"
              >
                <option value="">Select Event...</option>
                <option value="task.created">Task Created</option>
                <option value="task.transitioned">Task Transitioned</option>
                <option value="document.uploaded">Document Uploaded</option>
                <option value="message.created">Message Created</option>
                <option value="cron">Scheduled Run (Cron / Interval)</option>
              </select>
            </div>
            {selectedNode.data.triggerEvent === 'cron' && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600">Interval (minutes)</label>
                <Input 
                  type="number"
                  value={selectedNode.data.intervalMinutes || ''} 
                  onChange={(e) => handleDataChange('intervalMinutes', parseInt(e.target.value) || 60)} 
                  placeholder="60" 
                  className="h-8"
                />
                <p className="text-[10px] text-slate-400">The workflow will run automatically every X minutes in the background.</p>
              </div>
            )}
          </div>
        )}

        {selectedNode.type === 'condition' && (
          <div className="space-y-3 mt-2 border-t pt-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600">Field</label>
              <Input 
                value={selectedNode.data.field || ''} 
                onChange={(e) => handleDataChange('field', e.target.value)} 
                placeholder="e.g. status, priority" 
                className="h-8"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600">Operator</label>
              <select 
                className="w-full h-8 px-2 border border-slate-200 rounded-md text-sm"
                value={selectedNode.data.operator as string || ''}
                onChange={(e) => handleDataChange('operator', e.target.value)}
                title="Select Operator"
                aria-label="Condition Operator"
              >
                <option value="">Select...</option>
                <option value="eq">Equals (eq)</option>
                <option value="neq">Not Equals (neq)</option>
                <option value="contains">Contains</option>
                <option value="gt">Greater Than (gt)</option>
                <option value="lt">Less Than (lt)</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600">Value</label>
              <Input 
                value={selectedNode.data.value || ''} 
                onChange={(e) => handleDataChange('value', e.target.value)} 
                placeholder="e.g. done, 2" 
                className="h-8"
              />
            </div>
          </div>
        )}

        {selectedNode.type === 'action' && (
          <div className="space-y-3 mt-2 border-t pt-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600">Action Type</label>
              <select 
                className="w-full h-8 px-2 border border-slate-200 rounded-md text-sm"
                value={selectedNode.data.actionType as string || ''}
                onChange={(e) => handleDataChange('actionType', e.target.value)}
                title="Select Action Type"
                aria-label="Action Type"
              >
                <option value="">Select Action...</option>
                <option value="send_chat">Send Chat Message</option>
                <option value="update_task_status">Update Task Status</option>
                <option value="send_email">Send Email</option>
                <option value="http">HTTP Webhook</option>
                <option value="trigger_ai_agent">Trigger AI Agent</option>
              </select>
            </div>

            {selectedNode.data.actionType === 'send_chat' && (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600">Channel / Group (ID)</label>
                  <Input 
                    value={selectedNode.data.channelId || ''} 
                    onChange={(e) => handleDataChange('channelId', e.target.value)} 
                    placeholder="Channel UUID" 
                    className="h-8"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600">Message Content</label>
                  <textarea 
                    value={selectedNode.data.messageText || ''} 
                    onChange={(e) => handleDataChange('messageText', e.target.value)} 
                    placeholder="Hello {{title}}" 
                    className="w-full h-24 p-2 border border-slate-200 rounded-md text-sm"
                  />
                </div>
              </>
            )}

            {selectedNode.data.actionType === 'update_task_status' && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600">New Status</label>
                <select 
                  className="w-full h-8 px-2 border border-slate-200 rounded-md text-sm"
                  value={selectedNode.data.newStatus as string || ''}
                  onChange={(e) => handleDataChange('newStatus', e.target.value)}
                  title="Select New Status"
                  aria-label="New Status"
                >
                  <option value="">Select Status...</option>
                  <option value="todo">To Do</option>
                  <option value="in_progress">In Progress</option>
                  <option value="review">Review</option>
                  <option value="done">Done</option>
                </select>
              </div>
            )}

            {selectedNode.data.actionType === 'send_email' && (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600">Email Address</label>
                  <Input 
                    value={selectedNode.data.emailAddress || ''} 
                    onChange={(e) => handleDataChange('emailAddress', e.target.value)} 
                    placeholder="user@example.com" 
                    className="h-8"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600">Subject</label>
                  <Input 
                    value={selectedNode.data.emailSubject || ''} 
                    onChange={(e) => handleDataChange('emailSubject', e.target.value)} 
                    placeholder="Important Update..." 
                    className="h-8"
                  />
                </div>
              </>
            )}

            {selectedNode.data.actionType === 'http' && (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600">Send Method</label>
                  <select 
                    className="w-full h-8 px-2 border border-slate-200 rounded-md text-sm"
                    value={selectedNode.data.actionMethod as string || 'POST'}
                    onChange={(e) => handleDataChange('actionMethod', e.target.value)}
                    title="HTTP Method"
                    aria-label="HTTP Method"
                  >
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="GET">GET</option>
                    <option value="DELETE">DELETE</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600">Webhook URL</label>
                  <Input 
                    value={selectedNode.data.actionUrl || ''} 
                    onChange={(e) => handleDataChange('actionUrl', e.target.value)} 
                    placeholder="https://..." 
                    className="h-8"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600">JSON Body Template</label>
                  <textarea 
                    value={selectedNode.data.actionBody || ''} 
                    onChange={(e) => handleDataChange('actionBody', e.target.value)} 
                    placeholder='{"status": "{{status}}"}' 
                    className="w-full h-24 p-2 border border-slate-200 rounded-md text-sm font-mono"
                  />
                </div>
              </>
            )}

            {selectedNode.data.actionType === 'trigger_ai_agent' && (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600">Agent Type</label>
                  <select 
                    className="w-full h-8 px-2 border border-slate-200 rounded-md text-sm"
                    value={selectedNode.data.agentType as string || ''}
                    onChange={(e) => handleDataChange('agentType', e.target.value)}
                    title="Select Agent Type"
                    aria-label="Agent Type"
                  >
                    <option value="">Select Agent...</option>
                    <option value="sales">Sales</option>
                    <option value="hr">Human Resources (HR)</option>
                    <option value="data">Data Analytics</option>
                    <option value="support">Technical Support</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600">Task Prompt</label>
                  <textarea 
                    value={selectedNode.data.agentPrompt || ''} 
                    onChange={(e) => handleDataChange('agentPrompt', e.target.value)} 
                    placeholder="Analyze the following: {{task_data}}" 
                    className="w-full h-24 p-2 border border-slate-200 rounded-md text-sm"
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
