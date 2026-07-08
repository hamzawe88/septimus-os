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
import { Save, Loader2, Play, LayoutGrid, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiPost } from '@/lib/apiClient';

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
              alert("⚠️ Circular dependency detected! Infinite loops are not allowed in workflows.");
              return eds; // Return unchanged edges
            }
          }
        }

        // No cycle, safe to add
        return addEdge(params, eds);
      });
    },
    [setEdges, nodes]
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

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Use a dummy workspace ID for MVP if not available globally
      const workspaceId = localStorage.getItem("currentWorkspaceId") || "797ec9d1-e70e-4ca7-a9aa-2d4fed3d879e"; 
      
      const payload = {
        id: initialWorkflow?.ID,
        name: workflowName,
        isActive: true,
        nodes: nodes,
        edges: edges,
      };

      const data = await apiPost(`/workflows?workspace_id=${workspaceId}`, payload) as { error?: string };

      if (!data?.error) {
        alert("Workflow saved successfully!");
      } else {
        alert(`Error saving workflow: ${data.error}`);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to connect to the server.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestRun = () => {
    setIsRunning(true);
    // Simulate execution flow
    setNodes(nds => nds.map(n => ({ ...n, data: { ...n.data, status: 'running' } })));
    setTimeout(() => {
      setNodes(nds => nds.map(n => ({ ...n, data: { ...n.data, status: Math.random() > 0.2 ? 'success' : 'error' } })));
      setIsRunning(false);
    }, 2000);
  };

  return (
    <div className="flex h-full w-full bg-[#f8fafc] dark:bg-slate-900 relative overflow-hidden" dir="rtl">
      <Sidebar />
      <div 
        className="flex-1 flex flex-col h-full relative overflow-hidden" 
        dir="ltr"
        ref={reactFlowWrapper}
        onDrop={onDrop}
        onDragOver={onDragOver}
      >
        
        {/* Header toolbar */}
        <div className="absolute top-4 start-4 end-4 z-10 flex justify-between items-center bg-white/90 dark:bg-slate-900/90 backdrop-blur-md p-4 rounded-2xl shadow-lg border border-slate-200/60 dark:border-slate-800/60" dir="rtl">
          <div className="flex items-center gap-3">
            {onBack && (
              <Button onClick={onBack} variant="ghost" size="icon" className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
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
              className="font-extrabold text-xl text-slate-800 dark:text-white bg-transparent outline-none focus:border-b-2 border-brand transition-all w-64"
              title="اسم المسار"
              aria-label="اسم المسار"
            />
          </div>
          <div className="flex items-center gap-3">
            <select
              className="px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer outline-none focus:ring-2 focus:ring-brand/50 text-slate-700 dark:text-slate-300"
              onChange={(e) => {
                if (e.target.value === 'welcome') {
                  setWorkflowName('رسالة ترحيب بالأعضاء الجدد');
                  setNodes([
                    { id: 'node_welcome_1', type: 'trigger', position: { x: 250, y: 150 }, data: { label: 'عند إنشاء مستخدم', triggerEvent: 'user.created' } },
                    { id: 'node_welcome_2', type: 'action', position: { x: 550, y: 150 }, data: { label: 'إرسال رسالة ترحيب', actionType: 'send_chat', messageText: 'مرحباً {{email}}! أهلاً بك في الفريق.' } }
                  ]);
                  setEdges([{ id: 'edge_welcome', source: 'node_welcome_1', target: 'node_welcome_2', type: 'smoothstep', animated: true, style: { stroke: '#6366f1', strokeWidth: 2 } }]);
                } else if (e.target.value === 'task_done') {
                  setWorkflowName('إغلاق المهام آلياً');
                  setNodes([
                    { id: 'node_task_1', type: 'trigger', position: { x: 250, y: 150 }, data: { label: 'عند إنشاء مهمة', triggerEvent: 'task.created' } },
                    { id: 'node_task_2', type: 'action', position: { x: 550, y: 150 }, data: { label: 'تغيير الحالة إلى منجز', actionType: 'update_task_status', newStatus: 'done' } }
                  ]);
                  setEdges([{ id: 'edge_task', source: 'node_task_1', target: 'node_task_2', type: 'smoothstep', animated: true, style: { stroke: '#10b981', strokeWidth: 2 } }]);
                }
                e.target.value = ''; // Reset select
              }}
              title="القوالب الجاهزة"
              aria-label="القوالب الجاهزة"
            >
              <option value="">+ تحميل قالب جاهز</option>
              <option value="welcome">رسالة ترحيب بالأعضاء الجدد</option>
              <option value="task_done">إغلاق المهام آلياً</option>
            </select>
            <Button onClick={handleTestRun} disabled={isRunning} variant="outline" className="gap-2 border-brand text-brand hover:bg-brand/10 dark:hover:bg-brand/20 px-6 py-2.5 rounded-xl font-bold transition-all shadow-sm shadow-brand/10">
              {isRunning ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 fill-current" />}
              {isRunning ? 'جاري التشغيل...' : 'تشغيل تجريبي'}
            </Button>
            <Button onClick={handleSave} disabled={isSaving} className="gap-2 bg-brand hover:bg-brand/90 px-6 py-2.5 rounded-xl shadow-[0_0_15px_rgba(var(--brand-rgb),0.3)] hover:shadow-[0_0_25px_rgba(var(--brand-rgb),0.5)] font-bold text-white transition-all">
              {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              {isSaving ? 'جاري النشر...' : 'حفظ ونشر'}
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
          className="bg-slate-50 dark:bg-[#121212]"
        >
          <Controls className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-xl rounded-xl overflow-hidden" />
          <Background color="#94a3b8" gap={20} size={1.5} variant={BackgroundVariant.Dots} />
        </ReactFlow>

        {/* Slide-over Properties Panel */}
        <div className={`absolute top-0 bottom-0 end-0 w-96 bg-white shadow-2xl border-s border-slate-200 z-20 transform transition-transform duration-300 ease-in-out ${selectedNode ? 'translate-x-0' : 'translate-x-full'}`}>
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
    <ReactFlowProvider>
      <BuilderFlow {...props} />
    </ReactFlowProvider>
  );
}
