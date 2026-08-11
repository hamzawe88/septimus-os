"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Archive,
  Calendar,
  CheckCircle2,
  Database,
  FileText,
  FunctionSquare,
  GripVertical,
  Hash,
  History,
  Link as LinkIcon,
  List,
  Loader2,
  Monitor,
  Plus,
  RefreshCw,
  Save,
  Send,
  Smartphone,
  Type,
  ToggleLeft,
  Undo2,
  Redo2,
  User,
  X,
} from "lucide-react";
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd";
import { useLocalization } from "@/contexts/LocalizationContext";
import DynamicRecordsPanel from "@/components/entities/DynamicRecordsPanel";
import FieldGovernanceControls from "./schema-builder/FieldGovernanceControls";
import FormulaEditor from "./schema-builder/FormulaEditor";
import FormsStudioPanel from "./schema-builder/FormsStudioPanel";
import DataStudioPanel from "./schema-builder/DataStudioPanel";
import RelationStudioPanel from "./schema-builder/RelationStudioPanel";
import SchemaConflictDialog from "./schema-builder/SchemaConflictDialog";
import SchemaIdentityPanel from "./schema-builder/SchemaIdentityPanel";
import SchemaStudioTabs, {
  type SchemaStudioTab,
} from "./schema-builder/SchemaStudioTabs";
import ViewsStudioPanel from "./schema-builder/ViewsStudioPanel";
import {
  type SchemaDraftSnapshot,
  useSchemaDraftHistory,
} from "./schema-builder/useSchemaDraftHistory";
import ImpactReviewDialog from "./schema-builder/ImpactReviewDialog";
import SchemaGovernanceDialog from "./schema-builder/SchemaGovernanceDialog";
import {
  createDefaultField,
  createField,
  ensureFieldId,
  localizedSchemaText,
  normalizeSchemaKey,
} from "./schema-builder/fieldFactory";
import { schemaErrorPayload, schemaRequest } from "./schema-builder/schemaApi";
import type {
  DefinitionListResponse,
  DefinitionResponse,
  EntityDefinition,
  FieldSchema,
  FieldType,
  Notice,
  NoticeTone,
  SchemaImpactResponse,
  ValidationResponse,
} from "./schema-builder/types";

export default function EntityCreator() {
  const { language, t } = useLocalization();
  const [definitions, setDefinitions] = useState<EntityDefinition[]>([]);
  const [definitionId, setDefinitionId] = useState<string | null>(null);
  const [definitionKey, setDefinitionKey] = useState("new_data_model");
  const [labelAr, setLabelAr] = useState(() =>
    localizedSchemaText("ar", "schemaBuilder.defaults.entityName"),
  );
  const [labelEn, setLabelEn] = useState(() =>
    localizedSchemaText("en", "schemaBuilder.defaults.entityName"),
  );
  const [fields, setFields] = useState<FieldSchema[]>(() => [createDefaultField()]);
  const [titleFieldKey, setTitleFieldKey] = useState("title");
  const [draftRevision, setDraftRevision] = useState(0);
  const [currentVersion, setCurrentVersion] = useState(0);
  const [status, setStatus] = useState<EntityDefinition["status"]>("draft");
  const [isBusy, setIsBusy] = useState(false);
  const [isListLoading, setIsListLoading] = useState(true);
  const [isDirty, setIsDirty] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [impactReview, setImpactReview] = useState<SchemaImpactResponse | null>(null);
  const [governanceOpen, setGovernanceOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<SchemaStudioTab>("fields");
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");
  const [syncStatus, setSyncStatus] = useState<
    "idle" | "dirty" | "saving" | "saved" | "conflict" | "error"
  >("idle");
  const [conflictOpen, setConflictOpen] = useState(false);
  const saveInFlightRef = useRef(false);

  const activeEntityLabel = language === "ar" ? labelAr : labelEn;
  const visibleRecordFields = useMemo(
    () => fields.filter((field) => field.lifecycle !== "hidden"),
    [fields],
  );
  const activeDefinition = useMemo<EntityDefinition | null>(
    () =>
      definitionId
        ? {
            id: definitionId,
            key: definitionKey,
            label_ar: labelAr,
            label_en: labelEn,
            description_ar: "",
            description_en: "",
            status,
            current_version: currentVersion,
            draft_revision: draftRevision,
            title_field_key: titleFieldKey,
            updated_at: "",
          }
        : null,
    [
      currentVersion,
      definitionId,
      definitionKey,
      draftRevision,
      labelAr,
      labelEn,
      status,
      titleFieldKey,
    ],
  );
  const draftSnapshot = useMemo<SchemaDraftSnapshot>(
    () => ({
      definitionKey,
      labelAr,
      labelEn,
      titleFieldKey,
      fields,
    }),
    [definitionKey, fields, labelAr, labelEn, titleFieldKey],
  );
  const latestDraftSignatureRef = useRef(JSON.stringify(draftSnapshot));
  useEffect(() => {
    latestDraftSignatureRef.current = JSON.stringify(draftSnapshot);
  }, [draftSnapshot]);
  const applyHistorySnapshot = useCallback((snapshot: SchemaDraftSnapshot) => {
    setDefinitionKey(snapshot.definitionKey);
    setLabelAr(snapshot.labelAr);
    setLabelEn(snapshot.labelEn);
    setTitleFieldKey(snapshot.titleFieldKey);
    setFields(snapshot.fields);
    setIsDirty(true);
    setSyncStatus("dirty");
  }, []);
  const {
    canUndo,
    canRedo,
    undo,
    redo,
    resetHistory,
  } = useSchemaDraftHistory(draftSnapshot, applyHistorySnapshot);
  const markDirty = useCallback(() => {
    setIsDirty(true);
    setSyncStatus("dirty");
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.matches("input, textarea, select") ||
        target?.isContentEditable ||
        !(event.metaKey || event.ctrlKey) ||
        event.key.toLowerCase() !== "z"
      ) {
        return;
      }
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [redo, undo]);

  const fieldTypes = useMemo(
    () => [
      { type: "text" as const, label: t("schemaBuilder.fieldTypes.text"), icon: Type },
      { type: "number" as const, label: t("schemaBuilder.fieldTypes.number"), icon: Hash },
      { type: "integer" as const, label: t("schemaBuilder.fieldTypes.integer"), icon: Hash },
      { type: "boolean" as const, label: t("schemaBuilder.fieldTypes.boolean"), icon: ToggleLeft },
      { type: "date" as const, label: t("schemaBuilder.fieldTypes.date"), icon: Calendar },
      { type: "datetime" as const, label: t("schemaBuilder.fieldTypes.datetime"), icon: Calendar },
      { type: "list" as const, label: t("schemaBuilder.fieldTypes.list"), icon: List },
      { type: "user" as const, label: t("schemaBuilder.fieldTypes.user"), icon: User },
      { type: "file" as const, label: t("schemaBuilder.fieldTypes.file"), icon: FileText },
      { type: "relation" as const, label: t("schemaBuilder.fieldTypes.relation"), icon: LinkIcon },
      { type: "formula" as const, label: t("schemaBuilder.fieldTypes.formula"), icon: FunctionSquare },
    ],
    [t],
  );

  const getFieldIcon = useCallback(
    (type: FieldType) => {
      const item = fieldTypes.find((candidate) => candidate.type === type);
      const Icon = item?.icon || Type;
      return <Icon className="size-4 shrink-0" aria-hidden />;
    },
    [fieldTypes],
  );

  const showError = useCallback(
    (error: unknown, fallbackKey: string) => {
      const payload = schemaErrorPayload(error);
      setNotice({
        tone: "error",
        message:
          payload.code === "SCHEMA_REVISION_CONFLICT"
            ? t("schemaBuilder.messages.revisionConflict")
            : payload.code === "SCHEMA_KEY_CONFLICT"
              ? t("schemaBuilder.messages.keyConflict")
              : payload.code === "SCHEMA_FIELD_LIMIT_EXCEEDED" ||
                  payload.code === "SCHEMA_DEFINITION_LIMIT_EXCEEDED"
                ? t("schemaBuilder.messages.planLimit")
                : t(fallbackKey),
      });
    },
    [t],
  );
  const showResourceError = useCallback(() => {
    setNotice({
      tone: "error",
      message: t("schemaBuilder.messages.resourceFailed"),
    });
  }, [t]);

  const loadDefinitions = useCallback(async () => {
    setIsListLoading(true);
    try {
      const response = await schemaRequest<DefinitionListResponse>(
        "/schema-definitions?limit=100",
        "GET",
      );
      setDefinitions(response.data || []);
    } catch (error) {
      showError(error, "schemaBuilder.messages.loadFailed");
    } finally {
      setIsListLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDefinitions();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadDefinitions]);

  const resetBuilder = () => {
    const nextField = createDefaultField();
    const nextSnapshot: SchemaDraftSnapshot = {
      definitionKey: "new_data_model",
      labelAr: localizedSchemaText("ar", "schemaBuilder.defaults.entityName"),
      labelEn: localizedSchemaText("en", "schemaBuilder.defaults.entityName"),
      titleFieldKey: "title",
      fields: [nextField],
    };
    setDefinitionId(null);
    setDefinitionKey(nextSnapshot.definitionKey);
    setLabelAr(nextSnapshot.labelAr);
    setLabelEn(nextSnapshot.labelEn);
    setFields(nextSnapshot.fields);
    setTitleFieldKey(nextSnapshot.titleFieldKey);
    setDraftRevision(0);
    setCurrentVersion(0);
    setStatus("draft");
    setIsDirty(false);
    setNotice(null);
    setActiveTab("fields");
    setSyncStatus("idle");
    setConflictOpen(false);
    resetHistory(nextSnapshot);
  };

  const loadDefinition = async (id: string) => {
    setIsBusy(true);
    setNotice(null);
    try {
      const response = await schemaRequest<DefinitionResponse>(
        `/schema-definitions/${id}`,
        "GET",
      );
      const definition = response.definition;
      const loadedFields = (response.fields || []).map((field, index) =>
        ensureFieldId(field, index),
      );
      const nextSnapshot: SchemaDraftSnapshot = {
        definitionKey: definition.key,
        labelAr: definition.label_ar,
        labelEn: definition.label_en,
        titleFieldKey: definition.title_field_key,
        fields: loadedFields,
      };
      setDefinitionId(definition.id);
      setDefinitionKey(definition.key);
      setLabelAr(definition.label_ar);
      setLabelEn(definition.label_en);
      setFields(loadedFields);
      setTitleFieldKey(definition.title_field_key);
      setDraftRevision(definition.draft_revision);
      setCurrentVersion(definition.current_version);
      setStatus(definition.status);
      setIsDirty(false);
      setActiveTab("fields");
      setSyncStatus("saved");
      setConflictOpen(false);
      resetHistory(nextSnapshot);
    } catch (error) {
      showError(error, "schemaBuilder.messages.loadDefinitionFailed");
    } finally {
      setIsBusy(false);
    }
  };

  const updateField = (id: string, updates: Partial<FieldSchema>) => {
    setFields((current) =>
      current.map((field) => (field.id === id ? { ...field, ...updates } : field)),
    );
    markDirty();
  };

  const updateFieldLabel = (id: string, value: string) => {
    const key = language === "ar" ? "label_ar" : "label_en";
    updateField(id, { [key]: value });
  };

  const addField = (type: FieldType) => {
    setFields((current) => [...current, createField(type, current.length)]);
    markDirty();
  };

  const removeField = (id: string) => {
    setFields((current) => {
      const next = current.filter((field) => field.id !== id);
      if (!next.some((field) => field.key === titleFieldKey)) {
        const nextTitle = next.find((field) => field.type === "text");
        setTitleFieldKey(nextTitle?.key || "");
      }
      return next.map((field, position) => ({ ...field, position }));
    });
    markDirty();
  };

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    setFields((current) => {
      const next = [...current];
      const [moved] = next.splice(result.source.index, 1);
      next.splice(result.destination!.index, 0, moved);
      return next.map((field, position) => ({ ...field, position }));
    });
    markDirty();
  };

  const draftPayload = useMemo(
    () => ({
      key: definitionKey,
      label_ar: labelAr,
      label_en: labelEn,
      description_ar: "",
      description_en: "",
      title_field_key: titleFieldKey,
      fields: fields.map((field, position) => ({ ...field, position })),
    }),
    [definitionKey, fields, labelAr, labelEn, titleFieldKey],
  );

  const saveDraft = useCallback(async (
    options: { silent?: boolean; expectedRevision?: number } = {},
  ): Promise<DefinitionResponse | null> => {
    if (!definitionKey || !labelAr.trim() || !labelEn.trim() || fields.length === 0) {
      setSyncStatus("error");
      if (!options.silent) {
        setNotice({ tone: "error", message: t("schemaBuilder.messages.requiredFields") });
      }
      return null;
    }
    if (saveInFlightRef.current) return null;
    saveInFlightRef.current = true;
    const submittedSignature = JSON.stringify(draftSnapshot);
    if (!options.silent) {
      setIsBusy(true);
      setNotice(null);
    }
    setSyncStatus("saving");
    try {
      const response = definitionId
        ? await schemaRequest<DefinitionResponse>(
            `/schema-definitions/${definitionId}/draft`,
            "PATCH",
            {
              ...draftPayload,
              expected_revision: options.expectedRevision ?? draftRevision,
            },
          )
        : await schemaRequest<DefinitionResponse>(
            "/schema-definitions",
            "POST",
            {
              ...draftPayload,
              expected_revision: options.expectedRevision ?? draftRevision,
            },
          );
      setDefinitionId(response.definition.id);
      setDraftRevision(response.definition.draft_revision);
      setCurrentVersion(response.definition.current_version);
      setStatus(response.definition.status);
      if (latestDraftSignatureRef.current === submittedSignature) {
        setIsDirty(false);
        setSyncStatus("saved");
      } else {
        setSyncStatus("dirty");
      }
      setConflictOpen(false);
      if (!options.silent) {
        setNotice({ tone: "success", message: t("schemaBuilder.messages.draftSaved") });
        await loadDefinitions();
      }
      return response;
    } catch (error) {
      if (schemaErrorPayload(error).code === "SCHEMA_REVISION_CONFLICT") {
        setSyncStatus("conflict");
        setConflictOpen(true);
      } else {
        setSyncStatus("error");
        showError(error, "schemaBuilder.messages.saveFailed");
      }
      return null;
    } finally {
      saveInFlightRef.current = false;
      if (!options.silent) setIsBusy(false);
    }
  }, [
    definitionId,
    definitionKey,
    draftPayload,
    draftRevision,
    draftSnapshot,
    fields.length,
    labelAr,
    labelEn,
    loadDefinitions,
    showError,
    t,
  ]);

  useEffect(() => {
    if (
      !definitionId ||
      !isDirty ||
      isBusy ||
      status === "archived" ||
      syncStatus === "conflict"
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      void saveDraft({ silent: true });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [definitionId, isBusy, isDirty, saveDraft, status, syncStatus]);

  const reloadConflictingDraft = async () => {
    if (!definitionId) return;
    setConflictOpen(false);
    await loadDefinition(definitionId);
  };

  const keepLocalConflictingDraft = async () => {
    if (!definitionId) return;
    setIsBusy(true);
    try {
      const remote = await schemaRequest<DefinitionResponse>(
        `/schema-definitions/${definitionId}`,
        "GET",
      );
      const saved = await saveDraft({
        expectedRevision: remote.definition.draft_revision,
      });
      if (saved) {
        setConflictOpen(false);
        setSyncStatus("saved");
      }
    } catch (error) {
      setSyncStatus("error");
      showError(error, "schemaBuilder.messages.saveFailed");
    } finally {
      setIsBusy(false);
    }
  };

  const validateDraft = async () => {
    const saved = isDirty || !definitionId ? await saveDraft() : null;
    const id = saved?.definition.id || definitionId;
    if (!id) return;
    setIsBusy(true);
    try {
      const response = await schemaRequest<ValidationResponse>(
        `/schema-definitions/${id}/validate`,
        "POST",
        {},
      );
      setNotice({
        tone: "success",
        message: `${t("schemaBuilder.messages.validSchema")} · ${response.field_count}`,
      });
    } catch (error) {
      showError(error, "schemaBuilder.messages.validationFailed");
    } finally {
      setIsBusy(false);
    }
  };

  const publishDefinition = async () => {
    const saved = isDirty || !definitionId ? await saveDraft() : null;
    const id = saved?.definition.id || definitionId;
    const revision = saved?.definition.draft_revision || draftRevision;
    if (!id) return;
    setIsBusy(true);
    setNotice(null);
    try {
      const impact = await schemaRequest<SchemaImpactResponse>(
        `/schema-definitions/${id}/impact`,
        "POST",
        { expected_revision: revision },
      );
      setImpactReview(impact);
    } catch (error) {
      showError(error, "schemaBuilder.messages.impactFailed");
    } finally {
      setIsBusy(false);
    }
  };

  const confirmImpactAndPublish = async () => {
    if (!definitionId || !impactReview) return;
    setIsBusy(true);
    setNotice(null);
    try {
      if (impactReview.report.severity !== "safe") {
        await schemaRequest(
          `/schema-definitions/${definitionId}/change-jobs/${impactReview.job.id}/approve`,
          "POST",
          {},
        );
      }
      const response = await schemaRequest<DefinitionResponse>(
        `/schema-definitions/${definitionId}/publish`,
        "POST",
        {
          expected_revision: impactReview.report.draft_revision,
          impact_job_id: impactReview.job.id,
        },
      );
      setDraftRevision(response.definition.draft_revision);
      setCurrentVersion(response.definition.current_version);
      setStatus(response.definition.status);
      setImpactReview(null);
      setNotice({
        tone: "success",
        message: response.migration_job
          ? t("schemaBuilder.messages.publishedWithMigration")
          : t("schemaBuilder.messages.published"),
      });
      await loadDefinitions();
    } catch (error) {
      showError(error, "schemaBuilder.messages.publishFailed");
    } finally {
      setIsBusy(false);
    }
  };

  const noticeClasses: Record<NoticeTone, string> = {
    success: "border-success/20 bg-success/10 text-success",
    error: "border-destructive/20 bg-destructive/10 text-destructive",
    info: "border-info/20 bg-info/10 text-info",
  };

  return (
    <div data-testid="schema-builder" className="flex h-full min-h-0 bg-[var(--bg-secondary)] text-[var(--text-primary)]">
      <aside className="hidden w-64 shrink-0 flex-col border-e border-[var(--border-color)] bg-[var(--bg-primary)] xl:flex">
        <div className="flex items-center justify-between gap-2.5 border-b border-[var(--border-color)] p-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{t("schemaBuilder.schemas")}</p>
            <p className="truncate text-xs text-[var(--text-secondary)]">
              {t("schemaBuilder.schemasHint")}
            </p>
          </div>
          <button
            type="button"
            onClick={resetBuilder}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-all duration-200 hover:bg-primary-hover"
            title={t("schemaBuilder.newSchema")}
            aria-label={t("schemaBuilder.newSchema")}
          >
            <Plus className="size-4" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {isListLoading ? (
            <div className="flex items-center justify-center p-8 text-[var(--text-secondary)]">
              <Loader2 className="size-5 animate-spin" aria-label={t("schemaBuilder.loading")} />
            </div>
          ) : definitions.length === 0 ? (
            <div className="p-6 text-center">
              <Database className="mx-auto size-8 text-[var(--text-secondary)]" aria-hidden />
              <p className="mt-3 text-sm font-semibold">{t("schemaBuilder.emptySchemas")}</p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                {t("schemaBuilder.emptySchemasHint")}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {definitions.map((definition) => (
                <button
                  key={definition.id}
                  type="button"
                  onClick={() => void loadDefinition(definition.id)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-start transition-all duration-200 ${
                    definition.id === definitionId
                      ? "bg-brand-light text-brand"
                      : "hover:bg-[var(--bg-secondary)]"
                  }`}
                >
                  <Database className="size-4 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {language === "ar" ? definition.label_ar : definition.label_en}
                    </span>
                    <span className="block truncate font-mono text-[11px] text-[var(--text-secondary)]">
                      {definition.key}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      definition.status === "published"
                        ? "bg-success/10 text-success"
                        : "bg-warning/10 text-warning"
                    }`}
                  >
                    {t(`schemaBuilder.status.${definition.status}`)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      <section className="flex w-full shrink-0 flex-col border-e border-[var(--border-color)] bg-[var(--bg-primary)] lg:w-[28rem] xl:w-[31rem]">
        <header className="flex items-center justify-between gap-3 border-b border-[var(--border-color)] p-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand">
              <Database className="size-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold">{t("schemaBuilder.title")}</h1>
              <p className="truncate text-xs text-[var(--text-secondary)]">
                {t("schemaBuilder.subtitle")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {definitionId && (
              <button
                type="button"
                onClick={() => setGovernanceOpen(true)}
                className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border-color)] transition-all duration-200 hover:bg-[var(--bg-secondary)]"
                title={t("schemaBuilder.history.title")}
                aria-label={t("schemaBuilder.history.title")}
              >
                <History className="size-4" aria-hidden />
              </button>
            )}
            <button
              type="button"
              onClick={() => void loadDefinitions()}
              className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border-color)] transition-all duration-200 hover:bg-[var(--bg-secondary)]"
              title={t("schemaBuilder.refresh")}
              aria-label={t("schemaBuilder.refresh")}
            >
              <RefreshCw className="size-4" aria-hidden />
            </button>
          </div>
        </header>
        <SchemaStudioTabs
          active={activeTab}
          t={t}
          onChange={setActiveTab}
          onOpenHistory={() => setGovernanceOpen(true)}
        />

        <div className="min-h-0 flex-1 space-y-7 overflow-y-auto p-5">
          {notice && (
            <div
              role={notice.tone === "error" ? "alert" : "status"}
              className={`flex items-start gap-2.5 rounded-xl border p-3 text-sm ${noticeClasses[notice.tone]}`}
            >
              {notice.tone === "success" ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
              ) : (
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              )}
              <span>{notice.message}</span>
            </div>
          )}

          {activeTab === "fields" && (
            <>
          <SchemaIdentityPanel
            definitionKey={definitionKey}
            labelAr={labelAr}
            labelEn={labelEn}
            titleFieldKey={titleFieldKey}
            currentVersion={currentVersion}
            fields={fields}
            t={t}
            onDefinitionKeyChange={(value) => {
              setDefinitionKey(normalizeSchemaKey(value));
              markDirty();
            }}
            onLabelArChange={(value) => {
              setLabelAr(value);
              markDirty();
            }}
            onLabelEnChange={(value) => {
              setLabelEn(value);
              markDirty();
            }}
            onTitleFieldChange={(value) => {
              setTitleFieldKey(value);
              markDirty();
            }}
          />

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2.5">
              <div>
                <h2 className="text-sm font-bold">{t("schemaBuilder.fields")}</h2>
                <p className="text-xs text-[var(--text-secondary)]">
                  {t("schemaBuilder.fieldsHint")}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-[var(--bg-secondary)] px-2.5 py-1 text-xs font-semibold">
                {fields.length}
              </span>
            </div>

            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="schema-fields">
                {(provided) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className="space-y-2.5"
                  >
                    {fields.map((field, index) => (
                      <Draggable key={field.id} draggableId={field.id} index={index}>
                        {(draggableProvided, snapshot) => (
                          <div
                            ref={draggableProvided.innerRef}
                            {...draggableProvided.draggableProps}
                            className={`rounded-xl border bg-[var(--bg-secondary)] p-3 transition-all duration-200 ${
                              snapshot.isDragging
                                ? "border-primary shadow-lg ring-2 ring-primary/20"
                                : "border-[var(--border-color)] hover:border-primary/40"
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <button
                                type="button"
                                {...draggableProvided.dragHandleProps}
                                className="flex size-7 shrink-0 cursor-grab items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-primary)] active:cursor-grabbing"
                                aria-label={t("schemaBuilder.reorderField")}
                              >
                                <GripVertical className="size-4" aria-hidden />
                              </button>
                              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-secondary)]">
                                {getFieldIcon(field.type)}
                              </div>
                              <input
                                value={language === "ar" ? field.label_ar : field.label_en}
                                onChange={(event) => updateFieldLabel(field.id, event.target.value)}
                                className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
                                aria-label={t("schemaBuilder.fieldLabel")}
                                placeholder={t("schemaBuilder.fieldLabelPlaceholder")}
                              />
                              <button
                                type="button"
                                onClick={() => updateField(field.id, { required: !field.required })}
                                disabled={field.type === "formula"}
                                aria-pressed={field.required}
                                className={`shrink-0 rounded-md border px-2 py-1 text-[11px] font-bold transition-all duration-200 ${
                                  field.required
                                    ? "border-primary/30 bg-brand-light text-brand"
                                    : "border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-primary)]"
                                } disabled:cursor-not-allowed disabled:opacity-40`}
                              >
                                {t("schemaBuilder.required")}
                              </button>
                              <button
                                type="button"
                                onClick={() => removeField(field.id)}
                                disabled={fields.length === 1}
                                className="flex size-7 shrink-0 items-center justify-center rounded-md text-[var(--text-secondary)] transition-all duration-200 hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-30"
                                title={t("schemaBuilder.removeField")}
                                aria-label={t("schemaBuilder.removeField")}
                              >
                                <X className="size-4" aria-hidden />
                              </button>
                            </div>
                            <div className="mt-2 grid grid-cols-[minmax(0,1fr)_8rem] gap-2 ps-[4.625rem]">
                              <input
                                dir="ltr"
                                value={field.key}
                                onChange={(event) =>
                                  updateField(field.id, {
                                    key: normalizeSchemaKey(event.target.value),
                                  })
                                }
                                className="min-w-0 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 font-mono text-xs outline-none focus:border-primary"
                                aria-label={t("schemaBuilder.fieldKey")}
                                placeholder={t("schemaBuilder.fieldKeyPlaceholder")}
                              />
                              <select
                                value={field.type}
                                onChange={(event) =>
                                  updateField(field.id, {
                                    type: event.target.value as FieldType,
                                    options:
                                      event.target.value === "list"
                                        ? field.options || []
                                        : undefined,
                                    relation:
                                      event.target.value === "relation"
                                        ? field.relation || {
                                            target_definition_key: "",
                                            cardinality: "one",
                                            on_delete: "restrict",
                                          }
                                        : undefined,
                                    formula:
                                      event.target.value === "formula"
                                        ? field.formula || {
                                            expression: "0",
                                            result_type: "number",
                                          }
                                        : undefined,
                                    required:
                                      event.target.value === "formula" ? false : field.required,
                                  })
                                }
                                className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-2 text-xs outline-none focus:border-primary"
                                aria-label={t("schemaBuilder.fieldType")}
                              >
                                {fieldTypes.map((type) => (
                                  <option key={type.type} value={type.type}>
                                    {type.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            {field.type === "list" && (
                              <div className="mt-2 ps-[4.625rem]">
                                <input
                                  dir="ltr"
                                  value={(field.options || []).join(", ")}
                                  onChange={(event) =>
                                    updateField(field.id, {
                                      options: event.target.value
                                        .split(",")
                                        .map((option) => option.trim()),
                                    })
                                  }
                                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-xs outline-none focus:border-primary"
                                  aria-label={t("schemaBuilder.listOptions")}
                                  placeholder={t("schemaBuilder.listOptionsPlaceholder")}
                                />
                              </div>
                            )}
                            {field.type === "relation" && (
                              <div className="mt-2 grid grid-cols-1 gap-2 ps-[4.625rem] sm:grid-cols-3">
                                <label className="space-y-1">
                                  <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
                                    {t("schemaBuilder.relationTarget")}
                                  </span>
                                  <select
                                    value={field.relation?.target_definition_key || ""}
                                    onChange={(event) =>
                                      updateField(field.id, {
                                        relation: {
                                          target_definition_key: event.target.value,
                                          cardinality: field.relation?.cardinality || "one",
                                          on_delete: field.relation?.on_delete || "restrict",
                                        },
                                      })
                                    }
                                    className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-2 text-xs outline-none focus:border-primary"
                                  >
                                    <option value="">{t("schemaBuilder.selectSchema")}</option>
                                    {definitions
                                      .filter(
                                        (definition) =>
                                          definition.status === "published" &&
                                          definition.key !== definitionKey,
                                      )
                                      .map((definition) => (
                                        <option key={definition.id} value={definition.key}>
                                          {language === "ar"
                                            ? definition.label_ar
                                            : definition.label_en}
                                        </option>
                                      ))}
                                  </select>
                                </label>
                                <label className="space-y-1">
                                  <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
                                    {t("schemaBuilder.cardinality")}
                                  </span>
                                  <select
                                    value={field.relation?.cardinality || "one"}
                                    onChange={(event) =>
                                      updateField(field.id, {
                                        relation: {
                                          target_definition_key:
                                            field.relation?.target_definition_key || "",
                                          cardinality: event.target.value as "one" | "many",
                                          on_delete: field.relation?.on_delete || "restrict",
                                        },
                                      })
                                    }
                                    className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-2 text-xs outline-none focus:border-primary"
                                  >
                                    <option value="one">{t("schemaBuilder.cardinalityOne")}</option>
                                    <option value="many">{t("schemaBuilder.cardinalityMany")}</option>
                                  </select>
                                </label>
                                <label className="space-y-1">
                                  <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
                                    {t("schemaBuilder.onDelete")}
                                  </span>
                                  <select
                                    value={field.relation?.on_delete || "restrict"}
                                    onChange={(event) =>
                                      updateField(field.id, {
                                        relation: {
                                          target_definition_key:
                                            field.relation?.target_definition_key || "",
                                          cardinality: field.relation?.cardinality || "one",
                                          on_delete: event.target.value as
                                            | "restrict"
                                            | "nullify"
                                            | "cascade",
                                        },
                                      })
                                    }
                                    className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-2 text-xs outline-none focus:border-primary"
                                  >
                                    <option value="restrict">{t("schemaBuilder.onDeleteRestrict")}</option>
                                    <option value="nullify">{t("schemaBuilder.onDeleteNullify")}</option>
                                    <option value="cascade">{t("schemaBuilder.onDeleteCascade")}</option>
                                  </select>
                                </label>
                              </div>
                            )}
                            {field.type === "formula" && (
                              <FormulaEditor
                                definitionId={definitionId}
                                field={field}
                                fields={fields}
                                language={language}
                                t={t}
                                onChange={(expression) =>
                                  updateField(field.id, {
                                    formula: { expression, result_type: "number" },
                                  })
                                }
                              />
                            )}
                            <div className="ps-[4.625rem]">
                              <FieldGovernanceControls
                                field={field}
                                t={t}
                                onChange={(updates) => updateField(field.id, updates)}
                              />
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          </div>

          <div className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              {t("schemaBuilder.basicFields")}
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {fieldTypes.filter(({ type }) => type !== "relation" && type !== "formula").map(({ type, label, icon: Icon }) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => addField(type)}
                  className="flex items-center gap-2.5 rounded-lg border border-[var(--border-color)] px-3 py-2.5 text-sm font-semibold transition-all duration-200 hover:border-primary/40 hover:bg-brand-light"
                >
                  <Icon className="size-4 shrink-0 text-brand" aria-hidden />
                  <span className="truncate">{label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              {t("schemaBuilder.advancedFields")}
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {fieldTypes.filter(({ type }) => type === "relation" || type === "formula").map(({ type, label, icon: Icon }) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => addField(type)}
                  className="flex items-center gap-2.5 rounded-lg border border-[var(--border-color)] px-3 py-2.5 text-sm font-semibold transition-all duration-200 hover:border-primary/40 hover:bg-brand-light"
                >
                  <Icon className="size-4 shrink-0 text-brand" aria-hidden />
                  <span className="truncate">{label}</span>
                </button>
              ))}
            </div>
          </div>
            </>
          )}
          {activeTab === "relations" && (
            <RelationStudioPanel
              fields={fields}
              definitions={definitions}
              language={language}
              t={t}
              onAddRelation={() => {
                addField("relation");
                setActiveTab("fields");
              }}
            />
          )}
          {activeTab === "forms" && (
            <FormsStudioPanel
              definitionId={definitionId}
              fields={fields}
              t={t}
              onError={showResourceError}
            />
          )}
          {activeTab === "views" && (
            <ViewsStudioPanel
              definitionId={definitionId}
              fields={fields}
              t={t}
              onError={showResourceError}
            />
          )}
          {activeTab === "data" && (
            <DataStudioPanel
              definitionId={definitionId}
              definitionKey={definitionKey}
              fields={visibleRecordFields}
              published={status === "published" && currentVersion > 0}
              t={t}
            />
          )}
        </div>

        <footer className="space-y-3 border-t border-[var(--border-color)] bg-[var(--bg-secondary)] p-4">
          <div className="flex items-center justify-between gap-2 text-xs text-[var(--text-secondary)]">
            <span className="truncate" aria-live="polite">
              {t(`schemaBuilder.sync.${syncStatus}`)}
            </span>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={undo}
                disabled={!canUndo || isBusy}
                className="flex size-7 items-center justify-center rounded-md transition-all duration-200 hover:bg-[var(--bg-primary)] disabled:opacity-30"
                title={t("schemaBuilder.historyActions.undo")}
                aria-label={t("schemaBuilder.historyActions.undo")}
              >
                <Undo2 className="size-3.5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={redo}
                disabled={!canRedo || isBusy}
                className="flex size-7 items-center justify-center rounded-md transition-all duration-200 hover:bg-[var(--bg-primary)] disabled:opacity-30"
                title={t("schemaBuilder.historyActions.redo")}
                aria-label={t("schemaBuilder.historyActions.redo")}
              >
                <Redo2 className="size-3.5" aria-hidden />
              </button>
              <span className="ms-1">
                {currentVersion > 0
                  ? `${t("schemaBuilder.version")} ${currentVersion}`
                  : t(`schemaBuilder.status.${status}`)}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => void saveDraft()}
              disabled={isBusy || syncStatus === "saving"}
              className="flex items-center justify-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2.5 text-sm font-semibold transition-all duration-200 hover:bg-brand-light disabled:opacity-60"
            >
              {isBusy ? (
                <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
              ) : (
                <Save className="size-4 shrink-0" aria-hidden />
              )}
              <span className="truncate">{t("schemaBuilder.saveDraft")}</span>
            </button>
            <button
              type="button"
              onClick={() => void validateDraft()}
              disabled={isBusy || syncStatus === "saving"}
              className="flex items-center justify-center gap-2 rounded-xl border border-primary/30 bg-brand-light px-3 py-2.5 text-sm font-semibold text-brand transition-all duration-200 hover:bg-primary/15 disabled:opacity-60"
            >
              <CheckCircle2 className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{t("schemaBuilder.validate")}</span>
            </button>
            <button
              type="button"
              onClick={() => void publishDefinition()}
              disabled={isBusy || syncStatus === "saving"}
              className="flex items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all duration-200 hover:bg-primary-hover disabled:opacity-60"
            >
              <Send className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{t("schemaBuilder.publish")}</span>
            </button>
          </div>
        </footer>
      </section>

      <main className="relative hidden min-w-0 flex-1 overflow-hidden lg:flex lg:flex-col">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,var(--border-color)_1px,transparent_1px),linear-gradient(to_bottom,var(--border-color)_1px,transparent_1px)] bg-[size:24px_24px] opacity-40" />
        <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center p-6 xl:p-10">
          <div
            className={`flex h-full max-h-[48rem] w-full flex-col overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-primary)] shadow-xl transition-[max-width] duration-300 ${
              previewDevice === "mobile" ? "max-w-sm" : "max-w-5xl"
            }`}
          >
            <div className="border-b border-[var(--border-color)] p-8">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-brand-light text-brand">
                    <Database className="size-7" aria-hidden />
                  </div>
                  <h2 className="truncate text-3xl font-extrabold">{activeEntityLabel}</h2>
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">
                    {t("schemaBuilder.previewDescription")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <div
                    className="flex rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-1"
                    role="group"
                    aria-label={t("schemaBuilder.preview.device")}
                  >
                    <button
                      type="button"
                      onClick={() => setPreviewDevice("desktop")}
                      className={`flex size-7 items-center justify-center rounded-md transition-colors ${
                        previewDevice === "desktop"
                          ? "bg-[var(--bg-primary)] text-primary shadow-sm"
                          : "text-[var(--text-secondary)]"
                      }`}
                      aria-label={t("schemaBuilder.preview.desktop")}
                      aria-pressed={previewDevice === "desktop"}
                    >
                      <Monitor className="size-3.5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewDevice("mobile")}
                      className={`flex size-7 items-center justify-center rounded-md transition-colors ${
                        previewDevice === "mobile"
                          ? "bg-[var(--bg-primary)] text-primary shadow-sm"
                          : "text-[var(--text-secondary)]"
                      }`}
                      aria-label={t("schemaBuilder.preview.mobile")}
                      aria-pressed={previewDevice === "mobile"}
                    >
                      <Smartphone className="size-3.5" aria-hidden />
                    </button>
                  </div>
                  <span className="shrink-0 rounded-full border border-[var(--border-color)] bg-[var(--bg-secondary)] px-3 py-1.5 text-xs font-bold">
                    {t(`schemaBuilder.status.${status}`)}
                  </span>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto bg-[var(--bg-secondary)] p-6">
              <div className="overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] shadow-sm">
                <div className="flex min-w-max border-b border-[var(--border-color)] bg-[var(--bg-secondary)]">
                  <div className="flex w-12 shrink-0 items-center justify-center border-e border-[var(--border-color)] p-3">
                    <input
                      type="checkbox"
                      disabled
                      className="rounded border-[var(--border-color)] text-primary"
                      aria-label={t("schemaBuilder.selectAll")}
                    />
                  </div>
                  {visibleRecordFields.map((field) => (
                    <div
                      key={field.id}
                      className="flex min-w-44 flex-1 items-center gap-2 border-e border-[var(--border-color)] p-3 text-xs font-bold text-[var(--text-secondary)] last:border-e-0"
                    >
                      {getFieldIcon(field.type)}
                      <span className="truncate">
                        {language === "ar" ? field.label_ar : field.label_en}
                      </span>
                      {field.required && (
                        <span className="shrink-0 text-destructive" aria-label={t("schemaBuilder.required")}>
                          *
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                <DynamicRecordsPanel
                  definitionKey={definitionKey}
                  fields={visibleRecordFields}
                  published={status === "published" && currentVersion > 0}
                />
              </div>
            </div>
          </div>
        </div>
        {status === "archived" && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-[var(--bg-primary)]/80">
            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] p-6 text-center shadow-xl">
              <Archive className="mx-auto size-8 text-[var(--text-secondary)]" aria-hidden />
              <p className="mt-3 font-bold">{t("schemaBuilder.archivedMessage")}</p>
            </div>
          </div>
        )}
      </main>
      <ImpactReviewDialog
        report={impactReview?.report || null}
        busy={isBusy}
        t={t}
        onClose={() => setImpactReview(null)}
        onConfirm={() => void confirmImpactAndPublish()}
      />
      <SchemaConflictDialog
        open={conflictOpen}
        busy={isBusy}
        t={t}
        onReload={() => void reloadConflictingDraft()}
        onKeepLocal={() => void keepLocalConflictingDraft()}
      />
      {governanceOpen && (
        <SchemaGovernanceDialog
          definition={activeDefinition}
          busy={isBusy}
          t={t}
          onClose={() => setGovernanceOpen(false)}
          onChanged={async () => {
            if (definitionId) await loadDefinition(definitionId);
            await loadDefinitions();
          }}
          onError={(error) => showError(error, "schemaBuilder.messages.historyFailed")}
        />
      )}
    </div>
  );
}
