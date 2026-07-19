// Save/load support for this app's own .sensorpaneldesign project file — a
// plain JSON snapshot of everything needed to reopen a design exactly as it
// was. Deliberately a different extension from AIDA64's real .sensorpanel
// format (see lib/aida64.ts) so the two are never confused for one another.
import type { GaugeInstance, PanelConfig } from '../types';
import type { ThemesMap } from './gaugeRender';

export const SENSOR_PANEL_FILE_VERSION = 1;

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
  return file as SensorPanelFile;
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
