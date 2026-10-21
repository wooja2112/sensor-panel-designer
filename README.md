# Sensor Panel Designer

A browser-only app for designing hardware-monitor sensor panels: a background plus positioned gauges. There is no server. Designs stay in the browser and download as files.

Gauges can be bars (flat, ascending, slanted, or thermometer), circular rings, needles, frames, labels, or images. Colors come from shared themes, so editing a theme updates every gauge that uses it.

## Run

```bash
npm install
npm run dev
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Type-check, then production build |
| `npm run preview` | Serve the production build |
| `npm run lint` | Lint |
| `npm run test` | Unit tests |

## Files

| Extension | Role |
| --- | --- |
| `.sensorpaneldesign` | This app's project file. Save and Open use it. The session also autosaves to localStorage; if large images fill the browser's storage, the header says so and Save project is the only copy. |
| PNG | The whole panel, one gauge, or a zip of gauge frames. |
| `.spzip` | AIDA64 SensorPanel bundle. Unbound gauges export as CPU Utilization (`SCPUUTI`) so they stay visible; rebind them in AIDA64. |
| `.infopanel` | InfoPanel profile. Gauges are unbound because those sensor ids are machine-specific; bind them in InfoPanel after import. |

Open also accepts AIDA64 and InfoPanel bundles. Bundles saved by this app reopen as an editable design. Bundles from elsewhere come in as placed images.

## Editing

Shift- or Ctrl-click selects more than one gauge. The first selected gauge is the anchor for Make same size and Space evenly. Arrow keys nudge the selection (Shift moves 10px). Delete removes it, Ctrl+D duplicates it, Ctrl+Z undoes, and Ctrl+S saves the project file.
