import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import React, { useState } from 'react';
import { useLocalization } from '@/contexts/LocalizationContext';
import { CheckCircle2, Circle } from 'lucide-react';
import { fetchWithAuth,     API_BASE_URL } from '@/lib/apiClient';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TaskComponent = (props: any) => {
  const { isRtl } = useLocalization();
  const { node, updateAttributes } = props;
  const isDone = node.attrs.isDone;
  const taskId = node.attrs.taskId;
  const [loading, setLoading] = useState(false);

  const toggleDone = async () => {
    updateAttributes({ isDone: !isDone });
    if (taskId) {
      setLoading(true);
            try {
        await fetchWithAuth(`${API_BASE_URL}/tasks/${taskId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",

          },
          body: JSON.stringify({ status: !isDone ? "done" : "todo" })
        });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
  };

  const createTask = async () => {
    if (taskId) return;
    setLoading(true);
        // Hacky way to get the text, for a real app we'd parse the node content
    const title = node.attrs.title || "New Task from Doc";
    
    const projectId = props.extension.options.projectId;
    if (!projectId) {
      setLoading(false);
      return;
    }
    
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",

        },
        body: JSON.stringify({ 
          project_id: projectId,
          title: title,
          status: "todo"
        })
      });
      if (res.ok) {
        const data = await res.json();
        updateAttributes({ taskId: data.ID });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <NodeViewWrapper className="task-node group flex items-center gap-3 p-3 my-2 bg-card border border-border rounded-lg shadow-sm hover:border-brand-light transition-colors">
      <button contentEditable={false} onClick={toggleDone} disabled={loading} className="text-muted-foreground hover:text-brand">
        {isDone ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <Circle className="w-5 h-5" />}
      </button>
      <div className="flex-1">
        <input 
          contentEditable={false}
          className={`w-full bg-transparent outline-none font-medium text-sm ${isDone ? 'text-muted-foreground line-through' : 'text-foreground'}`}
          value={node.attrs.title}
          onChange={(e) => updateAttributes({ title: e.target.value })}
          placeholder={isRtl ? "عنوان المهمة..." : "Task title..."}
        />
      </div>
      <div contentEditable={false} className="flex items-center gap-2">
        {taskId ? (
          <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-1 rounded">T-{taskId.substring(0,4)}</span>
        ) : (
          <button onClick={createTask} disabled={loading} className="text-xs font-medium bg-brand-light text-brand px-2 py-1 rounded hover:bg-brand-light">
            {loading ? "Creating..." : "Create Task"}
          </button>
        )}
      </div>
    </NodeViewWrapper>
  );
};

export const TaskNode = Node.create({
  name: 'taskNode',
  group: 'block',
  atom: true,

  addOptions() {
    return {
      projectId: '',
    };
  },

  addAttributes() {
    return {
      taskId: { default: null },
      title: { default: '' },
      isDone: { default: false },
    };
  },

  parseHTML() {
    return [
      { tag: 'task-node' },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['task-node', mergeAttributes(HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TaskComponent);
  },
});
