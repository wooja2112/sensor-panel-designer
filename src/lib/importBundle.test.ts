import { describe, expect, it } from 'vitest';
import { JSZip } from './zip';
import { DESIGN_SIDECAR_NAME, serializePanelFile } from './file';
import { defaultPanelConfig, normalizeGauge } from '../types';
import { DEFAULT_THEMES } from './gaugeRender';
import {
  colorRefToHex,
  decodeAidaDefBytes,
  formatDotNetDate,
  importDesignFile,
  parseAidaPanelText,
  parseInfoPanelName,
  parseInfoPanelXml,
  parseProfileArgb,
  sampleSensorDisplayText,
} from './importBundle';

function toUtf16LE(text: string): Uint8Array {
  const buf = new Uint8Array(2 + text.length * 2);
  buf[0] = 0xff;
  buf[1] = 0xfe;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    buf[2 + i * 2] = code & 0xff;
    buf[2 + i * 2 + 1] = (code >> 8) & 0xff;
  }
  return buf;
}

describe('AIDA tag parse', () => {
  it('reads panel size, COLORREF background, IMG and Custom gauges', () => {
    const text =
      `<SPVER>200</SPVER><SPWIDTH>640</SPWIDTH><SPHEIGHT>400</SPHEIGHT><SPBGCOLOR>255</SPBGCOLOR>\r\n` +
      `<ID>IMG</ID><BGIMG>1</BGIMG><ITMX>0</ITMX><ITMY>0</ITMY><IMGFIL>background.png</IMGFIL>\r\n` +
      `<ID>IMG</ID><BGIMG>0</BGIMG><RESIZW>80</RESIZW><RESIZH>20</RESIZH><ITMX>12</ITMX><ITMY>8</ITMY><IMGFIL>box.png</IMGFIL>\r\n` +
      `<ID>[GAUGE]TCPU</ID><LBL>CPU</LBL><RESIZW>64</RESIZW><RESIZH>64</RESIZH><ITMX>100</ITMX><ITMY>40</ITMY>` +
      `<STAFLS>a.png|b.png|c.png</STAFLS>\r\n`;
    const parsed = parseAidaPanelText(text);
    expect(parsed.width).toBe(640);
    expect(parsed.height).toBe(400);
    expect(parsed.bgColor).toBe('#ff0000');
    expect(parsed.items.map(i => i.id)).toEqual(['IMG', 'IMG', '[GAUGE]TCPU']);
    expect(parsed.items[2].tags.LBL).toBe('CPU');
    expect(parsed.items[2].tags.STAFLS).toBe('a.png|b.png|c.png');
  });

  it('decodes UTF-16LE with a BOM the way AIDA64 writes panel.sp2', () => {
    const text = '<SPWIDTH>123</SPWIDTH><ID>IMG</ID>';
    expect(decodeAidaDefBytes(toUtf16LE(text))).toContain('<SPWIDTH>123</SPWIDTH>');
    expect(colorRefToHex(255)).toBe('#ff0000');
    expect(colorRefToHex(-1)).toBe('#ffffff');
  });
});

describe('InfoPanel XML parse', () => {
  it('reads profile color, background image, and a named gauge with HWInfo reminder', () => {
    const profile =
      `<Profile><Width>480</Width><Height>320</Height>` +
      `<BackgroundColor>#FF112233</BackgroundColor></Profile>`;
    const items =
      `<ArrayOfDisplayItem xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
      `<DisplayItem xsi:type="ImageDisplayItem"><Name>Background</Name><X>0</X><Y>0</Y>` +
      `<FilePath>background.png</FilePath><Width>480</Width><Height>320</Height></DisplayItem>` +
      `<DisplayItem xsi:type="GaugeDisplayItem"><Name>CPU (HWInfo: CPU Package)</Name>` +
      `<X>10</X><Y>20</Y><Width>80</Width><Height>80</Height>` +
      `<Images><ImageDisplayItem><FilePath>g-00.png</FilePath></ImageDisplayItem>` +
      `<ImageDisplayItem><FilePath>g-01.png</FilePath></ImageDisplayItem></Images>` +
      `</DisplayItem></ArrayOfDisplayItem>`;
    const parsed = parseInfoPanelXml(profile, items);
    expect(parsed.width).toBe(480);
    expect(parsed.color).toBe('#112233');
    expect(parsed.transparent).toBe(false);
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[1].type).toBe('gauge');
    expect(parsed.items[1].name).toBe('CPU');
    expect(parsed.items[1].hwinfoSensorLabel).toBe('CPU Package');
    expect(parsed.items[1].filePaths).toEqual(['g-00.png', 'g-01.png']);
    expect(parsed.items[1].scale).toBe(100);
    expect(parseInfoPanelName('Fan')).toEqual({ name: 'Fan', hwinfoSensorLabel: '' });
    expect(parseProfileArgb('#00112233')).toEqual({ color: '#112233', transparent: true });
  });

  it('uses InfoPanel compiled defaults when Width/Height/X/Y/Scale are omitted', () => {
    const profile = `<Profile><Width>200</Width><Height>100</Height><BackgroundColor>#FF696969</BackgroundColor></Profile>`;
    const items =
      `<ArrayOfDisplayItem xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
      `<DisplayItem xsi:type="ImageDisplayItem"><Name>sensor-panel-borders.png</Name>` +
      `<X>0</X><Y>0</Y><FilePath>sensor-panel-borders.png</FilePath></DisplayItem>` +
      `<DisplayItem xsi:type="GaugeDisplayItem"><Name>FPS</Name>` +
      `<Images><ImageDisplayItem><FilePath>fps.png</FilePath><Width>999</Width></ImageDisplayItem></Images>` +
      `</DisplayItem>` +
      `<DisplayItem xsi:type="ClockDisplayItem"><Name>Clock</Name></DisplayItem>` +
      `</ArrayOfDisplayItem>`;
    const parsed = parseInfoPanelXml(profile, items);
    expect(parsed.items).toHaveLength(3);
    expect(parsed.items[0].width).toBe(0);
    expect(parsed.items[0].height).toBe(0);
    expect(parsed.items[0].x).toBe(0);
    expect(parsed.items[1].x).toBe(100);
    expect(parsed.items[1].y).toBe(100);
    expect(parsed.items[1].width).toBe(0);
    expect(parsed.items[1].scale).toBe(100);
    expect(parsed.items[2].type).toBe('text');
    expect(parsed.items[2].text?.text).toMatch(/\d/);
  });

  it('imports labels, sensor values, and formatted clock/calendar text', () => {
    const profile = `<Profile><Width>200</Width><Height>100</Height></Profile>`;
    const items =
      `<ArrayOfDisplayItem xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
      `<DisplayItem xsi:type="TextDisplayItem"><Name>UTILITIZATION</Name><X>10</X><Y>80</Y>` +
      `<Font>Segoe UI</Font><FontSize>12</FontSize><Bold>true</Bold><Color>#FF222222</Color></DisplayItem>` +
      `<DisplayItem xsi:type="SensorDisplayItem"><Name>CPU Utilization</Name><X>20</X><Y>40</Y>` +
      `<Unit>%</Unit><ShowUnit>true</ShowUnit><FontSize>18</FontSize><Color>#FF000000</Color></DisplayItem>` +
      `</ArrayOfDisplayItem>`;
    const parsed = parseInfoPanelXml(profile, items);
    expect(parsed.items.map(i => i.type)).toEqual(['text', 'text']);
    expect(parsed.items[0].text).toMatchObject({ text: 'UTILITIZATION', bold: true, fontSize: 12 });
    expect(parsed.items[1].text?.text).toBe('68%');
    expect(sampleSensorDisplayText({
      name: 'GPU Temperature', unit: '', showUnit: true, showName: false, uppercase: false, precision: 0, overridePrecision: false,
    })).toBe('56°C');
    expect(formatDotNetDate('M/d/yyyy', new Date(2026, 9, 16))).toBe('10/16/2026');
    expect(formatDotNetDate('hh:mm tt', new Date(2026, 9, 16, 11, 22))).toBe('11:22 AM');
  });
});

describe('importDesignFile', () => {
  it('restores a project from the zip sidecar and reconstructs a sidecar-less .spzip', async () => {
    const panel = defaultPanelConfig();
    const gauges = [normalizeGauge({ name: 'Live', x: 4, y: 8, width: 40, height: 20, opts: { mode: 'bar' } })];
    const themes = structuredClone(DEFAULT_THEMES);

    const withSidecar = new JSZip();
    withSidecar.file(DESIGN_SIDECAR_NAME, serializePanelFile(panel, gauges, themes));
    withSidecar.file('panel.sp2', '<SPWIDTH>1</SPWIDTH>');
    const sidecarFile = new File([await withSidecar.generateAsync({ type: 'blob' })], 'ours.spzip');
    const restored = await importDesignFile(sidecarFile);
    expect(restored.gauges[0].name).toBe('Live');
    expect(restored.gauges[0].importedImage).toBeNull();
    expect(restored.panel.width).toBe(panel.width);

    const png = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
      0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
      0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);
    const foreign = new JSZip();
    foreign.file('panel.sp2', toUtf16LE(
      `<SPWIDTH>200</SPWIDTH><SPHEIGHT>100</SPHEIGHT><SPBGCOLOR>16777215</SPBGCOLOR>\r\n` +
      `<ID>IMG</ID><BGIMG>1</BGIMG><ITMX>0</ITMX><ITMY>0</ITMY><IMGFIL>background.png</IMGFIL>\r\n` +
      `<ID>[GAUGE]TCPU</ID><LBL>CPU temp</LBL><RESIZW>32</RESIZW><RESIZH>32</RESIZH>` +
      `<ITMX>16</ITMX><ITMY>24</ITMY><STAFLS>g00.png|g01.png</STAFLS>\r\n`,
    ));
    foreign.file('background.png', png);
    foreign.file('g00.png', png);
    foreign.file('g01.png', png);
    const reconstructed = await importDesignFile(new File([await foreign.generateAsync({ type: 'blob' })], 'aida.spzip'));
    expect(reconstructed.panel.width).toBe(200);
    expect(reconstructed.panel.height).toBe(100);
    expect(reconstructed.gauges).toHaveLength(1);
    expect(reconstructed.gauges[0].name).toBe('CPU temp');
    expect(reconstructed.gauges[0].aidaSensorId).toBe('TCPU');
    expect(reconstructed.gauges[0].x).toBe(16);
    expect(reconstructed.gauges[0].y).toBe(24);
    expect(reconstructed.gauges[0].importedImage?.startsWith('data:image/png;base64,')).toBe(true);
    expect(reconstructed.panel.background.image?.startsWith('data:image/png;base64,')).toBe(true);

    function pngSized(w: number, h: number) {
      const out = Uint8Array.from(png);
      const dv = new DataView(out.buffer);
      dv.setUint32(16, w);
      dv.setUint32(20, h);
      return out;
    }
    const infopanel = new JSZip();
    infopanel.file('Profile.xml', `<Profile><Width>200</Width><Height>100</Height><BackgroundColor>#FF696969</BackgroundColor></Profile>`);
    infopanel.file('DisplayItems.xml',
      `<?xml version="1.0"?><ArrayOfDisplayItem xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
      `<DisplayItem xsi:type="ImageDisplayItem"><Name>sensor-panel-borders.png</Name><X>0</X><Y>0</Y>` +
      `<FilePath>sensor-panel-borders.png</FilePath></DisplayItem>` +
      `<DisplayItem xsi:type="GaugeDisplayItem"><Name>FPS</Name>` +
      `<X>40</X><Y>20</Y><Scale>50</Scale>` +
      `<Images><ImageDisplayItem><FilePath>fps.png</FilePath></ImageDisplayItem></Images>` +
      `</DisplayItem></ArrayOfDisplayItem>`);
    infopanel.file('assets\\sensor-panel-borders.png', pngSized(200, 100), { createFolders: false });
    infopanel.file('assets\\fps.png', pngSized(80, 80), { createFolders: false });
    const fromInfo = await importDesignFile(new File([await infopanel.generateAsync({ type: 'blob' })], 'panel.infopanel'));
    expect(fromInfo.panel.background.image?.startsWith('data:image/png;base64,')).toBe(true);
    expect(fromInfo.gauges).toHaveLength(1);
    expect(fromInfo.gauges[0].name).toBe('FPS');
    expect(fromInfo.gauges[0].x).toBe(40);
    expect(fromInfo.gauges[0].width).toBe(40);
    expect(fromInfo.gauges[0].height).toBe(40);
    expect(fromInfo.gauges[0].importedImage?.startsWith('data:image/png;base64,')).toBe(true);
  });
});
