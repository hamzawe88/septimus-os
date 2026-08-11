import { readFileSync, readdirSync, statSync } from "node:fs"
import { extname, join, relative, sep } from "node:path"
import process from "node:process"

const sourceRoot = join(process.cwd(), "src")
const sourceExtensions = new Set([".ts", ".tsx", ".css"])
const componentExtensions = new Set([".tsx"])

const legacyCeilings = {
  rawHexInComponents: 608,
  slateGrayUtilities: 6484,
  physicalDirectionUtilities: 104,
  hardcodedArabicFragments: 5195,
}

const governedFiles = new Set([
  "app/admin/design-system/page.tsx",
  "components/design-system/DesignSystemGallery.tsx",
  "components/ui/alert.tsx",
  "components/ui/badge.tsx",
  "components/ui/button.tsx",
  "components/ui/card.tsx",
  "components/ui/dialog.tsx",
  "components/ui/empty-state.tsx",
  "components/ui/form-field.tsx",
  "components/ui/input.tsx",
  "components/ui/pagination.tsx",
  "components/ui/progress.tsx",
  "components/ui/provenance.tsx",
  "components/ui/separator.tsx",
  "components/ui/skeleton.tsx",
  "components/ui/stat-tile.tsx",
  "components/ui/surface.tsx",
  "components/ui/switch.tsx",
  "components/ui/tabs.tsx",
  "components/ui/tag.tsx",
  "components/ui/textarea.tsx",
])

const patterns = {
  rawHexInComponents: /#[\da-f]{3,8}\b/gi,
  slateGrayUtilities: /\b(?:slate|gray)-\d{2,3}\b/g,
  physicalDirectionUtilities:
    /(?:^|[\s"'`])(?:left|right|ml|mr|pl|pr)-[^\s"'`}]+/gm,
  hardcodedArabicFragments: /[\u0621-\u064A]+/g,
}

function walk(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const absolutePath = join(directory, entry)
    return statSync(absolutePath).isDirectory()
      ? walk(absolutePath)
      : sourceExtensions.has(extname(entry))
        ? [absolutePath]
        : []
  })
}

function countMatches(value, pattern) {
  return value.match(pattern)?.length ?? 0
}

const files = walk(sourceRoot)
const componentFiles = files.filter((file) =>
  componentExtensions.has(extname(file)),
)
const metrics = Object.fromEntries(
  Object.keys(legacyCeilings).map((metric) => [metric, 0]),
)
const violations = []

for (const file of componentFiles) {
  const content = readFileSync(file, "utf8")
  const projectPath = relative(sourceRoot, file).split(sep).join("/")

  for (const [metric, pattern] of Object.entries(patterns)) {
    const count = countMatches(content, pattern)
    metrics[metric] += count
    if (governedFiles.has(projectPath) && count > 0) {
      violations.push(`${projectPath}: ${metric}=${count}`)
    }
  }
}

for (const [metric, ceiling] of Object.entries(legacyCeilings)) {
  if (metrics[metric] > ceiling) {
    violations.push(
      `${metric} increased from the migration ceiling ${ceiling} to ${metrics[metric]}`,
    )
  }
}

const globalsCss = readFileSync(join(sourceRoot, "app/globals.css"), "utf8")
const authoredPalette = new Set(
  [...globalsCss.matchAll(/--color-[\w-]+:\s*(#[\da-f]{6})\s*;/gi)].map(
    (match) => match[1].toUpperCase(),
  ),
)
if (authoredPalette.size > 12) {
  violations.push(
    `controlled CSS palette contains ${authoredPalette.size} hex colors; maximum is 12`,
  )
}

if (violations.length > 0) {
  console.error("Design constitution failed:")
  for (const violation of violations) console.error(`- ${violation}`)
  process.exit(1)
}

console.log(
  `Design constitution passed: ${authoredPalette.size}/12 palette colors; legacy ceilings did not increase.`,
)
