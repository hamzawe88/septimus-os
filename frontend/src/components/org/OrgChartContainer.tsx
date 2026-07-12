"use client";

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { fetchWithAuth, API_BASE_URL } from '@/lib/apiClient';
import { useLocalization } from "@/contexts/LocalizationContext";
import type { Node as OrgNode, Link as OrgLink, GraphData } from './OrgChartGraph';

// Dynamically import the graph to avoid SSR issues with canvas
const OrgChartGraph = dynamic(() => import('./OrgChartGraph'), { ssr: false });

export default function OrgChartContainer() {
  const { isRtl } = useLocalization();
  const [data, setData] = useState<GraphData>({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New states for interactivity
  const [showDepartments, setShowDepartments] = useState(true);
  const [showEmployees, setShowEmployees] = useState(true);
  const [selectedNode, setSelectedNode] = useState<OrgNode | null>(null);

  useEffect(() => {
    const fetchOrgData = async () => {
      try {
                const res = await fetchWithAuth(`${API_BASE_URL}/admin/org-chart`);
        
        if (!res.ok) {
          throw new Error(isRtl ? 'فشل في جلب بيانات الهيكل التنظيمي' : 'Failed to fetch organizational chart data');
        }
        
        const graphData = await res.json();
        setData(graphData);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };

    fetchOrgData();
  }, [isRtl]);

  if (loading) {
    return (
      <div className="w-full h-full min-h-[500px] flex items-center justify-center bg-slate-50 rounded-xl border border-[var(--border-strong)]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-brand border-t-transparent rounded-full animate-spin"></div>
          <p className="text-[var(--text-secondary)]">{isRtl ? "جاري بناء الشبكة..." : "Building network..."}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full min-h-[500px] flex items-center justify-center bg-slate-50 rounded-xl border border-[var(--border-strong)]">
         <p className="text-red-500">{error}</p>
      </div>
    );
  }

  // Filter Data based on toggles
  const filteredNodes = data.nodes.filter((node) => {
    if (node.group === 'department' && !showDepartments) return false;
    if (node.group === 'user' && !showEmployees) return false;
    return true;
  });

  const filteredNodeIds = new Set(filteredNodes.map((n) => n.id));
  const filteredLinks = data.links.filter((link: OrgLink) => {
    // Both source and target must exist in the filtered nodes
    const sourceId = typeof link.source === 'object' && link.source !== null ? link.source.id : link.source;
    const targetId = typeof link.target === 'object' && link.target !== null ? link.target.id : link.target;
    return filteredNodeIds.has(sourceId) && filteredNodeIds.has(targetId);
  });

  const filteredData = { nodes: filteredNodes, links: filteredLinks };

  return (
    <div className="flex flex-col h-full min-h-[600px] gap-4">
      {/* Filters Header */}
      <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="font-bold text-slate-800">{isRtl ? "مستكشف الهيكل التنظيمي" : "Org Chart Explorer"}</h3>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input 
              type="checkbox" 
              checked={showDepartments}
              onChange={(e) => setShowDepartments(e.target.checked)}
              className="rounded text-brand focus:ring-brand"
            />
            <span className="text-sm font-medium text-slate-700">{isRtl ? "عرض الأقسام" : "Show Departments"}</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input 
              type="checkbox" 
              checked={showEmployees}
              onChange={(e) => setShowEmployees(e.target.checked)}
              className="rounded text-red-500 focus:ring-red-500"
            />
            <span className="text-sm font-medium text-slate-700">{isRtl ? "عرض الموظفين" : "Show Employees"}</span>
          </label>
        </div>
      </div>

      <div className="flex flex-1 gap-4 relative overflow-hidden">
        {/* Graph Area */}
        <div className={`transition-all duration-300 ${selectedNode ? 'w-2/3' : 'w-full'} h-[600px] relative`}>
          <OrgChartGraph 
            data={filteredData} 
            onNodeClick={(node) => setSelectedNode(node)} 
          />
        </div>

        {/* Side Panel */}
        {selectedNode && (
          <div className="w-1/3 bg-white border border-slate-200 rounded-xl shadow-sm p-6 flex flex-col animate-in slide-in-from-left-8 h-[600px] overflow-y-auto">
            <div className="flex justify-between items-start mb-6 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-xl font-bold text-slate-800">{selectedNode.name}</h2>
                <p className="text-sm text-slate-500 mt-1">
                  {selectedNode.group === 'department' ? (isRtl ? 'إدارة / قسم' : 'Department / Division') : (isRtl ? 'موظف' : 'Employee')}
                </p>
              </div>
              <button 
                onClick={() => setSelectedNode(null)}
                className="text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 p-2 rounded-full transition-colors"
              >
                ✕
              </button>
            </div>
            
            <div className="flex flex-col gap-4">
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                <p className="text-xs text-slate-500 font-medium mb-1">{isRtl ? "المعرف" : "ID"}</p>
                <p className="text-sm text-slate-700 font-mono break-all">{selectedNode.id}</p>
              </div>
              
              {selectedNode.role && (
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                  <p className="text-xs text-slate-500 font-medium mb-1">{isRtl ? "الدور الوظيفي" : "Role"}</p>
                  <p className="text-sm text-slate-700">{selectedNode.role}</p>
                </div>
              )}

              {/* Placeholder for future multi-department/project links */}
              {selectedNode.group === 'user' && (
                <div className="bg-brand-light/50 p-4 rounded-lg border border-brand-light mt-2">
                  <p className="text-xs text-brand font-medium mb-2">{isRtl ? "معلومات إضافية (مستقبلاً)" : "Additional Information (Future)"}</p>
                  <ul className="text-sm text-slate-600 list-disc list-inside space-y-1">
                    <li>{isRtl ? "المشاريع المرتبطة" : "Associated Projects"}</li>
                    <li>{isRtl ? "الأقسام المتعددة" : "Multiple Departments"}</li>
                    <li>{isRtl ? "فريق العمل المشترك" : "Cross-functional Team"}</li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
