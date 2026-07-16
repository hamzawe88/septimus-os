"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useLocalization } from "@/contexts/LocalizationContext";
import { Terminal, Copy, Check, Cpu, Play, Code2, Layers, AlertTriangle, KeyRound, Loader2 } from "lucide-react";
import { API_BASE_URL, fetchWithAuth } from "@/lib/apiClient";

// Everything shown here comes from the server: the tool list is whatever
// `tools/list` returns and the identity strip is whatever `initialize` returns.
// Nothing about the catalogue is hardcoded — a tool added in backend-core shows
// up here on the next page load with no frontend change.

interface ToolSchema {
  name: string;
  description?: string;
  inputSchema?: {
    type?: string;
    properties?: Record<string, { type?: string; description?: string }>;
    required?: string[];
  };
}

interface ServerInfo {
  protocolVersion?: string;
  serverInfo?: { name?: string; version?: string };
}

type JsonRpcResponse<T> = { result?: T; error?: { code: number; message: string } };

// The MCP endpoint lives on the API, which is not necessarily the origin serving
// this page (in dev the UI is :3000 and backend-core is :4000). Deriving it from
// API_BASE_URL is what keeps the copied config pointing somewhere real.
function mcpEndpoint(): string {
  if (API_BASE_URL.startsWith("http")) return `${API_BASE_URL}/mcp`;
  if (typeof window !== "undefined") return `${window.location.origin}${API_BASE_URL}/mcp`;
  return `${API_BASE_URL}/mcp`;
}

async function mcpCall<T>(method: string, params?: unknown): Promise<JsonRpcResponse<T>> {
  const response = await fetchWithAuth(`${API_BASE_URL}/mcp`, {
    method: "POST",
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return response.json();
}

export default function McpTab() {
  const { t, isRtl } = useLocalization();
  const [copied, setCopied] = useState<string | null>(null);
  const [tools, setTools] = useState<ToolSchema[]>([]);
  const [server, setServer] = useState<ServerInfo | null>(null);
  const [toolsError, setToolsError] = useState<string | null>(null);
  const [toolsLoading, setToolsLoading] = useState(true);
  const [selectedTool, setSelectedTool] = useState<string>("");
  const [testPayload, setTestPayload] = useState<string>("{}");
  const [testResult, setTestResult] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const endpointUrl = mcpEndpoint();

  const loadCatalogue = useCallback(async () => {
    try {
      const [listRes, initRes] = await Promise.all([
        mcpCall<{ tools: ToolSchema[] }>("tools/list"),
        mcpCall<ServerInfo>("initialize", { protocolVersion: "2024-11-05", clientInfo: { name: "septimus-ui", version: "1.0.0" } }),
      ]);

      if (listRes.error) {
        setToolsError(listRes.error.message);
        return;
      }
      const fetched = listRes.result?.tools ?? [];
      setTools(fetched);
      setServer(initRes.result ?? null);
      setToolsError(null);
      if (fetched.length > 0) setSelectedTool(prev => prev || fetched[0].name);
    } catch (err) {
      setToolsError(err instanceof Error ? err.message : "request failed");
    } finally {
      setToolsLoading(false);
    }
  }, []);

  useEffect(() => {
    const load = async () => { await loadCatalogue(); };
    load();
  }, [loadCatalogue]);

  // Seed the playground with a skeleton built from the selected tool's own
  // schema, so the example arguments can never drift from the server.
  const selectTool = (tool: ToolSchema) => {
    setSelectedTool(tool.name);
    const props = tool.inputSchema?.properties ?? {};
    const required = tool.inputSchema?.required ?? [];
    const skeleton: Record<string, unknown> = {};
    for (const key of required) skeleton[key] = props[key]?.type === "number" ? 0 : "";
    setTestPayload(JSON.stringify(skeleton, null, 2));
    setTestResult(null);
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleTestCall = async () => {
    if (!selectedTool) return;
    setIsLoading(true);
    setTestResult(null);
    try {
      let parsedArgs: unknown = {};
      try {
        parsedArgs = JSON.parse(testPayload || "{}");
      } catch {
        setTestResult(JSON.stringify({ error: t("plugins.mcp.invalidJson", "Arguments must be valid JSON") }, null, 2));
        return;
      }
      const data = await mcpCall("tools/call", { name: selectedTool, arguments: parsedArgs });
      setTestResult(JSON.stringify(data, null, 2));
    } catch (err) {
      setTestResult(JSON.stringify({ error: err instanceof Error ? err.message : "request failed" }, null, 2));
    } finally {
      setIsLoading(false);
    }
  };

  const claudeDesktopConfig = JSON.stringify(
    {
      mcpServers: {
        "septimus-os": {
          command: "npx",
          args: [
            "-y",
            "mcp-remote",
            endpointUrl,
            // No space after the colon: Claude Desktop on Windows mangles spaces
            // inside args, so the bridge's own docs put the value in env.
            "--header",
            "Authorization:${SEPTIMUS_TOKEN}",
            // This endpoint answers plain JSON-RPC over POST; it does not serve
            // an SSE stream, so the bridge must not probe for one.
            "--transport",
            "http-only",
          ],
          env: {
            SEPTIMUS_TOKEN: "Bearer PASTE_YOUR_TOKEN_HERE",
          },
        },
      },
    },
    null,
    2
  );

  const copySessionToken = () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("septimus_token") : null;
    if (!token) return;
    handleCopy(`Bearer ${token}`, "token");
  };

  const activeTool = tools.find(tl => tl.name === selectedTool);

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 animate-fadeIn" dir={isRtl ? "rtl" : "ltr"}>
      {/* Banner — identity comes from the server's `initialize` response */}
      <div className="bg-gradient-to-r from-slate-900 via-brand/20 to-slate-900 dark:from-[#15181e] dark:via-brand/15 dark:to-[#15181e] rounded-2xl p-6 md:p-8 text-white shadow-xl border border-brand/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-2 max-w-2xl">
          <div className="flex items-center gap-2 text-brand text-xs font-bold uppercase tracking-wider">
            <Cpu className="w-4 h-4 text-brand" />
            {t("plugins.mcp.badge", "Model Context Protocol")}
            {server?.protocolVersion && <span className="font-mono normal-case">({server.protocolVersion})</span>}
          </div>
          <h2 className="text-2xl md:text-3xl font-black">{t("plugins.mcp.title", "MCP Server for External AI Agents")}</h2>
          <p className="text-slate-300 text-sm leading-relaxed">{t("plugins.mcp.description")}</p>
          {server?.serverInfo?.name && (
            <p className="text-xs text-slate-400 font-mono">
              {server.serverInfo.name} v{server.serverInfo.version}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2 shrink-0 bg-white/10 backdrop-blur px-5 py-4 rounded-xl border border-white/15">
          <span className="text-xs text-slate-300 font-medium">{t("plugins.mcp.endpointLabel", "JSON-RPC Endpoint")}</span>
          <code className="text-xs font-mono text-emerald-300 font-bold break-all" dir="ltr">{endpointUrl}</code>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* ── Catalogue: whatever tools/list returned ── */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-slate-800 dark:text-white font-black text-lg">
              <Layers className="w-5 h-5 text-brand" />
              <h3>{t("plugins.mcp.toolsTitle", "Exposed MCP Tools")}</h3>
            </div>
            {!toolsLoading && !toolsError && (
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                {tools.length} {t("plugins.mcp.toolsCount", "tools")}
              </span>
            )}
          </div>

          {toolsLoading && (
            <div className="flex items-center gap-2 p-6 text-sm text-slate-500 dark:text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t("plugins.mcp.toolsLoading", "Loading tools from the server…")}
            </div>
          )}

          {toolsError && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900">
              <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-bold text-red-700 dark:text-red-300">{t("plugins.mcp.toolsError", "Could not load the tool list")}</p>
                <p className="text-xs text-red-600 dark:text-red-400 font-mono mt-1 break-all" dir="ltr">{toolsError}</p>
              </div>
            </div>
          )}

          {!toolsLoading && !toolsError && tools.length === 0 && (
            <p className="p-6 text-sm italic text-slate-500 dark:text-slate-400">
              {t("plugins.mcp.toolsEmpty", "This server exposes no MCP tools.")}
            </p>
          )}

          <div className="space-y-3">
            {tools.map((tool) => {
              const props = Object.entries(tool.inputSchema?.properties ?? {});
              const required = tool.inputSchema?.required ?? [];
              const isSelected = selectedTool === tool.name;
              return (
                <button
                  key={tool.name}
                  type="button"
                  onClick={() => selectTool(tool)}
                  className={`w-full text-start p-4 rounded-xl border transition-all ${
                    isSelected
                      ? "bg-brand/10 dark:bg-brand/20 border-brand shadow-md ring-2 ring-brand/30"
                      : "bg-white dark:bg-[#1e2227] border-slate-200 dark:border-slate-800 hover:border-brand/40 dark:hover:border-brand/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-mono text-sm font-bold text-brand break-all" dir="ltr">{tool.name}</span>
                    <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full font-bold shrink-0">
                      {t("plugins.mcp.statusActive", "ACTIVE")}
                    </span>
                  </div>
                  {tool.description && (
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{tool.description}</p>
                  )}

                  {/* Input schema, rendered from the server's own JSON Schema */}
                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">
                      {t("plugins.mcp.schemaLabel", "Input schema")}
                    </p>
                    {props.length === 0 ? (
                      <p className="text-xs italic text-slate-400 dark:text-slate-500">{t("plugins.mcp.noParams", "No parameters")}</p>
                    ) : (
                      <ul className="space-y-1">
                        {props.map(([key, schema]) => (
                          <li key={key} className="text-xs flex flex-wrap items-baseline gap-x-2">
                            <code className="font-mono font-bold text-slate-700 dark:text-slate-200" dir="ltr">{key}</code>
                            <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">{schema?.type ?? "any"}</span>
                            {required.includes(key) && (
                              <span className="text-[9px] font-bold uppercase text-amber-600 dark:text-amber-400">
                                {t("plugins.mcp.required", "required")}
                              </span>
                            )}
                            {schema?.description && (
                              <span className="text-slate-500 dark:text-slate-400 basis-full">{schema.description}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Playground + client config ── */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white dark:bg-[#1e2227] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-slate-800 dark:text-white font-black text-md">
                <Play className="w-4 h-4 text-emerald-500" />
                <h4>{t("plugins.mcp.playgroundTitle", "Live Tool Playground")}</h4>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono" dir="ltr">{selectedTool}</span>
            </div>

            {!activeTool ? (
              <p className="text-sm italic text-slate-500 dark:text-slate-400 py-4">
                {t("plugins.mcp.selectToolHint", "Select a tool to try it.")}
              </p>
            ) : (
              <>
                <div className="space-y-2">
                  <label htmlFor="mcp-args" className="text-xs font-bold text-slate-600 dark:text-slate-400">
                    {t("plugins.mcp.argsLabel", "Tool arguments (JSON)")}
                  </label>
                  <textarea
                    id="mcp-args"
                    value={testPayload}
                    onChange={(e) => setTestPayload(e.target.value)}
                    rows={3}
                    dir="ltr"
                    className="w-full font-mono text-xs p-3 rounded-lg bg-slate-900 text-emerald-400 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
                  />
                </div>

                <button
                  onClick={handleTestCall}
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-white font-bold text-sm shadow-md transition-colors disabled:opacity-50"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  {isLoading ? t("plugins.mcp.executing", "Executing…") : t("plugins.mcp.testCall", "Test call")}
                </button>
              </>
            )}

            {testResult && (
              <div className="mt-4 space-y-2">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1">
                  <Terminal className="w-3.5 h-3.5 text-brand" />
                  {t("plugins.mcp.outputLabel", "JSON-RPC response")}
                </label>
                <pre dir="ltr" className="p-3 bg-slate-950 text-emerald-300 font-mono text-xs rounded-xl overflow-x-auto border border-slate-800 max-h-60">
                  {testResult}
                </pre>
              </div>
            )}
          </div>

          {/* ── Claude Desktop ── */}
          <div className="bg-white dark:bg-[#1e2227] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-2 text-slate-800 dark:text-white font-black text-md">
              <Code2 className="w-4 h-4 text-brand" />
              <h4>{t("plugins.mcp.claudeTitle", "Connect Claude Desktop")}</h4>
            </div>

            {/* Honesty first: say why the obvious path (paste the URL into
                "Add custom connector") does not work here. */}
            <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
                {t("plugins.mcp.bridgeWarning")}
              </p>
            </div>

            <ol className="space-y-2 ps-5 list-decimal text-xs text-slate-600 dark:text-slate-400 leading-relaxed marker:text-brand marker:font-bold">
              <li>{t("plugins.mcp.step1")}</li>
              <li>
                {t("plugins.mcp.step2")}
                <code className="mx-1 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[11px] text-slate-700 dark:text-slate-300 break-all" dir="ltr">
                  ~/Library/Application Support/Claude/claude_desktop_config.json
                </code>
                <span className="text-slate-400 dark:text-slate-500">
                  {" · "}
                  <code className="font-mono text-[11px]" dir="ltr">%APPDATA%\Claude\claude_desktop_config.json</code>
                </span>
              </li>
              <li>{t("plugins.mcp.step3")}</li>
              <li>{t("plugins.mcp.step4")}</li>
            </ol>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
                {t("plugins.mcp.configLabel", "claude_desktop_config.json")}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={copySessionToken}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  {copied === "token" ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <KeyRound className="w-3.5 h-3.5" />}
                  {copied === "token" ? t("plugins.mcp.copied", "Copied!") : t("plugins.mcp.copyToken", "Copy my token")}
                </button>
                <button
                  onClick={() => handleCopy(claudeDesktopConfig, "config")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  {copied === "config" ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied === "config" ? t("plugins.mcp.copied", "Copied!") : t("plugins.mcp.copyConfig", "Copy config")}
                </button>
              </div>
            </div>

            <pre dir="ltr" className="p-4 bg-slate-950 text-emerald-300 font-mono text-xs rounded-xl overflow-x-auto border border-slate-800">
              {claudeDesktopConfig}
            </pre>

            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              {t("plugins.mcp.tokenNote")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
