// Save/load support for this app's own .sensorpaneldesign project file — a
// plain JSON snapshot of everything needed to reopen a design exactly as it
// was. Deliberately a different extension from AIDA64's real .sensorpanel
// format (see lib/aida64.ts) so the two are never confused for one another.
import type { GaugeInstance, PanelConfig } from '../types';
import { normalizeGauge, normalizePanel, normalizeThemes } from '../types';
import type { ThemesMap } from './gaugeRender';

export const SENSOR_PANEL_FILE_VERSION = 1;

// Extra zip entry written next to panel.sp2 / Profile.xml. AIDA64 and
// InfoPanel ignore unknown root files, so our own .spzip/.infopanel round-trip
// losslessly while still remaining valid third-party bundles.
export const DESIGN_SIDECAR_NAME = 'design.sensorpaneldesign';

export interface SensorPanelFile {
  version: number;
  panel: PanelConfig;
  gauges: GaugeInstance[];
  themes: ThemesMap;
}

export function serializePanelFile(panel: PanelConfig, gauges: GaugeInstance[], themes: ThemesMap): string {
  const file: SensorPanelFile = { version: SENSOR_PANEL_FILE_VERSION, panel, gauges, themes };
  return JSON.stringify(file, null, 2);
}

// Only checks the shape actually needed to safely restore state — this is a
// local file the user picked, not an untrusted network payload, so it isn't
// worth a full schema validator on top of this.
export function parsePanelFile(json: string): SensorPanelFile {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (!data || typeof data !== 'object') {
    throw new Error('That file is not a Sensor Panel Designer file.');
  }
  const file = data as Partial<SensorPanelFile>;
  if (file.version !== SENSOR_PANEL_FILE_VERSION) {
    throw new Error(`Unsupported .sensorpaneldesign file version: ${String(file.version)}`);
  }
  if (!file.panel || !Array.isArray(file.gauges) || !file.themes) {
    throw new Error('That file is missing expected panel data.');
  }
  return {
    version: SENSOR_PANEL_FILE_VERSION,
    panel: normalizePanel(file.panel),
    gauges: file.gauges.map(g => normalizeGauge(g && typeof g === 'object' ? g : {})),
    themes: normalizeThemes(file.themes),
  };
}

export function downloadPanelFile(panel: PanelConfig, gauges: GaugeInstance[], themes: ThemesMap, filename: string) {
  const json = serializePanelFile(panel, gauges, themes);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// Auto-persists the whole design to localStorage (same shape/version as the
// downloadable .sensorpaneldesign file) so a browser refresh doesn't lose
// work. Versioned via the same SENSOR_PANEL_FILE_VERSION check as the file
// format, so a future schema change just makes old autosaves get ignored
// (parsePanelFile throws, caught below) rather than crash the app on load.
const AUTOSAVE_KEY = 'sensorPanelDesigner.autosave.v1';

// Returns false when storage is full, disabled, or unavailable (e.g. private
// browsing). Data-URL images live in this same JSON, so a few large ones can
// exceed the quota — the caller tells the user to save the project instead.
export function saveAutosave(panel: PanelConfig, gauges: GaugeInstance[], themes: ThemesMap): boolean {
  try {
    localStorage.setItem(AUTOSAVE_KEY, serializePanelFile(panel, gauges, themes));
    return true;
  } catch {
    return false;
  }
}

export function loadAutosave(): SensorPanelFile | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    return parsePanelFile(raw);
  } catch {
    return null;
  }
}

export function clearAutosave() {
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    // ignore
  }
}
