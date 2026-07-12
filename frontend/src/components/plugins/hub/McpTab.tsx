"use client";

import React, { useState } from "react";
import { useLocalization } from "@/contexts/LocalizationContext";
import { Terminal, Copy, Check, Cpu, Play, Code2, Layers } from "lucide-react";
import { API_BASE_URL, fetchWithAuth } from "@/lib/apiClient";

interface ToolSchema {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
}

const DEFAULT_TOOLS: ToolSchema[] = [
  {
    name: "search_knowledge",
    description: "Semantic search over the workspace knowledge base (documents and entities).",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "Search query" } },
      required: ["query"],
    },
  },
  {
    name: "list_stuck_tasks",
    description: "List tasks stuck in an active status (in_progress/review/blocked) beyond the staleness threshold.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_tasks",
    description: "List tasks in the workspace, optionally filtered by status.",
    inputSchema: {
      type: "object",
      properties: { status: { type: "string", description: "Optional status filter (todo/in_progress/review/done)" } },
    },
  },
  {
    name: "create_task",
    description: "Propose creating a task. It is queued for human approval before execution (human-in-the-loop).",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
      },
      required: ["title"],
    },
  },
];

export default function McpTab() {
  const { isRtl } = useLocalization();
  const [copied, setCopied] = useState(false);
  const [selectedTool, setSelectedTool] = useState<string>("search_knowledge");
  const [testPayload, setTestPayload] = useState<string>('{"query": "attendance architecture"}');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const mcpEndpointUrl = typeof window !== "undefined" 
    ? `${window.location.origin}/api/v1/mcp`
    : `${API_BASE_URL}/mcp`;

  const claudeDesktopConfig = JSON.stringify(
    {
      mcpServers: {
        "septimus-os": {
          url: mcpEndpointUrl,
          headers: {
            Authorization: "Bearer <YOUR_API_KEY_OR_JWT>",
            "Content-Type": "application/json",
          },
        },
      },
    },
    null,
    2
  );

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTestCall = async () => {
    setIsLoading(true);
    setTestResult(null);
    try {
      let parsedParams = {};
      try {
        parsedParams = JSON.parse(testPayload);
      } catch {
        parsedParams = { raw: testPayload };
      }

      const response = await fetchWithAuth(`${API_BASE_URL}/mcp`, {
        method: "POST",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: selectedTool,
            arguments: parsedParams,
          },
        }),
      });

      const data = await response.json();
      setTestResult(JSON.stringify(data, null, 2));
    } catch (err) {
      setTestResult(JSON.stringify({ error: err instanceof Error ? err.message : "Request failed" }, null, 2));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 animate-fadeIn" dir={isRtl ? "rtl" : "ltr"}>
      {/* Banner */}
      <div className="bg-gradient-to-r from-indigo-900 via-slate-900 to-purple-950 rounded-2xl p-6 md:p-8 text-white shadow-xl border border-indigo-500/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-2 max-w-2xl">
          <div className="flex items-center gap-2 text-indigo-300 text-xs font-bold uppercase tracking-wider">
            <Cpu className="w-4 h-4 text-indigo-400" />
            {isRtl ? "بروتوكول سياق النموذج (MCP 2024-11-05)" : "Model Context Protocol (MCP 2024-11-05)"}
          </div>
          <h2 className="text-2xl md:text-3xl font-black">
            {isRtl ? "خادم MCP المدمج لوكلاء الذكاء الاصطناعي" : "Native MCP Server for External AI Agents"}
          </h2>
          <p className="text-slate-300 text-sm leading-relaxed">
            {isRtl
              ? "يتيح خادم MCP لنظام Septimus OS التواصل المباشر والموثق عبر بروتوكول JSON-RPC 2.0 مع وكلاء الذكاء الاصطناعي الخارجيين (مثل Claude Desktop أو Cursor أو أي وكيل مخصص). جميع الاستدعاءات محمية بصلاحيات المستخدم وتحت الرقابة البشرية (HITL)."
              : "Expose Septimus OS capabilities directly to external AI assistants via the standard JSON-RPC 2.0 Model Context Protocol. Every tool call executes under your active workspace context with human-in-the-loop safety gating."}
          </p>
        </div>
        <div className="flex flex-col gap-2 shrink-0 bg-white/10 backdrop-blur px-5 py-4 rounded-xl border border-white/15">
          <span className="text-xs text-slate-300 font-medium">
            {isRtl ? "نقطة الاتصال (Endpoint URL):" : "JSON-RPC Endpoint URL:"}
          </span>
          <code className="text-xs font-mono text-emerald-300 font-bold break-all">{mcpEndpointUrl}</code>
        </div>
      </div>

      {/* Configuration & Tools Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Available Tools List */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center gap-2 text-slate-800 dark:text-white font-black text-lg">
            <Layers className="w-5 h-5 text-indigo-500" />
            <h3>{isRtl ? "الأدوات المتاحة للوكيل" : "Exposed MCP Tools"}</h3>
          </div>
          <div className="space-y-3">
            {DEFAULT_TOOLS.map((tool) => (
              <div
                key={tool.name}
                onClick={() => {
                  setSelectedTool(tool.name);
                  if (tool.name === "search_knowledge") setTestPayload('{"query": "attendance architecture"}');
                  else if (tool.name === "create_task") setTestPayload('{"title": "Verify backend logs", "description": "Check MCP latency"}');
                  else setTestPayload("{}");
                }}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${
                  selectedTool === tool.name
                    ? "bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-500 shadow-md ring-2 ring-indigo-500/20"
                    : "bg-white dark:bg-[#1e2227] border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-sm font-bold text-indigo-600 dark:text-indigo-400">
                    {tool.name}
                  </span>
                  <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full font-bold">
                    ACTIVE
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {tool.description}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Live Playground & Client Config */}
        <div className="lg:col-span-7 space-y-6">
          {/* Playground */}
          <div className="bg-white dark:bg-[#1e2227] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-slate-800 dark:text-white font-black text-md">
                <Play className="w-4 h-4 text-emerald-500" />
                <h4>{isRtl ? "مختبر التجربة الفورية (Live Tool Playground)" : "Live Tool Playground"}</h4>
              </div>
              <span className="text-xs text-slate-500 font-mono">{selectedTool}</span>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-600 dark:text-slate-400">
                {isRtl ? "معاملات الاستدعاء (JSON Params):" : "Tool Arguments (JSON Params):"}
              </label>
              <textarea
                value={testPayload}
                onChange={(e) => setTestPayload(e.target.value)}
                rows={3}
                className="w-full font-mono text-xs p-3 rounded-lg bg-slate-900 text-emerald-400 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <button
              onClick={handleTestCall}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md transition-colors disabled:opacity-50"
            >
              <Play className="w-4 h-4" />
              {isLoading
                ? isRtl ? "جاري تنفيذ الأداة..." : "Executing Tool..."
                : isRtl ? `تجربة تشغيل (${selectedTool})` : `Test Call (${selectedTool})`}
            </button>

            {testResult && (
              <div className="mt-4 space-y-2">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1">
                  <Terminal className="w-3.5 h-3.5 text-indigo-500" />
                  {isRtl ? "نتيجة الاستجابة (JSON-RPC 2.0 Output):" : "JSON-RPC Output:"}
                </label>
                <pre className="p-3 bg-slate-950 text-emerald-300 font-mono text-xs rounded-xl overflow-x-auto border border-slate-800 max-h-60">
                  {testResult}
                </pre>
              </div>
            )}
          </div>

          {/* Claude Desktop Config */}
          <div className="bg-white dark:bg-[#1e2227] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-800 dark:text-white font-black text-md">
                <Code2 className="w-4 h-4 text-purple-500" />
                <h4>{isRtl ? "تكوين Claude Desktop" : "Claude Desktop Configuration"}</h4>
              </div>
              <button
                onClick={() => handleCopy(claudeDesktopConfig)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? (isRtl ? "تم النسخ!" : "Copied!") : (isRtl ? "نسخ الكود" : "Copy Config")}
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isRtl
                ? "أضف هذا التكوين إلى ملف claude_desktop_config.json الخاص بك لتمكين Claude من البحث داخل مستندات شركتك وإنشاء وإدارة المهام مباشرة."
                : "Add this snippet to your `claude_desktop_config.json` to allow Claude Desktop to search your enterprise documents and orchestrate tasks over HTTP JSON-RPC."}
            </p>
            <pre className="p-4 bg-slate-950 text-purple-300 font-mono text-xs rounded-xl overflow-x-auto border border-slate-800">
              {claudeDesktopConfig}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
