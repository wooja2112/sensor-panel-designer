import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GaugeInstance, PanelConfig } from './types';
import { createGaugeInstance, defaultPanelConfig } from './types';
import type { BackgroundOptions } from './lib/backgroundRender';
import type { DrawOptions, GaugeMode, ThemesMap } from './lib/gaugeRender';
import { DEFAULT_THEMES } from './lib/gaugeRender';
import { clearAutosave, downloadPanelFile, loadAutosave, parsePanelFile, saveAutosave } from './lib/file';
import { timestamp } from './lib/compose';
import { BackgroundPanel } from './components/BackgroundPanel';
import { GaugePanel } from './components/GaugePanel';
import { CanvasWorkspace } from './components/CanvasWorkspace';
import { LayersPanel } from './components/LayersPanel';
import { ExportBar } from './components/ExportBar';
import { ThemeDesigner } from './components/ThemeDesigner';

export default function App() {
  // Loaded exactly once, synchronously, before the first render's state
  // initializers run — a ref (not a fourth useState) so it doesn't need its
  // own setter or trigger a re-render.
  const autosaveRef = useRef<ReturnType<typeof loadAutosave> | undefined>(undefined);
  if (autosaveRef.current === undefined) autosaveRef.current = loadAutosave();
  const autosave = autosaveRef.current;

  const [panel, setPanel] = useState<PanelConfig>(() => autosave?.panel ?? defaultPanelConfig());
  const [gauges, setGauges] = useState<GaugeInstance[]>(() => autosave?.gauges ?? []);
  const [themes, setThemes] = useState<ThemesMap>(() => autosave?.themes ?? structuredClone(DEFAULT_THEMES));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showDesigner, setShowDesigner] = useState(false);
  const [restoredBannerDismissed, setRestoredBannerDismissed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedGauge = useMemo(() => gauges.find(g => g.id === selectedId) ?? null, [gauges, selectedId]);

  // Debounced so a drag/resize (many state updates per second) doesn't hit
  // localStorage — a synchronous API — on every single pointermove.
  useEffect(() => {
    const t = setTimeout(() => saveAutosave(panel, gauges, themes), 400);
    return () => clearTimeout(t);
  }, [panel, gauges, themes]);

  const startFresh = useCallback(() => {
    clearAutosave();
    setPanel(defaultPanelConfig());
    setGauges([]);
    setThemes(structuredClone(DEFAULT_THEMES));
    setSelectedId(null);
    setRestoredBannerDismissed(true);
  }, []);

  const handleSave = useCallback(() => {
    downloadPanelFile(panel, gauges, themes, `panel-${timestamp()}.sensorpaneldesign`);
  }, [panel, gauges, themes]);

  const handleOpenClick = useCallback(() => fileInputRef.current?.click(), []);

  const handleFileSelected = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = parsePanelFile(String(reader.result));
        setPanel(data.panel);
        setGauges(data.gauges);
        setThemes(data.themes);
        setSelectedId(null);
        setRestoredBannerDismissed(true);
      } catch (err) {
        window.alert(err instanceof Error ? err.message : 'Failed to open file.');
      }
    };
    reader.readAsText(file);
  }, []);

  const updateBackground = useCallback((patch: Partial<BackgroundOptions>) => {
    setPanel(p => ({ ...p, background: { ...p.background, ...patch } }));
  }, []);

  const updatePanelSize = useCallback((patch: Partial<{ width: number; height: number }>) => {
    setPanel(p => ({ ...p, ...patch }));
  }, []);

  const addGauge = useCallback((mode: GaugeMode) => {
    const themeKey = Object.keys(themes)[0] ?? 'classic';
    const gauge = createGaugeInstance(mode, themeKey, panel.width / 2, panel.height / 2);
    setGauges(gs => [...gs, gauge]);
    setSelectedId(gauge.id);
  }, [panel.width, panel.height, themes]);

  const updateGaugeOpts = useCallback((id: string, patch: Partial<DrawOptions>) => {
    setGauges(gs => gs.map(g => g.id === id ? { ...g, opts: { ...g.opts, ...patch } } : g));
  }, []);

  const updateGaugeMeta = useCallback((id: string, patch: Partial<Pick<GaugeInstance, 'name' | 'x' | 'y' | 'width' | 'height' | 'previewValue' | 'themeKey' | 'aidaSensorId'>>) => {
    setGauges(gs => gs.map(g => g.id === id ? { ...g, ...patch } : g));
  }, []);

  const moveGauge = useCallback((id: string, x: number, y: number) => {
    setGauges(gs => gs.map(g => g.id === id ? { ...g, x, y } : g));
  }, []);

  const resizeGauge = useCallback((id: string, width: number, height: number) => {
    setGauges(gs => gs.map(g => g.id === id ? { ...g, width, height } : g));
  }, []);

  const deleteGauge = useCallback((id: string) => {
    setGauges(gs => gs.filter(g => g.id !== id));
    setSelectedId(sel => sel === id ? null : sel);
  }, []);

  const duplicateGauge = useCallback((id: string) => {
    setGauges(gs => {
      const src = gs.find(g => g.id === id);
      if (!src) return gs;
      const clone: GaugeInstance = {
        ...src,
        id: `${src.id}-copy-${Date.now().toString(36)}`,
        name: `${src.name} copy`,
        x: src.x + 16,
        y: src.y + 16,
        opts: { ...src.opts, containerCorners: [...src.opts.containerCorners] },
      };
      setSelectedId(clone.id);
      return [...gs, clone];
    });
  }, []);

  const reorderGauge = useCallback((id: string, dir: -1 | 1) => {
    setGauges(gs => {
      const i = gs.findIndex(g => g.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= gs.length) return gs;
      const next = [...gs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }, []);

  return (
    <div className="h-screen bg-background text-foreground p-5 flex flex-col gap-4 overflow-hidden" style={{ fontFamily: "'DM Mono', monospace" }}>
      <div className="flex items-baseline gap-3">
        <h1 className="text-base font-medium tracking-tight text-foreground">Sensor Panel Designer</h1>
        <span className="text-[11px] text-muted-foreground">background + gauge compositor</span>
        {autosave && !restoredBannerDismissed && (
          <span className="text-[11px] text-muted-foreground">
            · restored your last session —{' '}
            <button type="button" onClick={startFresh} className="underline hover:text-foreground cursor-pointer">start fresh</button>
            {' '}·{' '}
            <button type="button" onClick={() => setRestoredBannerDismissed(true)} className="underline hover:text-foreground cursor-pointer">dismiss</button>
          </span>
        )}
        <div className="ml-auto flex gap-2">
          <input ref={fileInputRef} type="file" accept=".sensorpaneldesign,application/json"
            className="hidden" onChange={handleFileSelected} />
          <button type="button" onClick={handleOpenClick}
            className="px-3 py-1.5 text-[11px] border border-border rounded hover:bg-secondary transition-colors cursor-pointer text-foreground"
            title="Open a .sensorpaneldesign project file"
          >Open project…</button>
          <button type="button" onClick={handleSave}
            className="px-3 py-1.5 text-[11px] bg-primary text-primary-foreground rounded hover:opacity-90 transition-opacity cursor-pointer font-medium"
            title="Save this design as a .sensorpaneldesign project file"
          >Save project</button>
        </div>
      </div>

      <div className="grid gap-4 flex-1 min-h-0" style={{ gridTemplateColumns: '280px 1fr 300px' }}>
        <div className="bg-card border border-border rounded-lg p-4 overflow-y-auto min-h-0" style={{ scrollbarWidth: 'thin' }}>
          <BackgroundPanel
            width={panel.width}
            height={panel.height}
            background={panel.background}
            onSizeChange={updatePanelSize}
            onChange={updateBackground}
          />
        </div>

        <div className="flex flex-col gap-3 min-h-0">
          <div className="bg-card border border-border rounded-lg p-5 flex-1 min-h-0 flex">
            <CanvasWorkspace
              panel={panel}
              gauges={gauges}
              themes={themes}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onMoveGauge={moveGauge}
              onResizeGauge={resizeGauge}
            />
          </div>
          <LayersPanel
            gauges={gauges}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onAdd={addGauge}
            onDelete={deleteGauge}
            onReorder={reorderGauge}
          />
        </div>

        <div className="bg-card border border-border rounded-lg p-4 overflow-y-auto min-h-0" style={{ scrollbarWidth: 'thin' }}>
          {selectedGauge ? (
            <GaugePanel
              gauge={selectedGauge}
              panel={panel}
              themes={themes}
              onChange={patch => updateGaugeOpts(selectedGauge.id, patch)}
              onMeta={patch => updateGaugeMeta(selectedGauge.id, patch)}
              onOpenThemeDesigner={() => setShowDesigner(true)}
              onDelete={() => deleteGauge(selectedGauge.id)}
              onDuplicate={() => duplicateGauge(selectedGauge.id)}
            />
          ) : (
            <div className="text-[11px] text-muted-foreground">
              Select a gauge on the panel or in the layers list to edit its settings, or add a new one below the canvas.
            </div>
          )}
        </div>
      </div>

      <ExportBar
        key={selectedGauge?.id ?? 'none'}
        panel={panel}
        gauges={gauges}
        themes={themes}
        selectedGauge={selectedGauge}
      />

      {showDesigner && (
        <ThemeDesigner
          themes={themes}
          activeKey={selectedGauge?.themeKey ?? Object.keys(themes)[0]}
          onClose={() => setShowDesigner(false)}
          onThemesChange={setThemes}
          onActiveKeyChange={key => {
            if (selectedGauge) updateGaugeMeta(selectedGauge.id, { themeKey: key });
          }}
        />
      )}
    </div>
  );
}
