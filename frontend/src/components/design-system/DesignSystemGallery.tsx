"use client"

import { useState } from "react"
import {
  Bell,
  CheckCircle2,
  FileText,
  Info,
  Landmark,
  Moon,
  Sun,
} from "lucide-react"
import { useTheme } from "next-themes"

import { useLocalization } from "@/contexts/LocalizationContext"
import {
  THEME_PRESETS,
  type ThemePreset,
  useThemeStore,
} from "@/store/useThemeStore"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { FormField } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { Pagination } from "@/components/ui/pagination"
import { Progress } from "@/components/ui/progress"
import {
  ProvenanceBadge,
  ProvenanceSurface,
  type ProvenanceLevel,
} from "@/components/ui/provenance"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { StatTile } from "@/components/ui/stat-tile"
import {
  PanelBody,
  PanelDescription,
  PanelHeader,
  PanelTitle,
  Surface,
} from "@/components/ui/surface"
import { Switch } from "@/components/ui/switch"
import { Tag } from "@/components/ui/tag"
import { Textarea } from "@/components/ui/textarea"

const provenanceLevels: ProvenanceLevel[] = [
  "verified",
  "confident-recall",
  "assumption",
  "speculation",
]

export default function DesignSystemGallery() {
  const { t } = useLocalization()
  const { theme: activeTheme, setTheme } = useThemeStore()
  const { resolvedTheme, setTheme: setColorMode } = useTheme()
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  const [page, setPage] = useState(2)

  return (
    <main className="mx-auto w-full max-w-7xl space-y-8">
      <header className="grid gap-5 border-b border-border pb-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="min-w-0">
          <p className="mb-2 text-xs font-bold uppercase text-brand">
            {t("designSystem.eyebrow")}
          </p>
          <h1 className="text-3xl font-bold leading-tight text-foreground">
            {t("designSystem.title")}
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            {t("designSystem.description")}
          </p>
        </div>
        <div
          className="flex flex-wrap items-center gap-2"
          aria-label={t("designSystem.modeLabel")}
        >
          <Button
            variant={resolvedTheme === "light" ? "default" : "outline"}
            size="sm"
            onClick={() => setColorMode("light")}
          >
            <Sun />
            <span className="truncate">{t("designSystem.lightMode")}</span>
          </Button>
          <Button
            variant={resolvedTheme === "dark" ? "default" : "outline"}
            size="sm"
            onClick={() => setColorMode("dark")}
          >
            <Moon />
            <span className="truncate">{t("designSystem.darkMode")}</span>
          </Button>
        </div>
      </header>

      <GallerySection title={t("designSystem.sections.themes")}>
        <div
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          aria-label={t("designSystem.themeLabel")}
        >
          {(Object.keys(THEME_PRESETS) as ThemePreset[]).map((presetId) => {
            const preset = THEME_PRESETS[presetId]
            const isActive = activeTheme === presetId

            return (
              <button
                key={presetId}
                type="button"
                aria-pressed={isActive}
                onClick={() => setTheme(presetId)}
                className="group flex min-w-0 items-center gap-3 rounded-[var(--radius-surface)] border border-border bg-card p-3 text-start transition-all duration-200 hover:border-brand/40 aria-pressed:border-brand aria-pressed:bg-brand-light"
              >
                <span
                  aria-hidden="true"
                  className="size-10 shrink-0 rounded-[var(--radius-control)] shadow-[var(--shadow-raised)]"
                  style={{ backgroundColor: preset.primaryColor }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-foreground">
                    {t(preset.labelKey)}
                  </span>
                  <span className="mt-1 block h-1.5 overflow-hidden rounded-[var(--radius-control)] bg-muted">
                    <span
                      className="block h-full w-2/3"
                      style={{ backgroundColor: preset.sidebarBg }}
                    />
                  </span>
                </span>
                {isActive ? (
                  <CheckCircle2 className="size-4 shrink-0 text-brand" />
                ) : null}
              </button>
            )
          })}
        </div>
      </GallerySection>

      <div className="grid gap-6 xl:grid-cols-2">
        <GallerySection title={t("designSystem.sections.typography")}>
          <Surface variant="default" padding="lg" className="space-y-5">
            <div>
              <p className="text-xs font-bold text-brand">
                {t("designSystem.sampleHeading")}
              </p>
              <h2 className="mt-2 text-3xl font-bold leading-tight">
                {t("designSystem.sampleHeading")}
              </h2>
            </div>
            <Separator />
            <p className="max-w-xl text-base leading-relaxed text-muted-foreground">
              {t("designSystem.sampleBody")}
            </p>
            <div className="grid grid-cols-3 gap-3">
              {[12, 13, 15, 18, 24, 32].map((size) => (
                <div
                  key={size}
                  className="rounded-[var(--radius-control)] bg-muted p-3 text-center font-semibold"
                  style={{ fontSize: size }}
                >
                  {size}
                </div>
              ))}
            </div>
          </Surface>
        </GallerySection>

        <GallerySection title={t("designSystem.sections.surfaces")}>
          <div className="grid gap-3 sm:grid-cols-2">
            <StatTile
              label={t("designSystem.statLabel")}
              value="12"
              detail={t("designSystem.statDetail")}
              icon={<Landmark />}
            />
            <Surface variant="raised">
              <PanelHeader>
                <div className="min-w-0">
                  <PanelTitle>{t("designSystem.sampleHeading")}</PanelTitle>
                  <PanelDescription>
                    {t("designSystem.sampleBody")}
                  </PanelDescription>
                </div>
                <Tag tone="success">{t("designSystem.statusReady")}</Tag>
              </PanelHeader>
              <PanelBody className="space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
                <Skeleton className="h-3 w-2/3" />
              </PanelBody>
            </Surface>
          </div>
        </GallerySection>

        <GallerySection title={t("designSystem.sections.controls")}>
          <Surface className="space-y-5">
            <FormField
              htmlFor="design-system-reference"
              label={t("designSystem.fieldLabel")}
              hint={t("designSystem.fieldHint")}
              required
            >
              <Input
                id="design-system-reference"
                placeholder={t("designSystem.fieldPlaceholder")}
              />
            </FormField>
            <Textarea placeholder={t("designSystem.sampleBody")} />
            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span className="min-w-0 truncate text-sm font-semibold">
                {t("designSystem.notifications")}
              </span>
              <Switch
                checked={notificationsEnabled}
                onCheckedChange={setNotificationsEnabled}
                aria-label={t("designSystem.notifications")}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button>
                <CheckCircle2 />
                <span className="truncate">{t("designSystem.primaryAction")}</span>
              </Button>
              <Button variant="outline">
                <FileText />
                <span className="truncate">{t("designSystem.secondaryAction")}</span>
              </Button>
            </div>
          </Surface>
        </GallerySection>

        <GallerySection title={t("designSystem.sections.states")}>
          <div className="space-y-4">
            <Alert tone="info">
              <Info />
              <AlertTitle>{t("designSystem.alertTitle")}</AlertTitle>
              <AlertDescription>
                {t("designSystem.alertDescription")}
              </AlertDescription>
            </Alert>
            <div className="flex flex-wrap gap-2">
              <Tag tone="success">{t("designSystem.statusReady")}</Tag>
              <Tag tone="warning">{t("designSystem.statusReview")}</Tag>
              <Tag tone="danger">{t("designSystem.statusBlocked")}</Tag>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">
                {t("designSystem.progressLabel")}
              </p>
              <Progress
                value={72}
                aria-label={t("designSystem.progressLabel")}
              />
            </div>
            <Pagination
              page={page}
              totalPages={5}
              onPageChange={setPage}
              previousLabel={t("common.previous")}
              nextLabel={t("common.next")}
              pageLabel={t("designSystem.paginationLabel")}
            />
          </div>
        </GallerySection>
      </div>

      <GallerySection title={t("designSystem.sections.provenance")}>
        <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <Surface className="flex flex-wrap content-start gap-2">
            {provenanceLevels.map((level) => (
              <ProvenanceBadge key={level} level={level} />
            ))}
          </Surface>
          <ProvenanceSurface level="verified">
            {t("designSystem.provenance.sample")}
          </ProvenanceSurface>
        </div>
      </GallerySection>

      <EmptyState
        icon={<Bell />}
        title={t("designSystem.emptyTitle")}
        description={t("designSystem.emptyDescription")}
        action={
          <Button variant="outline">{t("designSystem.emptyAction")}</Button>
        }
      />
    </main>
  )
}

function GallerySection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold text-foreground">{title}</h2>
      {children}
    </section>
  )
}
