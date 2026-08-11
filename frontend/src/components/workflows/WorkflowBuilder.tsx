import React, { useState, useCallback, useRef } from 'react';
import ReactFlow, {
  ReactFlowProvider,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  Connection,
  Edge,
  Node,
  useReactFlow,
  MarkerType,
  ConnectionLineType,
  BackgroundVariant
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Save, Loader2, Play, LayoutGrid, ArrowLeft, Sparkles } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { apiGet, apiPost, getCurrentWorkspaceId } from '@/lib/apiClient';
import { useLocalization } from "@/contexts/LocalizationContext";
import { useAppStore } from '@/store/useAppStore';
import type { PublicationContext } from 'centrifuge';

import Sidebar from './Sidebar';
import PropertiesPanel from './PropertiesPanel';
import { TriggerNode, ConditionNode, ActionNode } from './CustomNodes';

const nodeTypes = {
  trigger: TriggerNode,
  condition: ConditionNode,
  action: ActionNode,
};

let id = 0;
const getId = () => `node_${id++}`;

interface WorkflowBuilderProps {
  onBack?: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialWorkflow?: any;
}

function BuilderFlow({ onBack, initialWorkflow }: WorkflowBuilderProps) {
  const { isRtl } = useLocalization();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  // Parse initial nodes/edges if provided
  const initialNodes = initialWorkflow?.Nodes ? (typeof initialWorkflow.Nodes === 'string' ? JSON.parse(initialWorkflow.Nodes) : initialWorkflow.Nodes) : [];
  const initialEdges = initialWorkflow?.Edges ? (typeof initialWorkflow.Edges === 'string' ? JSON.parse(initialWorkflow.Edges) : initialWorkflow.Edges) : [];

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const { screenToFlowPosition } = useReactFlow();

  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [workflowName, setWorkflowName] = useState(initialWorkflow?.Name || 'My New Workflow');
  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [savedWorkflowId, setSavedWorkflowId] = useState<string | null>(initialWorkflow?.ID || null);

  const centrifuge = useAppStore((s) => s.centrifuge);

  // Subscribe to Centrifugo for AI generation updates
  React.useEffect(() => {
    if (!centrifuge) return;
    const workspaceId = localStorage.getItem("currentWorkspaceId") || "";
    if (!workspaceId) return;

    const channel = `workspace_${workspaceId}`;
    const existing = centrifuge.getSubscription(channel);
    const sub = existing ?? centrifuge.newSubscription(channel);

    const onPublication = (ctx: PublicationContext) => {
      const data = ctx.data as { type?: string; payload?: Record<string, unknown> };
      if (data?.type === 'septimus_workflow_generated') {
        setIsGenerating(false);
        const payload = data.payload;
        if (payload && payload.error) {
          alert(isRtl ? `خطأ من الذكاء الاصطناعي: ${payload.error}` : `AI Error: ${payload.error}`);
          return;
        }
        if (payload && payload.nodes && payload.edges) {
          setNodes(payload.nodes as Node[]);
          setEdges(payload.edges as Edge[]);
          alert(isRtl ? "تم توليد مسار العمل بنجاح!" : "Workflow generated successfully!");
        }
      }
    };

    sub.on('publication', onPublication);
    if (!existing) sub.subscribe();

    return () => {
      sub.off('publication', onPublication);
      if (!existing) {
        sub.unsubscribe();
      }
    };
  }, [centrifuge, setNodes, setEdges, isRtl]);

  const handleGenerateWorkflow = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    try {
      const workspaceId = getCurrentWorkspaceId();
      await apiPost(`/workflows/generate?workspace_id=${workspaceId}`, { prompt });
      // The rest is handled by Centrifugo
    } catch (err) {
      console.error(err);
      alert(isRtl ? "فشل الاتصال بمحرك الذكاء الاصطناعي." : "Failed to connect to AI engine.");
      setIsGenerating(false);
    }
  };

  // Cycle Detection (Topological check) before adding an edge
  const onConnect = useCallback(
    (params: Edge | Connection) => {
      setEdges((eds) => {
        // Build adjacency list including the new potential edge
        const adj: Record<string, string[]> = {};

        // Initialize all nodes in adj
        nodes.forEach(n => { adj[n.id] = []; });

        // Add existing edges
        eds.forEach(e => {
          if (!adj[e.source]) adj[e.source] = [];
          adj[e.source].push(e.target);
        });

        // Add the new edge
        if (params.source && params.target) {
          if (!adj[params.source]) adj[params.source] = [];
          adj[params.source].push(params.target);
        }

        // DFS to find cycles
        const visited: Record<string, number> = {}; // 0: unvisited, 1: visiting, 2: visited
        const hasCycle = (node: string): boolean => {
          if (visited[node] === 1) return true;
          if (visited[node] === 2) return false;

          visited[node] = 1;
          for (const neighbor of (adj[node] || [])) {
            if (hasCycle(neighbor)) return true;
          }
          visited[node] = 2;
          return false;
        };

        // Check all nodes
        for (const nodeId of Object.keys(adj)) {
          if (!visited[nodeId]) {
            if (hasCycle(nodeId)) {
              alert(isRtl ? "⚠️ تم اكتشاف تبعية دائرية! الحلقات اللانهائية غير مسموحة." : "⚠️ Circular dependency detected! Infinite loops are not allowed in workflows.");
              return eds; // Return unchanged edges
            }
          }
        }

        // No cycle, safe to add
        return addEdge(params, eds);
      });
    },
    [setEdges, nodes, isRtl]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow');
      const label = event.dataTransfer.getData('application/reactflow-label');

      if (typeof type === 'undefined' || !type) {
        return;
      }

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: Node = {
        id: getId(),
        type,
        position,
        data: { label: label || `${type} node` },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [screenToFlowPosition, setNodes]
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const updateNodeData = useCallback((nodeId: string, newData: Record<string, unknown>) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          node.data = newData;
        }
        return node;
      })
    );
    // Update selectedNode so panel reflects changes immediately
    setSelectedNode((prev) => (prev?.id === nodeId ? { ...prev, data: newData } : prev));
  }, [setNodes]);

  const handleSave = async (): Promise<string | null> => {
    setIsSaving(true);
    try {
      const workspaceId = getCurrentWorkspaceId();

      const payload = {
        id: savedWorkflowId || initialWorkflow?.ID,
        name: workflowName,
        isActive: true,
        nodes: nodes,
        edges: edges,
      };

      const res = await apiPost<{
        error?: string;
        workflow?: { ID?: string; id?: string };
      }>(`/workflows?workspace_id=${workspaceId}`, payload);

      if (res && !res.error) {
        const workflowId = res.workflow?.ID || res.workflow?.id || initialWorkflow?.ID;
        if (!workflowId) throw new Error("Workflow save response did not include an ID");
        setSavedWorkflowId(workflowId);
        alert(isRtl ? "تم حفظ مسار العمل بنجاح!" : "Workflow saved successfully!");
        return workflowId;
      } else {
        alert(isRtl ? `خطأ في حفظ المسار: ${res?.error}` : `Error saving workflow: ${res?.error}`);
      }
    } catch (err) {
      console.error(err);
      alert(isRtl ? "فشل الاتصال بالخادم." : "Failed to connect to the server.");
    } finally {
      setIsSaving(false);
    }
    return null;
  };

  const handleTestRun = async () => {
    setIsRunning(true);
    setNodes(nds => nds.map(n => ({ ...n, data: { ...n.data, status: 'running' } })));
    try {
      const workflowId = savedWorkflowId || await handleSave();
      if (!workflowId) throw new Error("Workflow must be saved before execution");
      const previousRuns = await apiGet<Array<{ ID?: string; id?: string }>>(`/workflows/${workflowId}/runs`);
      const previousRunIds = new Set(previousRuns.map((run) => run.ID || run.id).filter(Boolean));
      await apiPost(`/workflows/${workflowId}/execute`, { source: "builder_test" });

      let runStatus = "";
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const runs = await apiGet<Array<{ ID?: string; id?: string; Status?: string; status?: string }>>(`/workflows/${workflowId}/runs`);
        const latestRun = runs.find((run) => !previousRunIds.has(run.ID || run.id));
        runStatus = latestRun?.Status || latestRun?.status || "";
        if (runStatus && runStatus !== "running") break;
        await new Promise((resolve) => window.setTimeout(resolve, 250));
      }
      if (!runStatus) throw new Error("Workflow run did not report a result");
      const nodeStatus = runStatus === "success" ? "success" : "error";
      setNodes(nds => nds.map(n => ({ ...n, data: { ...n.data, status: nodeStatus } })));
      alert(runStatus === "success"
        ? (isRtl ? "اكتمل تنفيذ مسار العمل بنجاح." : "Workflow execution completed successfully.")
        : (isRtl ? "فشل تنفيذ مسار العمل. راجع سجل التشغيل." : "Workflow execution failed. Review the run history."));
    } catch (error) {
      console.error("Workflow test run failed:", error);
      setNodes(nds => nds.map(n => ({ ...n, data: { ...n.data, status: "error" } })));
      alert(isRtl ? "تعذر تنفيذ مسار العمل الفعلي." : "The real workflow execution could not be completed.");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="flex h-full w-full bg-background dark:bg-slate-900 relative overflow-hidden" dir={isRtl ? "rtl" : "ltr"}>
      <Sidebar />
      <div
        className="flex-1 flex flex-col h-full relative overflow-hidden"
        dir="ltr"
        ref={reactFlowWrapper}
        onDrop={onDrop}
        onDragOver={onDragOver}
      >

        {/* Header toolbar */}
        <div className="absolute top-4 start-4 end-4 z-10 flex justify-between items-center bg-white/90 dark:bg-slate-900/90 backdrop-blur-md p-4 rounded-2xl shadow-lg border border-border/60 dark:border-slate-800/60">
          <div className="flex items-center gap-3">
            {onBack && (
              <Button onClick={onBack} variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground dark:hover:text-slate-300">
                <ArrowLeft className="w-5 h-5 rtl:rotate-180" />
              </Button>
            )}
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand to-indigo-500 flex items-center justify-center text-white shadow-inner shadow-black/20">
              <LayoutGrid className="w-5 h-5" />
            </div>
            <input
              type="text"
              value={workflowName}
              onChange={(e) => setWorkflowName(e.target.value)}
              className="font-extrabold text-xl text-foreground dark:text-white bg-transparent outline-none focus:border-b-2 border-brand transition-all w-64"
              placeholder={isRtl ? "اسم مسار العمل..." : "Workflow Name..."}
              title={isRtl ? "اسم المسار" : "Workflow Name"}
              aria-label={isRtl ? "اسم المسار" : "Workflow Name"}
            />
          </div>


          <div className="flex items-center gap-3">
            <select
              className="px-4 py-2.5 border border-border dark:border-slate-700 rounded-xl text-sm font-bold bg-muted dark:bg-slate-800 hover:bg-muted dark:hover:bg-slate-700 transition-colors cursor-pointer outline-none focus:ring-2 focus:ring-brand/50 text-foreground dark:text-slate-300"
              onChange={(e) => {
                if (e.target.value === 'welcome') {
                  setWorkflowName(isRtl ? 'رسالة ترحيب بالأعضاء الجدد' : 'Welcome message for new members');
                  setNodes([
                    { id: 'node_welcome_1', type: 'trigger', position: { x: 250, y: 150 }, data: { label: isRtl ? 'عند إنشاء مستخدم' : 'When user is created', triggerEvent: 'user.created' } },
                    { id: 'node_welcome_2', type: 'action', position: { x: 550, y: 150 }, data: { label: isRtl ? 'إرسال رسالة ترحيب' : 'Send welcome message', actionType: 'send_chat', messageText: isRtl ? 'مرحباً {{email}}! أهلاً بك في الفريق.' : 'Hello {{email}}! Welcome to the team.' } }
                  ]);
                  setEdges([{ id: 'edge_welcome', source: 'node_welcome_1', target: 'node_welcome_2', type: 'smoothstep', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } }]);
                } else if (e.target.value === 'task_done') {
                  setWorkflowName(isRtl ? 'إغلاق المهام آلياً' : 'Close tasks automatically');
                  setNodes([
                    { id: 'node_task_1', type: 'trigger', position: { x: 250, y: 150 }, data: { label: isRtl ? 'عند إنشاء مهمة' : 'When task is created', triggerEvent: 'task.created' } },
                    { id: 'node_task_2', type: 'action', position: { x: 550, y: 150 }, data: { label: isRtl ? 'تغيير الحالة إلى منجز' : 'Change status to done', actionType: 'update_task_status', newStatus: 'done' } }
                  ]);
                  setEdges([{ id: 'edge_task', source: 'node_task_1', target: 'node_task_2', type: 'smoothstep', animated: true, style: { stroke: '#10b981', strokeWidth: 2 } }]);
                }
              }}
              title={isRtl ? "القوالب الجاهزة" : "Templates"}
              aria-label={isRtl ? "القوالب الجاهزة" : "Templates"}
            >
              <option value="">{isRtl ? "+ تحميل قالب جاهز" : "+ Load Template"}</option>
              <option value="welcome">{isRtl ? "رسالة ترحيب بالأعضاء الجدد" : "Welcome message for new members"}</option>
              <option value="task_done">{isRtl ? "إغلاق المهام آلياً" : "Close tasks automatically"}</option>
            </select>
            <Button onClick={handleTestRun} disabled={isRunning} variant="outline" className="gap-2 border-brand text-brand hover:bg-brand/10 dark:hover:bg-brand/20 px-6 py-2.5 rounded-xl font-bold transition-all shadow-sm shadow-brand/10">
              {isRunning ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-4 h-4 me-1.5" />}
              {isRunning ? (isRtl ? 'جاري التشغيل...' : 'Running...') : (isRtl ? 'تشغيل تجريبي' : 'Test Run')}
            </Button>
            <Button onClick={handleSave} disabled={isSaving} className="gap-2 bg-brand hover:bg-brand/90 px-6 py-2.5 rounded-xl shadow-[0_0_15px_rgba(var(--brand-rgb),0.3)] hover:shadow-[0_0_25px_rgba(var(--brand-rgb),0.5)] font-bold text-white transition-all">
              {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              {isSaving ? (isRtl ? 'جاري النشر...' : 'Publishing...') : (isRtl ? 'حفظ ونشر' : 'Save and Publish')}
            </Button>
          </div>
        </div>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={() => {}}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          defaultEdgeOptions={{
            type: 'smoothstep',
            animated: true,
            style: { stroke: '#94a3b8', strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' }
          }}
          connectionLineType={ConnectionLineType.SmoothStep}
          snapToGrid={true}
          snapGrid={[20, 20]}
          fitView
          className="bg-muted dark:bg-[#121212]"
        >
          <Controls className="bg-card dark:bg-slate-800 border-border dark:border-slate-700 shadow-xl rounded-xl overflow-hidden" />
          <Background color="#94a3b8" gap={20} size={1.5} variant={BackgroundVariant.Dots} />
        </ReactFlow>

        {/* Floating AI Command Palette */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-2xl z-20">
          <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-border/60 dark:border-slate-700/60 shadow-2xl rounded-2xl overflow-hidden flex flex-col focus-within:border-brand focus-within:shadow-[0_0_20px_rgba(var(--brand-rgb),0.15)] transition-all">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={isRtl ? "صف مسار العمل للذكاء الاصطناعي (مثل: من CRM إلى المالية)..." : "Describe workflow to AI (e.g., from CRM to Finance)..."}
              className="w-full bg-transparent px-5 py-4 text-foreground dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 outline-none resize-none min-h-[80px] max-h-[250px]"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleGenerateWorkflow();
                }
              }}
            />
            <div className="flex justify-between items-center px-4 py-3 bg-muted/80 dark:bg-slate-800/80 border-t border-border dark:border-slate-800">
              <div className="text-xs text-muted-foreground font-medium">
                {isRtl ? 'استخدم Shift + Enter لسطر جديد' : 'Press Shift + Enter for new line'}
              </div>
              <button
                onClick={handleGenerateWorkflow}
                disabled={isGenerating || !prompt.trim()}
                className="px-6 py-2.5 bg-brand text-white font-bold text-sm rounded-xl hover:bg-brand/90 transition-all shadow-md shadow-brand/20 disabled:opacity-50 disabled:shadow-none flex items-center gap-2"
              >
                {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {isGenerating ? (isRtl ? 'جاري التوليد...' : 'Generating...') : (isRtl ? 'توليد ✨' : 'Generate ✨')}
              </button>
            </div>
          </div>
        </div>

        {/* Slide-over Properties Panel */}
        <div className={`absolute top-0 bottom-0 end-0 w-96 bg-card shadow-2xl border-s border-border z-20 transform transition-transform duration-300 ease-in-out ${selectedNode ? 'translate-x-0' : 'translate-x-full'}`}>
          {selectedNode && (
            <PropertiesPanel
              selectedNode={selectedNode}
              onUpdateNodeData={updateNodeData}
              onClose={() => setSelectedNode(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default function WorkflowBuilder(props: WorkflowBuilderProps) {
  return (
    <div data-testid="workflow-builder" className="h-full w-full">
      <ReactFlowProvider>
        <BuilderFlow {...props} />
      </ReactFlowProvider>
    </div>
  );
}
