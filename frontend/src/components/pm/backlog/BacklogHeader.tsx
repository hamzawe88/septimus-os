import React from 'react';
import { LayoutGrid, Sparkles, Plus, Search, Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface User {
  id: string;
  email: string;
  avatar?: string;
}

interface BacklogHeaderProps {
  isLoading: boolean;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filterPriority: number | null;
  setFilterPriority: (priority: number | null) => void;
  filterAssignee: string | null;
  setFilterAssignee: (assigneeId: string | null) => void;
  users: User[];
  priorities: { label: string, value: number, badge: string }[];
  onAutoPlan: () => void;
  onCreateSprint: () => void;
}

export function BacklogHeader({
  isLoading,
  searchQuery,
  setSearchQuery,
  filterPriority,
  setFilterPriority,
  filterAssignee,
  setFilterAssignee,
  users,
  priorities,
  onAutoPlan,
  onCreateSprint
}: BacklogHeaderProps) {
  return (
    <div className="flex flex-col border-b border-slate-200 bg-white/90 backdrop-blur-md z-20 shadow-sm">
      <div className="flex justify-between items-center p-4 lg:px-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl text-white shadow-md">
            <LayoutGrid className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-slate-900 tracking-tight">Backlog & Sprints</h2>
              <span className="px-2 py-0.5 text-[10px] font-bold bg-brand-light text-brand rounded-full">Agile Super-Hub</span>
            </div>
            <p className="text-xs font-medium text-slate-500">Drag and drop tasks, monitor real-time capacity, and plan work cycles</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" className="shadow-sm border-brand-light text-brand hover:bg-brand-light font-bold text-xs" onClick={onAutoPlan} disabled={isLoading} title="AI Auto-Plan Sprint" aria-label="AI Auto-Plan Sprint">
            <Sparkles className="w-4 h-4 me-1.5 text-brand animate-pulse" /> AI Auto-Plan
          </Button>
          <Button onClick={onCreateSprint} className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 shadow-md font-semibold text-xs" disabled={isLoading} title="Create New Sprint" aria-label="Create New Sprint">
            <Plus className="w-4 h-4 me-1.5" /> New Sprint
          </Button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex items-center justify-between px-6 py-2.5 bg-slate-50/80 border-t border-slate-100 text-xs gap-4">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              title="Search tasks"
              aria-label="Search tasks"
              placeholder="Search backlog tasks by title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full ps-9 pe-4 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand shadow-sm"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} title="Clear search" aria-label="Clear search" className="absolute end-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-slate-400 font-semibold flex items-center gap-1"><Filter className="w-3.5 h-3.5"/> Filter by:</span>
          
          <select
            title="Filter by Priority"
            aria-label="Filter by Priority"
            value={filterPriority === null ? "" : filterPriority}
            onChange={(e) => setFilterPriority(e.target.value === "" ? null : Number(e.target.value))}
            className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-700 cursor-pointer focus:outline-none shadow-sm"
          >
            <option value="">All Priorities</option>
            {priorities.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>

          <select
            title="Filter by Assignee"
            aria-label="Filter by Assignee"
            value={filterAssignee || ""}
            onChange={(e) => setFilterAssignee(e.target.value === "" ? null : e.target.value)}
            className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-700 cursor-pointer focus:outline-none shadow-sm"
          >
            <option value="">All Assignees</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.email.split('@')[0]}</option>)}
          </select>

          {(searchQuery || filterPriority !== null || filterAssignee !== null) && (
            <button 
              onClick={() => {
                setSearchQuery("");
                setFilterPriority(null);
                setFilterAssignee(null);
              }}
              className="text-slate-400 hover:text-slate-700 underline underline-offset-2 transition-colors ms-1"
            >
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
