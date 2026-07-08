"use client"

import React, { useRef, useEffect, useState, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';

export type Node = {
  id: string;
  name: string;
  group: string;
  role?: string;
  x?: number;
  y?: number;
};

export type Link = {
  source: string | Node;
  target: string | Node;
  type: string;
};

export type GraphData = {
  nodes: Node[];
  links: Link[];
};

type RenderNode = Node & { x: number; y: number };
type RenderLink = Link;

interface OrgChartGraphProps {
  data: GraphData;
  onNodeClick?: (node: Node) => void;
}

const OrgChartGraph: React.FC<OrgChartGraphProps> = ({ data, onNodeClick }) => {
  const graphRef = useRef<unknown>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Resize observer to make the graph responsive
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      if (entries.length > 0) {
        setDimensions({
          width: entries[0].contentRect.width,
          height: entries[0].contentRect.height
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Center graph when data changes
  useEffect(() => {
    if (graphRef.current) {
      setTimeout(() => {
        const fg = graphRef.current as { zoomToFit: (ms: number, padding: number) => void };
        fg.zoomToFit(400, 50);
      }, 100);
    }
  }, [data]);

  const drawNode = useCallback((node: RenderNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const label = node.name;
    const fontSize = 12 / globalScale;
    ctx.font = `${fontSize}px Inter, sans-serif`;

    // Colors
    const isDept = node.group === 'department';
    const computedPrimary = getComputedStyle(document.documentElement).getPropertyValue('--primary-hex').trim() || '#1164A3';
    const bgColor = isDept ? computedPrimary : '#f15153';
    const textColor = '#334155';

    // Draw Circle
    ctx.beginPath();
    ctx.arc(node.x, node.y, 8, 0, 2 * Math.PI, false);
    ctx.fillStyle = bgColor;
    ctx.fill();
    
    // Draw Border (glowing effect simulation)
    ctx.lineWidth = 1;
    ctx.strokeStyle = isDept ? '#4A90E2' : '#FF7675';
    ctx.stroke();

    // Draw Label
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = textColor;
    ctx.fillText(label, node.x, node.y + 12 + fontSize);
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full min-h-[500px] bg-slate-50 rounded-xl overflow-hidden border border-[var(--border-strong)] relative">
      <div className="absolute top-4 end-4 z-10 flex gap-4 bg-white p-2 rounded-lg border border-[var(--border-strong)] shadow-sm">
         <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]">
            <span 
              className="w-3 h-3 rounded-full block bg-[var(--primary-hex,#1164A3)]" 
            ></span> إدارة / قسم
         </div>
         <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]">
            <span className="w-3 h-3 rounded-full bg-[#f15153] block"></span> موظف
         </div>
      </div>
      <ForceGraph2D
        // @ts-expect-error - bypassing complex ForceGraph2D ref generic types
        ref={graphRef}
        width={dimensions.width}
        height={dimensions.height}
        graphData={data}
        nodeLabel="name"
        nodeCanvasObject={drawNode as unknown as (node: object, ctx: CanvasRenderingContext2D, globalScale: number) => void}
        onNodeClick={(n) => onNodeClick && onNodeClick(n as Node)}
        linkColor={(link: unknown) => (link as RenderLink).type === 'reports_to' ? 'rgba(51,65,85,0.3)' : 'rgba(51,65,85,0.6)'}
        linkWidth={(link: unknown) => (link as RenderLink).type === 'reports_to' ? 1 : 2}
        linkDirectionalParticles={2}
        linkDirectionalParticleSpeed={(d: unknown) => (d as RenderLink).type === 'reports_to' ? 0.005 : 0.01}
        d3VelocityDecay={0.3}
        backgroundColor="#f8fafc" // bg-slate-50
      />
    </div>
  );
};

export default OrgChartGraph;
