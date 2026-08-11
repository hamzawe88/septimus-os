import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Zap, GitBranch, PlayCircle, Webhook, Database, AlertCircle, CheckCircle2, Code } from 'lucide-react';

const nodeWrapperStyles = "relative px-5 py-4 shadow-xl rounded-2xl bg-card border flex flex-col min-w-[280px] transition-all duration-200 hover:shadow-2xl";

export const TriggerNode = memo(({ data, selected }: NodeProps) => {
  return (
    <div className={`${nodeWrapperStyles} ${selected ? 'border-brand ring-2 ring-brand/20' : 'border-border'}`}>
      <div className="flex items-center gap-4 w-full">
        <div className="p-3 bg-brand/10 rounded-xl text-brand shrink-0">
          <PlayCircle size={24} />
        </div>
        <div className="flex-1">
          <div className="text-sm font-black text-foreground">{data.label || 'Trigger'}</div>
          <div className="text-xs text-muted-foreground font-medium mt-0.5">
            {data.triggerEvent === 'cron' ? `Cron (${data.intervalMinutes || 60}m)` : (data.triggerEvent || 'Select Event...')}
          </div>
        </div>
        {data.status === 'running' && <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />}
        {data.status === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
        {data.status === 'error' && <AlertCircle className="w-4 h-4 text-rose-500" />}
      </div>
      <Handle type="source" position={Position.Right} className="w-4 h-4 bg-card border-2 border-brand right-[-8px] transition-transform hover:scale-125" />
    </div>
  );
});

export const ConditionNode = memo(({ data, selected }: NodeProps) => {
  return (
    <div className={`${nodeWrapperStyles} ${selected ? 'border-amber-500 ring-2 ring-amber-500/20' : 'border-border'}`}>
      <Handle type="target" position={Position.Left} className="w-4 h-4 bg-card border-2 border-border left-[-8px] transition-transform hover:scale-125" />
      <div className="flex items-center gap-4 w-full mb-3">
        <div className="p-3 bg-amber-100 rounded-xl text-amber-600 shrink-0">
          <GitBranch size={24} />
        </div>
        <div className="flex-1">
          <div className="text-sm font-black text-foreground">{data.label || 'Condition'}</div>
          <div className="text-xs text-muted-foreground font-medium mt-0.5">
            {data.field ? `${data.field} ${data.operator} ${data.value}` : 'Set Rule...'}
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2 w-full mt-2 pt-3 border-t border-border">
         <div className="flex justify-between items-center text-xs font-bold text-muted-foreground bg-muted p-2 rounded-lg relative">
            True
            <Handle type="source" position={Position.Right} id="true" className="w-3 h-3 bg-emerald-500 border-2 border-white right-[-24px] absolute" style={{ top: '50%', transform: 'translateY(-50%)' }} />
         </div>
         <div className="flex justify-between items-center text-xs font-bold text-muted-foreground bg-muted p-2 rounded-lg relative">
            False
            <Handle type="source" position={Position.Right} id="false" className="w-3 h-3 bg-rose-500 border-2 border-white right-[-24px] absolute" style={{ top: '50%', transform: 'translateY(-50%)' }} />
         </div>
      </div>
    </div>
  );
});

export const ActionNode = memo(({ data, selected }: NodeProps) => {
  const getIcon = () => {
    switch(data.actionType) {
      case 'http': return <Webhook size={24} />;
      case 'trigger_ai_agent': return <Code size={24} />;
      case 'update_task_status': return <Database size={24} />;
      case 'send_chat': return <Zap size={24} />;
      case 'send_email': return <Zap size={24} />;
      case 'send_slack': return <Webhook size={24} />;
      default: return <Zap size={24} />;
    }
  };

  const getSubTitle = () => {
    switch(data.actionType) {
      case 'http': return `HTTP ${data.actionMethod || 'POST'}`;
      case 'trigger_ai_agent': return data.agentType ? `AI (${data.agentType})` : 'AI Agent';
      case 'send_chat': return 'Send Chat Message';
      case 'update_task_status': return `Task Status → ${data.newStatus || '...'}`;
      case 'send_email': return `Email → ${data.emailAddress || '...'}`;
      case 'send_slack': return 'Slack Alert';
      default: return data.actionType || 'Select Action...';
    }
  };

  return (
    <div className={`${nodeWrapperStyles} ${selected ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-border'}`}>
      <Handle type="target" position={Position.Left} className="w-4 h-4 bg-card border-2 border-border left-[-8px] transition-transform hover:scale-125" />
      <div className="flex items-center gap-4 w-full">
        <div className="p-3 bg-emerald-100 rounded-xl text-emerald-600 shrink-0">
          {getIcon()}
        </div>
        <div className="flex-1">
          <div className="text-sm font-black text-foreground">{data.label || 'Action'}</div>
          <div className="text-xs text-muted-foreground font-medium mt-0.5">
            {getSubTitle()}
          </div>
        </div>
        {data.status === 'running' && <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />}
        {data.status === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
        {data.status === 'error' && <AlertCircle className="w-4 h-4 text-rose-500" />}
      </div>
      <Handle type="source" position={Position.Right} className="w-4 h-4 bg-card border-2 border-emerald-500 right-[-8px] transition-transform hover:scale-125" />
    </div>
  );
});

TriggerNode.displayName = 'TriggerNode';
ConditionNode.displayName = 'ConditionNode';
ActionNode.displayName = 'ActionNode';

