// Writes a real InfoPanel profile bundle (.infopanel): a zip containing
// Profile.xml (a .NET XmlSerializer-serialized InfoPanel.Models.Profile),
// DisplayItems.xml (a .NET XmlSerializer-serialized List<DisplayItem>, using
// the standard xsi:type polymorphism .NET emits for a base-typed collection)
// and an assets/ folder of PNGs — reverse-engineered from InfoPanel's own
// source (github.com/habibrehmansg/infopanel), not guessed:
//   - Views/Pages/ProfilesPage.xaml.cs: the file-open filter is literally
//     "*.infopanel", and files ending in it go through
//     SharedModel.Instance.ImportProfile — confirming the extension.
//   - Models/SharedModel.cs (ExportProfile/ImportProfile): the zip holds
//     exactly Profile.xml + DisplayItems.xml + assets/*; imported assets are
//     extracted flat into assets/{newProfileGuid}/{fileName} and referenced
//     back via ImageDisplayItem.FilePath + RelativePath=true.
//   - Models/Profile.cs, DisplayItem.cs, GaugeDisplayItem.cs,
//     ImageDisplayItem.cs: the property names/types used below.
//   - Drawing/PanelDraw.cs: confirms a GaugeDisplayItem draws at its own
//     X/Y/Width/Height/Scale — the per-state ImageDisplayItem entries in its
//     Images collection only contribute pixel content, so their own
//     X/Y/Width/Height don't matter and are left at compiled defaults.
//
// Unlike AIDA64's bespoke, undocumented text format, XmlSerializer's output
// shape (root "ArrayOf<Type>", xsi:type only where the runtime type differs
// from the declared type, omitted elements falling back to each class's
// compiled default) is standard, documented .NET behaviour.
//
// One thing NOT standard/documented: asset paths inside the zip must use a
// literal BACKSLASH ("assets\name.png"), not "/". This was found by diffing
// a real, working .infopanel export against ours and cross-checking the
// exact source tag (v1.3.1, github.com/habibrehmansg/infopanel) the reporter
// had installed: ImportProfile there does
// `entry.FullName.StartsWith("assets\\")` with no forward-slash fallback (a
// later branch added `|| StartsWith("assets/")`, but v1.3.1 doesn't have
// it), and InfoPanel's own ExportProfile produces backslash paths because it
// builds entry names with Path.Combine("assets", name) on Windows. A
// forward-slash zip parses fine and even round-trips DisplayItems.xml
// correctly, but the asset-collecting loop silently matches nothing, so the
// per-profile assets/{guid}/ folder never gets created and every image
// (background included) fails to load with "Image path is invalid or file
// does not exist" — confirmed against the reporter's own InfoPanel log.
//
// InfoPanel has no fixed, cross-machine sensor mnemonic like AIDA64's
// SCPUUTI — its HWiNFO/LibreHardwareMonitor sensor IDs are hashes/paths
// specific to the machine running InfoPanel, so this app can't pick one
// blindly. Every exported gauge is left unbound (SensorType defaults to
// HwInfo with Id/Instance/EntryId all 0); GaugeDisplayItem.EvaluateImageFrame
// falls back to showing its first frame when GetValue() returns null, so an
// unbound gauge still renders (just statically) instead of vanishing — point
// it at a real sensor from InfoPanel's own item editor after importing.
import { renderBackground } from './backgroundRender';
import { drawOn } from './gaugeRender';
import type { ThemesMap } from './gaugeRender';
import type { GaugeInstance, PanelConfig } from '../types';
import { resolveDrawOptions } from '../types';
import { loadImage } from './imageCache';

function slugify(name: string, fallback: string): string {
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s || fallback;
}

// XML element text only requires escaping &, < and > — unlike AIDA64's
// tag format, this one really is XML, so entities are honored on import.
function xmlEscapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Canvas PNG encoding failed.'))), 'image/png');
  });
}

function renderGauge(gauge: GaugeInstance, themes: ThemesMap, onCount: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(gauge.width));
  canvas.height = Math.max(1, Math.round(gauge.height));
  drawOn(canvas, onCount, resolveDrawOptions(gauge, themes));
  return canvas;
}

// Always 21 frames at 5%-of-sensor-value steps (0,5,...,100), independent of
// the gauge's own segment count, so InfoPanel's image-index selection
// updates every 5% of live sensor value rather than only at whatever
// coarser step the gauge's visual segment count would otherwise imply.
// Same stepping as this app's own "Generate frame set" button (ExportBar.tsx)
// so a gauge exported to InfoPanel animates through identical frames to what
// you'd get downloading them individually.
function frameOnCounts(gauge: GaugeInstance): number[] {
  const opts = gauge.opts;
  const counts: number[] = [];
  for (let pct = 0; pct <= 100; pct += 5) {
    counts.push(opts.nSegs === 0 ? pct : Math.round((pct / 100) * opts.nSegs));
  }
  return counts;
}

interface BundleFile {
  name: string;
  blob: Blob;
}

export type InfoPanelExportProgress = (message: string) => void;

// Profile.BackgroundColor is "#AARRGGBB" (.NET default "#FFFFFFFF").
function toProfileArgb(hexColor: string, transparent: boolean): string {
  const h = hexColor.replace('#', '').padEnd(6, '0').slice(0, 6).toUpperCase();
  return `#${transparent ? '00' : 'FF'}${h}`;
}

async function buildBundleParts(panel: PanelConfig, gauges: GaugeInstance[], themes: ThemesMap, onProgress?: InfoPanelExportProgress) {
  const files: BundleFile[] = [];
  const items: string[] = [];
  const usedNames = new Set<string>();

  function uniqueName(base: string): string {
    let name = base;
    let n = 2;
    while (usedNames.has(name)) name = `${base.replace(/\.png$/, '')}-${n++}.png`;
    usedNames.add(name);
    return name;
  }

  onProgress?.('Rendering panel background…');
  if (panel.background.image) {
    try {
      await loadImage(panel.background.image);
    } catch {
      // Export without the image rather than blocking the whole bundle.
    }
  }
  const bgCanvas = document.createElement('canvas');
  bgCanvas.width = Math.max(1, Math.round(panel.width));
  bgCanvas.height = Math.max(1, Math.round(panel.height));
  renderBackground(bgCanvas.getContext('2d')!, bgCanvas.width, bgCanvas.height, panel.background);
  const bgName = uniqueName('background.png');
  files.push({ name: bgName, blob: await canvasToPngBlob(bgCanvas) });
  items.push(
    `<DisplayItem xsi:type="ImageDisplayItem"><Name>Background</Name><X>0</X><Y>0</Y>` +
    `<Type>FILE</Type><FilePath>${bgName}</FilePath><RelativePath>true</RelativePath>` +
    `<Width>${bgCanvas.width}</Width><Height>${bgCanvas.height}</Height></DisplayItem>`,
  );

  let anon = 1;
  let gaugeIndex = 0;
  for (const gauge of gauges) {
    gaugeIndex++;
    const slug = slugify(gauge.name, `gauge-${anon++}`);
    const safeName = xmlEscapeText(gauge.name);

    if (gauge.opts.mode === 'container') {
      onProgress?.(`Rendering "${gauge.name}" (${gaugeIndex}/${gauges.length})…`);
      const canvas = renderGauge(gauge, themes, 0);
      const name = uniqueName(`${slug}.png`);
      files.push({ name, blob: await canvasToPngBlob(canvas) });
      items.push(
        `<DisplayItem xsi:type="ImageDisplayItem"><Name>${safeName}</Name>` +
        `<X>${Math.round(gauge.x)}</X><Y>${Math.round(gauge.y)}</Y>` +
        `<Type>FILE</Type><FilePath>${name}</FilePath><RelativePath>true</RelativePath>` +
        `<Width>${Math.round(gauge.width)}</Width><Height>${Math.round(gauge.height)}</Height></DisplayItem>`,
      );
      continue;
    }

    const onCounts = frameOnCounts(gauge);
    const imageItems: string[] = [];
    // drawOn may resize the canvas (swapping width/height) for a
    // 90°/270°-rotated bar gauge; all frames of a gauge share the same
    // size, so any one canvas's dimensions after rendering are
    // representative.
    let renderedWidth = Math.round(gauge.width);
    let renderedHeight = Math.round(gauge.height);
    for (let i = 0; i < onCounts.length; i++) {
      onProgress?.(`Rendering "${gauge.name}" (${gaugeIndex}/${gauges.length}) — frame ${i + 1}/${onCounts.length}…`);
      const canvas = renderGauge(gauge, themes, onCounts[i]);
      renderedWidth = canvas.width;
      renderedHeight = canvas.height;
      const name = uniqueName(`${slug}-${String(i).padStart(2, '0')}.png`);
      files.push({ name, blob: await canvasToPngBlob(canvas) });
      imageItems.push(
        `<ImageDisplayItem><Name>${safeName} ${i}</Name><Type>FILE</Type>` +
        `<FilePath>${name}</FilePath><RelativePath>true</RelativePath></ImageDisplayItem>`,
      );
    }

    // Declared Width/Height use the *actual* rendered pixel size (not
    // gauge.width/height) so InfoPanel doesn't stretch an already-rotated
    // PNG back into the wrong, un-rotated box; X/Y are centered on the
    // gauge's original bounding box to match compose.ts's placement.
    const itemX = Math.round(gauge.x + gauge.width / 2 - renderedWidth / 2);
    const itemY = Math.round(gauge.y + gauge.height / 2 - renderedHeight / 2);
    items.push(
      `<DisplayItem xsi:type="GaugeDisplayItem"><Name>${safeName}</Name>` +
      `<X>${itemX}</X><Y>${itemY}</Y>` +
      `<MinValue>0</MinValue><MaxValue>100</MaxValue>` +
      `<Width>${renderedWidth}</Width><Height>${renderedHeight}</Height>` +
      `<Images>${imageItems.join('')}</Images></DisplayItem>`,
    );
  }

  const xsiNs = ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"';
  const displayItemsXml =
    `<?xml version="1.0" encoding="utf-8"?>\r\n` +
    `<ArrayOfDisplayItem${xsiNs}>${items.join('')}</ArrayOfDisplayItem>`;

  const bgColor = panel.background.transparentBackground ? '#ffffff' : panel.background.color;
  const profileXml =
    `<?xml version="1.0" encoding="utf-8"?>\r\n` +
    `<Profile${xsiNs}>` +
    `<Name>Sensor Panel Designer Export</Name>` +
    `<Width>${bgCanvas.width}</Width><Height>${bgCanvas.height}</Height>` +
    `<BackgroundColor>${toProfileArgb(bgColor, panel.background.transparentBackground)}</BackgroundColor>` +
    `</Profile>`;

  return { profileXml, displayItemsXml, files };
}

export async function downloadInfoPanelBundle(
  panel: PanelConfig, gauges: GaugeInstance[], themes: ThemesMap, filename: string, onProgress?: InfoPanelExportProgress,
): Promise<void> {
  const { profileXml, displayItemsXml, files } = await buildBundleParts(panel, gauges, themes, onProgress);

  onProgress?.(`Packaging .infopanel (${files.length + 2} files)…`);
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  zip.file('Profile.xml', profileXml);
  zip.file('DisplayItems.xml', displayItemsXml);
  // Backslash, not forward slash — see the file-level comment above; this is
  // the one thing InfoPanel's own ImportProfile (at least as of v1.3.1)
  // requires that isn't standard zip convention. createFolders:false also
  // still matters: JSZip auto-creates a real "assets\" directory entry
  // otherwise, and InfoPanel's ImportProfile would try to ExtractToFile that
  // placeholder as if it were a real asset, throwing and aborting the loop
  // before any real asset gets written to disk.
  for (const f of files) zip.file(`assets\\${f.name}`, f.blob, { createFolders: false });

  // Same reasoning as the AIDA64 exporter: PNGs are already compressed, so
  // DEFLATE-recompressing them in pure JS wastes time for no size benefit.
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });

  onProgress?.('Starting download…');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
