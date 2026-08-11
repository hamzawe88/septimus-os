"use client";

import { useCallback, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Brain,
  CheckCircle2,
  Send,
  ShieldAlert,
  Sparkles,
  X,
  Zap,
} from "lucide-react";

import { useLocalization } from "@/contexts/LocalizationContext";
import { apiPost } from "@/lib/apiClient";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProvenanceBadge } from "@/components/ui/provenance";
import { Tag } from "@/components/ui/tag";

interface RequiredInput {
  title: string;
  description: string;
  required_field: string;
  field_label: string;
  input_type: string;
  target_persona: string;
  original_query: string;
}

interface OrchestratorResponse {
  status: "success" | "missing_parameters" | "error";
  message: string;
  active_persona?: string;
  output_prose?: string;
  required_input?: RequiredInput;
  deliverables?: {
    missing_parameters?: string[];
    [key: string]: unknown;
  };
  timestamp?: string;
}

const PERSONAS = [
  {
    id: "ACCOUNT_STRATEGIST",
    key: "accountStrategist",
    promptKey: "prompt1",
    symbol: "📊",
  },
  {
    id: "DIWAN_LEGAL_AUDITOR",
    key: "diwanAuditor",
    promptKey: "prompt2",
    symbol: "⚖️",
  },
  {
    id: "PM_WORKFLOW_STEWARD",
    key: "projectSteward",
    promptKey: "prompt3",
    symbol: "🎯",
  },
  {
    id: "SOVEREIGN_ANALYTICS_TRACKER",
    key: "analyticsTracker",
    promptKey: "prompt4",
    symbol: "📈",
  },
] as const;

export default function AIOrchestratorWidget() {
  const { t } = useLocalization();
  const [promptInput, setPromptInput] = useState("");
  const [selectedPersona, setSelectedPersona] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [response, setResponse] = useState<OrchestratorResponse | null>(null);
  const [showParamModal, setShowParamModal] = useState(false);
  const [modalSpec, setModalSpec] = useState<RequiredInput | null>(null);
  const [modalInput, setModalInput] = useState("");
  const [pendingParams, setPendingParams] = useState<Record<string, string>>({});

  const executeQuery = useCallback(
    async (
      query: string,
      persona: string,
      params: Record<string, string> = {},
    ) => {
      setIsProcessing(true);
      setResponse(null);
      try {
        const result = await apiPost<OrchestratorResponse>(
          "/ai/orchestrator/query",
          {
            query,
            target_persona: persona || undefined,
            context_parameters: params,
          },
        );

        if (result.status === "missing_parameters" && result.required_input) {
          setModalSpec(result.required_input);
          setPendingParams(params);
          setShowParamModal(true);
        } else {
          setShowParamModal(false);
          setModalSpec(null);
        }
        setResponse(result);
      } catch (error) {
        setResponse({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : t("dashboard.ai.requestFailed"),
          output_prose: t("dashboard.ai.connectionError"),
        });
      } finally {
        setIsProcessing(false);
      }
    },
    [t],
  );

  const runCommand = (text?: string, persona?: string) => {
    const command = text || promptInput;
    if (!command.trim()) return;
    executeQuery(command, persona ?? selectedPersona);
    if (!text) setPromptInput("");
  };

  const submitRequiredParameter = () => {
    if (!modalSpec || !modalInput.trim()) return;
    const updatedParams = {
      ...pendingParams,
      [modalSpec.required_field]: modalInput,
    };
    setPendingParams(updatedParams);
    setShowParamModal(false);
    setModalInput("");
    executeQuery(
      modalSpec.original_query,
      modalSpec.target_persona,
      updatedParams,
    );
  };

  const activePersona = response?.active_persona
    ? PERSONAS.find(
        (persona) =>
          persona.id.toLowerCase() === response.active_persona?.toLowerCase(),
      )
    : undefined;

  return (
    <div
      data-testid="ai-orchestrator-widget"
      className="flex h-full flex-col justify-between gap-3"
    >
      <div className="flex items-center justify-between rounded-[var(--radius-surface)] border border-brand/20 bg-brand-light p-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-brand text-brand-foreground shadow-[var(--shadow-raised)]">
            <Brain className="size-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-xs font-bold">
                {t("dashboard.ai.sidecar")}
              </span>
              <span className="size-2 shrink-0 animate-pulse rounded-full bg-success" />
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {t("dashboard.ai.status")}
            </p>
          </div>
        </div>
        <Tag tone="brand">{t("dashboard.ai.latency")}</Tag>
      </div>

      <div className="space-y-2">
        <span className="flex items-center gap-1 text-xs font-bold text-muted-foreground">
          <Sparkles className="size-3.5 text-warning" aria-hidden />
          {t("dashboard.ai.quickCommands")}
        </span>
        <div className="flex flex-wrap gap-1.5">
          {PERSONAS.map((persona) => {
            const isActive = selectedPersona === persona.id;
            return (
              <Button
                key={persona.id}
                type="button"
                variant={isActive ? "default" : "secondary"}
                size="xs"
                aria-pressed={isActive}
                disabled={isProcessing}
                onClick={() => {
                  const nextPersona = isActive ? "" : persona.id;
                  setSelectedPersona(nextPersona);
                  runCommand(
                    t(`dashboard.ai.${persona.promptKey}`),
                    nextPersona,
                  );
                }}
                className="h-auto min-h-7 whitespace-normal"
              >
                <span aria-hidden>{persona.symbol}</span>
                {t(`dashboard.ai.personas.${persona.key}`)}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="relative">
        <Input
          value={promptInput}
          onChange={(event) => setPromptInput(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && runCommand()}
          placeholder={t("dashboard.ai.placeholder")}
          className="pe-24"
          aria-label={t("dashboard.ai.placeholder")}
        />
        <Button
          type="button"
          size="sm"
          disabled={isProcessing || !promptInput.trim()}
          onClick={() => runCommand()}
          className="absolute end-1 top-1/2 -translate-y-1/2"
        >
          {isProcessing ? (
            <Activity className="animate-spin" />
          ) : (
            <Zap />
          )}
          {t("dashboard.ai.run")}
        </Button>
      </div>

      {response ? (
        response.status === "error" ? (
          <Alert tone="danger" className="grid-cols-[auto_1fr]">
            <AlertTriangle />
            <span>{response.output_prose || response.message}</span>
          </Alert>
        ) : (
          <section className="space-y-2 rounded-[var(--radius-surface)] border border-border bg-muted/35 p-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              {activePersona ? (
                <Tag tone="brand">
                  <span aria-hidden>{activePersona.symbol}</span>
                  {t(`dashboard.ai.personas.${activePersona.key}`)}
                </Tag>
              ) : null}
              <ProvenanceBadge
                level={
                  response.status === "missing_parameters"
                    ? "assumption"
                    : "confident-recall"
                }
              />
              {response.status === "success" ? (
                <Tag tone="success">
                  <CheckCircle2 />
                  {t("dashboard.ai.executed")}
                </Tag>
              ) : (
                <Tag tone="warning">
                  <ShieldAlert />
                  {t("dashboard.ai.stopGate")}
                </Tag>
              )}
            </div>
            <p className="max-h-40 overflow-y-auto whitespace-pre-wrap leading-relaxed">
              {response.output_prose || response.message}
            </p>
          </section>
        )
      ) : null}

      {showParamModal && modalSpec ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/55 p-4 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="stop-gate-title"
            className="w-full max-w-md overflow-hidden rounded-[var(--radius-surface)] border border-border bg-popover text-popover-foreground shadow-[var(--shadow-overlay)]"
          >
            <header className="flex items-center justify-between border-b border-border bg-warning/10 p-4">
              <div className="flex items-center gap-2.5">
                <div className="flex size-9 items-center justify-center rounded-[var(--radius-control)] bg-warning text-brand-foreground">
                  <AlertTriangle className="size-5" aria-hidden />
                </div>
                <div>
                  <h3 id="stop-gate-title" className="text-sm font-bold">
                    {modalSpec.title}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {t("dashboard.ai.stopGateGuardrail")}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setShowParamModal(false)}
                aria-label={t("common.close")}
              >
                <X />
              </Button>
            </header>

            <div className="space-y-4 p-4">
              <p className="text-sm leading-relaxed text-muted-foreground">
                {modalSpec.description}
              </p>
              <label className="block space-y-1.5 text-sm font-bold">
                <span>{modalSpec.field_label}</span>
                <Input
                  type={
                    modalSpec.input_type === "number" ? "number" : "text"
                  }
                  value={modalInput}
                  onChange={(event) => setModalInput(event.target.value)}
                  onKeyDown={(event) =>
                    event.key === "Enter" && submitRequiredParameter()
                  }
                  placeholder={`${t("dashboard.ai.enterValue")} ${modalSpec.field_label}`}
                  autoFocus
                />
              </label>

              {response?.deliverables?.missing_parameters?.length ? (
                <div className="space-y-2 text-xs text-muted-foreground">
                  <span className="font-bold">
                    {t("dashboard.ai.missingParameters")}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {response.deliverables.missing_parameters.map(
                      (parameter) => (
                        <Tag
                          key={parameter}
                          tone={
                            parameter === modalSpec.required_field
                              ? "warning"
                              : "neutral"
                          }
                          className="font-mono"
                        >
                          {parameter}
                        </Tag>
                      ),
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <footer className="flex items-center justify-end gap-2 border-t border-border p-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowParamModal(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                disabled={!modalInput.trim()}
                onClick={submitRequiredParameter}
              >
                <Send />
                {t("dashboard.ai.submitAndRun")}
              </Button>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}
