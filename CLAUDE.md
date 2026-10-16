# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev`: Vite dev server
- `npm run build`: type-check (`tsc -b`), then Vite build
- `npm run lint`: oxlint (config in `.oxlintrc.json`)
- `npm run preview`: serve the production build

There is no test suite. `npm run build` is the type check.

## What this is

This is a browser-only React 19 + TypeScript + Vite + Tailwind v4 app for designing hardware-monitor "sensor panels": a background plus positioned gauges. It exports to:
- PNG (the whole panel, a single gauge, or a zip of gauge frames)
- AIDA64 `.spzip` bundles
- InfoPanel `.infopanel` bundles
- its own `.sensorpaneldesign` JSON project file

There is no backend.

## Architecture

**State lives in `App.tsx`.** It holds `panel` (size + `BackgroundOptions`), `gauges: GaugeInstance[]`, `themes: ThemesMap` and `selectedIds`. Components in `src/components/` are controlled panels that receive slices of that state plus update callbacks. `selectedIds` is ordered, and `selectedIds[0]` is the anchor for multi-select actions (make same size, space evenly).

**Rendering is pure canvas code in `src/lib/`, with no React in it.** The same functions drive the live preview and every export, so the preview matches the exports:
- `gaugeRender.ts`: `drawOn(canvas, onCount, opts)` draws one gauge. It covers modes `bar | circ | needle | container` and their sub-styles (bar styles flat/ascending/slanted/thermometer; needle styles plain/classic). New gauge styles go here, with their options added to `DrawOptions` and `defaultDrawOptions`.
- `backgroundRender.ts`: `renderBackground()` draws the color, gradient, patterns, shape, title bar and image.
- `compose.ts`: `renderPanel()` draws the background, then each gauge on an offscreen canvas composited at the gauge's center.

**Key conventions across these modules:**
- **`onCount` units.** With `nSegs > 0`, `onCount` is a count of lit segments. With `nSegs === 0` (solid), it is a direct 0–100 percentage. Convert with `previewValueToOnCount`.
- **Rotated bars resize the canvas.** For a bar rotated 90° or 270°, `drawOn` swaps the canvas's width and height. Callers must read `canvas.width/height` after drawing and position the result by its center, not its top-left corner (see `compose.ts`, `gaugeFit.ts`, the exporters).
- **Themes are referenced by key.** A gauge stores a `themeKey` into the shared, user-editable `ThemesMap`, not its own colors. Always draw through `resolveDrawOptions(gauge, themes)` (`types.ts`).
- **Ring-gauge sizing.** For `circ` and `needle`, "same size" means the same visual ring radius, not the same box. See `computeGaugeOuterRadius` and `solveRingBoxForOuterRadius`.

**Persistence (`lib/file.ts`)**
- State autosaves to localStorage with a debounce.
- Save/load uses the same JSON shape (`SensorPanelFile`, `SENSOR_PANEL_FILE_VERSION`).
- When you add a field to `GaugeInstance`, backfill it in `normalizeGauge()` so older files and autosaves still load.
- Background images are stored as data URLs, so they serialize with everything else. `imageCache.ts` decodes them once so `renderBackground` can stay synchronous. It also downscales uploads to stay under the localStorage quota.

**Exporters (`lib/aida64.ts`, `lib/infopanel.ts`)** produce third-party formats that were reverse-engineered. The long header comments in each file record verified format details. Read them before changing anything there:
- **AIDA64:** the file is UTF-16LE with a BOM. Colors are COLORREF (BGR). Each gauge has exactly 16 state images. Disabled items are hidden, so unbound gauges default to sensor `SCPUUTI`.
- **InfoPanel:** it is .NET XmlSerializer XML. Asset paths inside the zip must use backslashes (`assets\name.png`).

Each gauge's exports are pre-rendered frame images (AIDA64 states, InfoPanel images, ExportBar's 21-frame set). Gauges never draw live in the target app. `jszip` is statically imported from `lib/zip.ts` (a dynamic `import('jszip')` 404s in Vite after a dep re-optimize).
