"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Zap, Loader2 } from "lucide-react";

interface EntityCreatorModalProps {
  onClose: () => void;
}

export default function EntityCreatorModal({ onClose }: EntityCreatorModalProps) {
  const [entityType, setEntityType] = useState("task");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states based on type
  const [taskData, setTaskData] = useState({ title: "", assignee: "Unassigned", priority: "Medium" });
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // In a real app, send to Go backend: POST /api/v1/entities
      const payload = {
        workspace_id: "00000000-0000-0000-0000-000000000000", // placeholder
        project_id: "00000000-0000-0000-0000-000000000000",   // placeholder
        entity_type: entityType,
        data: entityType === "task" ? taskData : {}
      };

      // Simulate network request
      await new Promise((res) => setTimeout(res, 800));
      console.log("Created Entity:", payload);

      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal-content">
        <div className="modal-header">
          <div className="flex items-center gap-2">
            <div className="modal-icon-bg">
              <Zap className="w-5 h-5 text-yellow-500" />
            </div>
            <h2 id="modal-title" className="modal-title">Create New Entity</h2>
          </div>
          <button onClick={onClose} className="modal-close-btn" aria-label="Close modal">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-group">
            <label className="form-label">Entity Type</label>
            <select 
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              className="modal-input"
              title="Entity Type"
              aria-label="Entity Type"
            >
              <option value="task">Task / To-Do</option>
              <option value="document">Document</option>
              <option value="meeting">Meeting</option>
              <option value="issue">Issue Tracker</option>
            </select>
          </div>

          {entityType === "task" && (
            <>
              <div className="form-group">
                <label className="form-label">Task Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Update marketing materials"
                  className="modal-input"
                  value={taskData.title}
                  onChange={(e) => setTaskData({ ...taskData, title: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Priority</label>
                <select
                  className="modal-input"
                  value={taskData.priority}
                  onChange={(e) => setTaskData({ ...taskData, priority: e.target.value })}
                  title="Priority"
                  aria-label="Priority"
                >
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>
            </>
          )}

          <div className="modal-footer">
            <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="modal-submit-btn">
              {isSubmitting ? <Loader2 className="w-4 h-4 me-2 animate-spin" /> : <Zap className="w-4 h-4 me-2" />}
              Create Entity
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
