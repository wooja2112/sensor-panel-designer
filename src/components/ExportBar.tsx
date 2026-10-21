import { useState } from 'react';
import type { GaugeInstance, PanelConfig } from '../types';
import { resolveDrawOptions } from '../types';
import type { ThemesMap } from '../lib/gaugeRender';
import { frameSetOnCounts, isStaticGaugeMode, makeStamp, previewValueToOnCount } from '../lib/gaugeRender';
import { designImageSrcs, downloadCanvasPng, renderGaugeCanvas, renderPanel, timestamp } from '../lib/compose';
import { downloadAida64Bundle } from '../lib/aida64';
import { downloadInfoPanelBundle } from '../lib/infopanel';
import { preloadImages } from '../lib/imageCache';
import { JSZip } from '../lib/zip';

interface FrameData {
  dataUrl: string;
  label: string;
}

export function ExportBar({
  panel, gauges, themes, selectedGauge,
}: {
  panel: PanelConfig;
  gauges: GaugeInstance[];
  themes: ThemesMap;
  selectedGauge: GaugeInstance | null;
}) {
  const [baseName, setBaseName] = useState(selectedGauge?.name.toLowerCase().replace(/\s+/g, '-') ?? 'gauge');
  const [frames, setFrames] = useState<FrameData[]>([]);
  const [status, setStatus] = useState('');
  const [zipping, setZipping] = useState(false);
  const [exportingAida, setExportingAida] = useState(false);
  const [exportingInfoPanel, setExportingInfoPanel] = useState(false);

  const exportPanel = async () => {
    await preloadImages(designImageSrcs(panel, gauges));
    const canvas = document.createElement('canvas');
    renderPanel(canvas, panel, gauges, themes);
    downloadCanvasPng(canvas, `panel-${panel.width}x${panel.height}-${timestamp()}.png`);
  };

  const exportAida64 = async () => {
    setExportingAida(true);
    setStatus('Starting AIDA64 export…');
    try {
      const { defaultedGaugeNames } = await downloadAida64Bundle(
        panel, gauges, themes, `panel-${timestamp()}.spzip`, message => setStatus(message),
      );
      setStatus(
        defaultedGaugeNames.length > 0
          ? `Done — downloaded .spzip. Import it in AIDA64's SensorPanel manager. Defaulted to "CPU Utilization" for: ${defaultedGaugeNames.join(', ')} — rebind any that should track something else.`
          : `Done — downloaded .spzip. Import it in AIDA64's SensorPanel manager.`,
      );
    } catch (e: unknown) {
      setStatus('Error: ' + (e instanceof Error ? e.message : String(e)));
    }
    setExportingAida(false);
  };

  const exportInfoPanel = async () => {
    setExportingInfoPanel(true);
    setStatus('Starting InfoPanel export…');
    try {
      await downloadInfoPanelBundle(
        panel, gauges, themes, `panel-${timestamp()}.infopanel`, message => setStatus(message),
      );
      setStatus(
        'Done — downloaded .infopanel. Import it via InfoPanel\'s Profiles page. Gauges have no sensor bound yet ' +
        '(InfoPanel\'s sensor IDs are machine-specific) — they\'ll show their first frame until you bind one in InfoPanel\'s item editor.',
      );
    } catch (e: unknown) {
      setStatus('Error: ' + (e instanceof Error ? e.message : String(e)));
    }
    setExportingInfoPanel(false);
  };

  const downloadGaugePng = () => {
    if (!selectedGauge) return;
    const opts = resolveDrawOptions(selectedGauge, themes);
    const onCount = previewValueToOnCount(selectedGauge.previewValue, opts.nSegs);
    void preloadImages(designImageSrcs(panel, [selectedGauge])).then(() => {
      // drawOn may resize the canvas (swapping width/height) for a
      // 90°/270°-rotated bar gauge, so the filename reflects its actual size.
      const canvas = renderGaugeCanvas(selectedGauge, themes, onCount);
      downloadCanvasPng(canvas, `${baseName}-${canvas.width}x${canvas.height}-${timestamp()}.png`);
    });
  };

  const generateFrames = () => {
    if (!selectedGauge) return;
    const opts = resolveDrawOptions(selectedGauge, themes);
    // Containers, labels, and images have no value, so they're a single
    // static image; sensor gauges get the same frames InfoPanel export uses.
    const onCounts = isStaticGaugeMode(opts.mode) ? [0] : frameSetOnCounts(opts.nSegs);
    const next: FrameData[] = [];
    // drawOn may resize the canvas (swapping width/height) for a
    // 90°/270°-rotated bar gauge; capture the actual size from the first
    // frame (all frames of a gauge share the same size) for the filename
    // stamp and status text.
    let stamp = '';
    let renderedWidth = selectedGauge.width;
    let renderedHeight = selectedGauge.height;
    for (let f = 0; f < onCounts.length; f++) {
      const canvas = renderGaugeCanvas(selectedGauge, themes, onCounts[f]);
      if (f === 0) {
        renderedWidth = canvas.width;
        renderedHeight = canvas.height;
        stamp = `${baseName}-${renderedWidth}x${renderedHeight}-${makeStamp()}`;
      }
      next.push({ dataUrl: canvas.toDataURL('image/png'), label: `${stamp}-${f}` });
    }
    setFrames(next);
    setStatus(`${onCounts.length} frame${onCounts.length === 1 ? '' : 's'} generated at ${renderedWidth}×${renderedHeight}px.`);
  };

  const downloadZip = async () => {
    if (frames.length === 0) return;
    setZipping(true);
    setStatus('Building zip…');
    try {
      const zip = new JSZip();
      for (const f of frames) zip.file(`${f.label}.png`, f.dataUrl.split(',')[1], { base64: true });
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${baseName}_frames.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setStatus(`Downloaded ${frames.length} PNGs as ${baseName}_frames.zip`);
    } catch (e: unknown) {
      setStatus('Error: ' + (e instanceof Error ? e.message : String(e)));
    }
    setZipping(false);
  };

  return (
    <div className="bg-card border border-border rounded-lg px-5 py-3 flex items-center justify-between gap-4 flex-wrap">
      <div className="flex flex-col gap-0.5">
        <div className="text-sm font-medium text-foreground">
          {selectedGauge ? `Export "${selectedGauge.name}"` : 'No gauge selected'}
        </div>
        <div className="text-[10px] text-muted-foreground">
          {selectedGauge
            ? <>base filename: <input value={baseName} onChange={e => setBaseName(e.target.value)}
                className="bg-background border border-border rounded px-1.5 py-0.5 text-[10px] text-foreground w-32 focus:outline-none focus:border-primary/60" /></>
            : 'Select a gauge to export its PNG or frame set.'}
          {status && <span className="ml-3 italic">{status}</span>}
        </div>
      </div>
      <div className="flex gap-2 flex-wrap items-center">
        {selectedGauge && (
          <>
            <button type="button" onClick={downloadGaugePng}
              className="px-3 py-1.5 text-[11px] border border-border rounded hover:bg-secondary transition-colors cursor-pointer text-foreground"
            >Download gauge PNG</button>
            <button type="button" onClick={generateFrames}
              className="px-3 py-1.5 text-[11px] border border-border rounded hover:bg-secondary transition-colors cursor-pointer text-foreground"
            >Generate frame set</button>
            <button type="button" onClick={downloadZip} disabled={frames.length === 0 || zipping}
              className="px-3 py-1.5 text-[11px] border border-border rounded hover:bg-secondary transition-colors disabled:opacity-40 cursor-pointer text-foreground"
            >{zipping ? 'Building zip…' : `Download ${frames.length || ''} as zip`}</button>
          </>
        )}
        <button type="button" onClick={exportAida64} disabled={exportingAida}
          className="px-3 py-1.5 text-[11px] border border-border rounded hover:bg-secondary transition-colors disabled:opacity-40 cursor-pointer text-foreground"
          title="Builds a real AIDA64 .spzip bundle: the background plus a 16-state Custom gauge per gauge, ready to Import in AIDA64's SensorPanel manager. Gauges without an AIDA64 sensor ID default to CPU Utilization (SCPUUTI) so they stay visible."
        >{exportingAida ? 'Building…' : 'Export to AIDA64'}</button>
        <button type="button" onClick={exportInfoPanel} disabled={exportingInfoPanel}
          className="px-3 py-1.5 text-[11px] border border-border rounded hover:bg-secondary transition-colors disabled:opacity-40 cursor-pointer text-foreground"
          title="Builds a real InfoPanel .infopanel bundle: the background plus one multi-frame Gauge item per gauge, ready to Import from InfoPanel's Profiles page. Gauges are unbound until you pick a sensor for them in InfoPanel."
        >{exportingInfoPanel ? 'Building…' : 'Export to InfoPanel'}</button>
        <button type="button" onClick={exportPanel}
          className="px-3 py-1.5 text-[11px] bg-primary text-primary-foreground rounded hover:opacity-90 transition-opacity cursor-pointer font-medium"
        >Export panel PNG</button>
      </div>
    </div>
  );
}
