import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GaugeInstance, PanelConfig } from './types';
import { createGaugeInstance, defaultPanelConfig } from './types';
import type { BackgroundOptions } from './lib/backgroundRender';
import type { DrawOptions, GaugeMode, ThemesMap } from './lib/gaugeRender';
import { DEFAULT_THEMES, computeGaugeOuterRadius, solveRingBoxForOuterRadius } from './lib/gaugeRender';
import { clearAutosave, downloadPanelFile, loadAutosave, parsePanelFile, saveAutosave } from './lib/file';
import { fitGaugeToContent } from './lib/gaugeFit';
import { timestamp } from './lib/compose';
import { BackgroundPanel } from './components/BackgroundPanel';
import { GaugePanel } from './components/GaugePanel';
import { MultiSelectPanel } from './components/MultiSelectPanel';
import { CanvasWorkspace } from './components/CanvasWorkspace';
import { LayersPanel } from './components/LayersPanel';
import { ExportBar } from './components/ExportBar';
import { ThemeDesigner } from './components/ThemeDesigner';

// circ and needle are both drawn as a ring of some radius, so "make same
// size" can equalize how big they actually look (see computeGaugeOuterRadius
// below); bar and container are fundamentally different shapes with no
// comparable notion of radius, so they just fall back to a literal
// width/height match.
const RING_MODES: GaugeMode[] = ['circ', 'needle'];

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
  // Ordered so the first entry is the anchor gauge for multi-select actions
  // (e.g. "make same size" sizes everything to match selectedIds[0]).
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showDesigner, setShowDesigner] = useState(false);
  const [restoredBannerDismissed, setRestoredBannerDismissed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedId = selectedIds[0] ?? null;
  const selectedGauge = useMemo(() => gauges.find(g => g.id === selectedId) ?? null, [gauges, selectedId]);

  // Single click replaces the selection; shift/ctrl/cmd-click toggles a
  // gauge into or out of the existing selection, preserving click order.
  const selectGauge = useCallback((id: string | null, additive = false) => {
    setSelectedIds(prev => {
      if (!id) return [];
      if (!additive) return [id];
      return prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
    });
  }, []);

  const makeSameSize = useCallback(() => {
    setGauges(gs => {
      const ref = gs.find(g => g.id === selectedIds[0]);
      if (!ref || selectedIds.length < 2) return gs;
      // A shared bounding box isn't the same as looking the same size: a
      // needle and a circular gauge both draw a ring inside their box, but
      // how much of the box that ring actually fills depends on each
      // gauge's own stroke width/label/outer-ring settings too (see
      // computeGaugeOuterRadius) — so between two ring gauges, solve for a
      // box whose ring edge matches the anchor's rather than just copying
      // width/height. Any other mode pairing (bar, container, or a ring
      // mode paired with one of those) has no comparable notion of "same
      // visual size", so it falls back to a literal box match.
      const refIsRing = RING_MODES.includes(ref.opts.mode);
      const refRadius = refIsRing ? computeGaugeOuterRadius(ref.width, ref.height, ref.opts) : 0;
      return gs.map(g => {
        if (g.id === ref.id || !selectedIds.includes(g.id)) return g;
        if (refIsRing && RING_MODES.includes(g.opts.mode)) {
          const { width, height } = solveRingBoxForOuterRadius(refRadius, g.width, g.height, g.opts);
          return { ...g, width, height };
        }
        return { ...g, width: ref.width, height: ref.height };
      });
    });
  }, [selectedIds]);

  // Distributes the gauges selected *between* the 1st and last-selected one
  // (both of which stay put) at even steps along the straight line joining
  // their centers — selection order decides each gauge's step, not its
  // current on-panel position, matching how "make same size" also treats
  // selectedIds[0] as a fixed anchor rather than re-deriving order spatially.
  const spaceEvenly = useCallback(() => {
    setGauges(gs => {
      const n = selectedIds.length;
      if (n < 3) return gs;
      const first = gs.find(g => g.id === selectedIds[0]);
      const last = gs.find(g => g.id === selectedIds[n - 1]);
      if (!first || !last) return gs;
      const firstCenterX = first.x + first.width / 2;
      const firstCenterY = first.y + first.height / 2;
      const lastCenterX = last.x + last.width / 2;
      const lastCenterY = last.y + last.height / 2;
      return gs.map(g => {
        const step = selectedIds.indexOf(g.id);
        if (step <= 0 || step >= n - 1) return g; // first/last anchors + non-selected untouched
        const t = step / (n - 1);
        const cx = firstCenterX + t * (lastCenterX - firstCenterX);
        const cy = firstCenterY + t * (lastCenterY - firstCenterY);
        return { ...g, x: Math.round(cx - g.width / 2), y: Math.round(cy - g.height / 2) };
      });
    });
  }, [selectedIds]);

  // Centers the whole selection as a group — the group's bounding box
  // (spanning every selected gauge) lands on the panel's center, but each
  // gauge keeps its position *relative to the others*, so a multi-select
  // moves together rather than collapsing onto a single point. With exactly
  // one gauge selected this reduces to centering that gauge alone, same as
  // GaugePanel's own Center H/V (which stays in place for the single-select
  // case rather than routing through here).
  const centerSelection = useCallback((axis: 'x' | 'y') => {
    setGauges(gs => {
      const selected = gs.filter(g => selectedIds.includes(g.id));
      if (selected.length === 0) return gs;
      if (axis === 'x') {
        const minX = Math.min(...selected.map(g => g.x));
        const maxX = Math.max(...selected.map(g => g.x + g.width));
        const dx = Math.round((panel.width - (minX + maxX)) / 2);
        return gs.map(g => selectedIds.includes(g.id) ? { ...g, x: g.x + dx } : g);
      }
      const minY = Math.min(...selected.map(g => g.y));
      const maxY = Math.max(...selected.map(g => g.y + g.height));
      const dy = Math.round((panel.height - (minY + maxY)) / 2);
      return gs.map(g => selectedIds.includes(g.id) ? { ...g, y: g.y + dy } : g);
    });
  }, [selectedIds, panel.width, panel.height]);

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
    setSelectedIds([]);
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
        setSelectedIds([]);
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
    setSelectedIds([gauge.id]);
  }, [panel.width, panel.height, themes]);

  const updateGaugeOpts = useCallback((id: string, patch: Partial<DrawOptions>) => {
    setGauges(gs => gs.map(g => g.id === id ? { ...g, opts: { ...g.opts, ...patch } } : g));
  }, []);

  const updateGaugeMeta = useCallback((id: string, patch: Partial<Pick<GaugeInstance, 'name' | 'x' | 'y' | 'width' | 'height' | 'previewValue' | 'themeKey' | 'aidaSensorId' | 'hwinfoSensorLabel'>>) => {
    setGauges(gs => gs.map(g => g.id === id ? { ...g, ...patch } : g));
  }, []);

  const fitToContent = useCallback((id: string) => {
    setGauges(gs => {
      const g = gs.find(x => x.id === id);
      if (!g) return gs;
      const fit = fitGaugeToContent(g, themes);
      return fit ? gs.map(x => x.id === id ? { ...x, ...fit } : x) : gs;
    });
  }, [themes]);

  const fitAllSelectedToContent = useCallback(() => {
    setGauges(gs => gs.map(g => {
      if (!selectedIds.includes(g.id)) return g;
      const fit = fitGaugeToContent(g, themes);
      return fit ? { ...g, ...fit } : g;
    }));
  }, [selectedIds, themes]);

  const moveGauge = useCallback((id: string, x: number, y: number) => {
    setGauges(gs => gs.map(g => g.id === id ? { ...g, x, y } : g));
  }, []);

  const resizeGauge = useCallback((id: string, width: number, height: number) => {
    setGauges(gs => gs.map(g => g.id === id ? { ...g, width, height } : g));
  }, []);

  const deleteGauge = useCallback((id: string) => {
    setGauges(gs => gs.filter(g => g.id !== id));
    setSelectedIds(sel => sel.filter(x => x !== id));
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
      setSelectedIds([clone.id]);
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
              selectedIds={selectedIds}
              onSelect={selectGauge}
              onMoveGauge={moveGauge}
              onResizeGauge={resizeGauge}
            />
          </div>
          <LayersPanel
            gauges={gauges}
            selectedIds={selectedIds}
            onSelect={selectGauge}
            onAdd={addGauge}
            onDelete={deleteGauge}
            onReorder={reorderGauge}
          />
        </div>

        <div className="bg-card border border-border rounded-lg p-4 overflow-y-auto min-h-0" style={{ scrollbarWidth: 'thin' }}>
          {selectedIds.length > 1 ? (
            <MultiSelectPanel
              count={selectedIds.length}
              onMakeSameSize={makeSameSize}
              onFitAllToContent={fitAllSelectedToContent}
              onSpaceEvenly={spaceEvenly}
              onCenterH={() => centerSelection('x')}
              onCenterV={() => centerSelection('y')}
              onDeselect={() => setSelectedIds([])}
            />
          ) : selectedGauge ? (
            <GaugePanel
              gauge={selectedGauge}
              panel={panel}
              themes={themes}
              onChange={patch => updateGaugeOpts(selectedGauge.id, patch)}
              onMeta={patch => updateGaugeMeta(selectedGauge.id, patch)}
              onOpenThemeDesigner={() => setShowDesigner(true)}
              onDelete={() => deleteGauge(selectedGauge.id)}
              onDuplicate={() => duplicateGauge(selectedGauge.id)}
              onFitToContent={() => fitToContent(selectedGauge.id)}
            />
          ) : (
            <div className="text-[11px] text-muted-foreground">
              Select a gauge on the panel or in the layers list to edit its settings, or add a new one below the canvas.
              Shift/ctrl-click to select multiple.
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
