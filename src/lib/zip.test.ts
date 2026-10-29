import { describe, expect, it } from 'vitest';
import { JSZip, readZipEntry, readZipText, unzipBudget } from './zip';

async function twoEntryZip() {
  const zip = new JSZip();
  zip.file('a.bin', new Uint8Array(600));
  zip.file('b.txt', 'x'.repeat(600));
  return JSZip.loadAsync(await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
}

describe('readZipEntry', () => {
  it('reads entries within the budget and refuses a zip that unpacks past it', async () => {
    const zip = await twoEntryZip();
    const fits = unzipBudget(1200);
    expect((await readZipEntry(zip.file('a.bin')!, fits)).length).toBe(600);
    expect(await readZipText(zip.file('b.txt')!, fits)).toBe('x'.repeat(600));
    expect(fits.remaining).toBe(0);

    const short = unzipBudget(1199);
    await readZipEntry(zip.file('a.bin')!, short);
    await expect(readZipEntry(zip.file('b.txt')!, short)).rejects.toThrow(/too large/);
    await expect(readZipEntry(zip.file('a.bin')!, unzipBudget(500))).rejects.toThrow(/too large/);
  });
});
