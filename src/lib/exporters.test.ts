import { describe, expect, it } from 'vitest';
import { JSZip } from './zip';
import { DESIGN_SIDECAR_NAME } from './file';
import { aidaStateOnCounts, buildAidaPanelText, buildAidaZip, isDefaultedAidaSensorId, type AidaPanelSpec } from './aida64';
import { frameOnCount, frameSetOnCounts, previewValueToOnCount } from './gaugeRender';
import { buildInfoPanelXml, buildInfoPanelZip, type InfoPanelProfileSpec } from './infopanel';
import { decodeAidaDefBytes, parseAidaPanelText, parseInfoPanelXml } from './importBundle';

// The segment counts GaugePanel offers; 0 is a solid (percentage) gauge.
const UI_SEGMENT_COUNTS = [0, 5, 8, 10, 12, 20, 50];

describe('frame stepping', () => {
  it('runs AIDA64 states from empty to full in 16 non-decreasing steps', () => {
    for (const nSegs of UI_SEGMENT_COUNTS) {
      const counts = aidaStateOnCounts(nSegs);
      const full = nSegs === 0 ? 100 : nSegs;
      expect(counts).toHaveLength(16);
      expect(counts[0]).toBe(0);
      expect(counts[15]).toBe(full);
      expect(counts.every((c, i) => i === 0 || c >= counts[i - 1])).toBe(true);
    }
    expect(aidaStateOnCounts(0)).toEqual([0, 7, 13, 20, 27, 33, 40, 47, 53, 60, 67, 73, 80, 87, 93, 100]);
  });

  it('steps the 21-frame set every 5% of value', () => {
    expect(frameSetOnCounts(0)).toEqual(Array.from({ length: 21 }, (_, i) => i * 5));
    expect(frameSetOnCounts(20)).toEqual(Array.from({ length: 21 }, (_, i) => i));
    expect(frameSetOnCounts(10).slice(0, 4)).toEqual([0, 1, 1, 2]);
  });

  it('rounds exact halves up instead of losing them to floating point', () => {
    // 14 of 20 steps on 45 segments is exactly 31.5.
    expect(frameOnCount(14, 21, 45)).toBe(32);
    expect(frameOnCount(0, 1, 10)).toBe(0);
  });

  it('matches the single-PNG export at the same value for every UI segment count', () => {
    for (const nSegs of UI_SEGMENT_COUNTS) {
      const frames = frameSetOnCounts(nSegs);
      frames.forEach((onCount, i) => expect(previewValueToOnCount(i * 5, nSegs)).toBe(onCount));
    }
  });
});

const stateFiles = Array.from({ length: 16 }, (_, i) => `cpu-${String(i).padStart(2, '0')}.png`);

const aidaSpec: AidaPanelSpec = {
  width: 640,
  height: 400,
  bgColor: '#ff8000',
  backgroundFile: 'background.png',
  items: [
    { kind: 'image', file: 'frame.png', x: 10, y: 20, width: 300, height: 200 },
    {
      kind: 'gauge', sensorId: ' tcpu ', label: '<CPU>', x: 40, y: 50, width: 120, height: 120,
      min: 0, max: 90, stateFiles,
    },
    {
      kind: 'gauge', sensorId: '', label: 'Fan', x: 200, y: 50, width: 60, height: 60,
      min: 0, max: 100, stateFiles,
    },
  ],
};

describe('AIDA64 panel text', () => {
  it('writes the header, COLORREF background, and CRLF-separated items', () => {
    const text = buildAidaPanelText(aidaSpec);
    const lines = text.split('\r\n');
    expect(text.endsWith('\r\n')).toBe(true);
    expect(lines[0]).toBe('<SPVER>200</SPVER><SWVER>Sensor Panel Designer</SWVER>');
    // #ff8000 is R=255 G=128 B=0; COLORREF puts red in the low byte.
    expect(lines[1]).toBe('<SPWIDTH>640</SPWIDTH><SPHEIGHT>400</SPHEIGHT><SPBGCOLOR>33023</SPBGCOLOR>');
    expect(lines[2]).toBe('<ID>IMG</ID><BGIMG>1</BGIMG><ITMX>0</ITMX><ITMY>0</ITMY><IMGFIL>background.png</IMGFIL>');
    expect(lines[3]).toContain('<BGIMG>0</BGIMG><RESIZW>300</RESIZW><RESIZH>200</RESIZH>');
  });

  it('sanitizes sensor ids and labels and defaults unbound gauges to SCPUUTI', () => {
    const parsed = parseAidaPanelText(buildAidaPanelText(aidaSpec));
    expect(parsed.width).toBe(640);
    expect(parsed.height).toBe(400);
    expect(parsed.bgColor).toBe('#ff8000');
    expect(parsed.items.map(i => i.id)).toEqual(['IMG', 'IMG', '[GAUGE]TCPU', '[GAUGE]SCPUUTI']);
    const cpu = parsed.items[2].tags;
    expect(cpu.LBL).toBe('CPU');
    expect(cpu.MINVAL).toBe('0');
    expect(cpu.MAXVAL).toBe('90');
    expect(cpu.STAFLS.split('|')).toEqual(stateFiles);
    expect(isDefaultedAidaSensorId('')).toBe(true);
    expect(isDefaultedAidaSensorId(' -- ')).toBe(true);
    expect(isDefaultedAidaSensorId('tcpu')).toBe(false);
  });

  it('stores panel.sp2 as UTF-16LE with a BOM next to the sidecar and images', async () => {
    const text = buildAidaPanelText(aidaSpec);
    const zip = buildAidaZip(text, '{"version":1}', [{ name: 'background.png', data: new Uint8Array([1, 2, 3]) }]);
    const loaded = await JSZip.loadAsync(await zip.generateAsync({ type: 'uint8array' }));
    expect(Object.keys(loaded.files).sort()).toEqual([DESIGN_SIDECAR_NAME, 'background.png', 'panel.sp2'].sort());
    const bytes = await loaded.file('panel.sp2')!.async('uint8array');
    expect([bytes[0], bytes[1]]).toEqual([0xff, 0xfe]);
    expect(bytes[3]).toBe(0); // high byte of '<' — UTF-16LE, not UTF-8
    expect(decodeAidaDefBytes(bytes)).toBe(text);
  });
});

const infoSpec: InfoPanelProfileSpec = {
  width: 480,
  height: 320,
  bgColor: '#112233',
  transparent: false,
  backgroundFile: 'background.png',
  items: [
    { kind: 'image', name: 'Logo & <frame>', file: 'logo.png', x: 5, y: 6, width: 100, height: 40 },
    {
      kind: 'gauge', name: 'CPU & GPU', sensorLabel: '  CPU Package  ', x: 10, y: 20, width: 80, height: 80,
      min: 0, max: 100, frameFiles: ['cpu-00.png', 'cpu-01.png'],
    },
  ],
};

describe('InfoPanel XML', () => {
  it('writes the profile size and #AARRGGBB background', () => {
    const { profileXml } = buildInfoPanelXml(infoSpec);
    expect(profileXml).toContain('<Width>480</Width><Height>320</Height>');
    expect(profileXml).toContain('<BackgroundColor>#FF112233</BackgroundColor>');
    expect(buildInfoPanelXml({ ...infoSpec, transparent: true }).profileXml)
      .toContain('<BackgroundColor>#00112233</BackgroundColor>');
  });

  it('escapes names and round-trips through the importer', () => {
    const { profileXml, displayItemsXml } = buildInfoPanelXml(infoSpec);
    expect(displayItemsXml).toContain('<Name>Logo &amp; &lt;frame&gt;</Name>');
    expect(displayItemsXml).toContain('<Name>CPU &amp; GPU (HWInfo: CPU Package)</Name>');
    const parsed = parseInfoPanelXml(profileXml, displayItemsXml);
    expect(parsed.width).toBe(480);
    expect(parsed.color).toBe('#112233');
    expect(parsed.items.map(i => i.type)).toEqual(['image', 'image', 'gauge']);
    expect(parsed.items[0].filePaths).toEqual(['background.png']);
    expect(parsed.items[1].name).toBe('Logo & <frame>');
    const gauge = parsed.items[2];
    expect(gauge.name).toBe('CPU & GPU');
    expect(gauge.hwinfoSensorLabel).toBe('CPU Package');
    expect(gauge.filePaths).toEqual(['cpu-00.png', 'cpu-01.png']);
    expect([gauge.x, gauge.y, gauge.width, gauge.height]).toEqual([10, 20, 80, 80]);
  });

  it('puts assets under backslash paths with no directory entries', () => {
    const zip = buildInfoPanelZip(buildInfoPanelXml(infoSpec), '{"version":1}', [
      { name: 'background.png', data: new Uint8Array([1]) },
      { name: 'cpu-00.png', data: new Uint8Array([2]) },
    ]);
    expect(Object.keys(zip.files).sort()).toEqual([
      'DisplayItems.xml', 'Profile.xml', 'assets\\background.png', 'assets\\cpu-00.png', DESIGN_SIDECAR_NAME,
    ].sort());
    expect(Object.values(zip.files).some(f => f.dir)).toBe(false);
  });
});
