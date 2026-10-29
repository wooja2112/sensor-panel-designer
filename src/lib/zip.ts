// Static import so Vite puts jszip in the initial module graph. A dynamic
// `import('jszip')` is rewritten to `/node_modules/.vite/deps/jszip.js?v=HASH`
// and 404s after a mid-session re-optimize (lockfile change, new dep, etc.).
import JSZip from 'jszip';
export { JSZip };

// The most one opened bundle may decompress to, across all entries it reads.
// Real bundles are a few MB of PNGs; this stops a corrupt or hostile zip from
// exhausting memory.
export const MAX_UNZIPPED_BYTES = 512 * 1024 * 1024;

export interface UnzipBudget {
  limit: number;
  remaining: number;
}

export function unzipBudget(limit = MAX_UNZIPPED_BYTES): UnzipBudget {
  return { limit, remaining: limit };
}

// ZipObject.internalStream exists at runtime but isn't in jszip's typings.
type EntryStream = JSZip.JSZipStreamHelper<Uint8Array>;
type StreamableEntry = JSZip.JSZipObject & { internalStream(type: 'uint8array'): EntryStream };

// An entry's declared size is untrusted, so the bytes are counted as they
// decompress and the read stops as soon as it passes the remaining budget.
export function readZipEntry(entry: JSZip.JSZipObject, budget: UnzipBudget): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let total = 0;
    let failed = false;
    const stream = (entry as StreamableEntry).internalStream('uint8array');
    stream
      .on('data', chunk => {
        if (failed) return;
        total += chunk.length;
        if (total > budget.remaining) {
          failed = true;
          stream.pause();
          reject(new Error(`That zip is too large to open (over ${Math.round(budget.limit / (1024 * 1024))} MB uncompressed).`));
          return;
        }
        chunks.push(chunk);
      })
      .on('error', err => { if (!failed) { failed = true; reject(err); } })
      .on('end', () => {
        if (failed) return;
        budget.remaining -= total;
        const out = new Uint8Array(total);
        let offset = 0;
        for (const c of chunks) { out.set(c, offset); offset += c.length; }
        resolve(out);
      })
      .resume();
  });
}

export async function readZipText(entry: JSZip.JSZipObject, budget: UnzipBudget): Promise<string> {
  return new TextDecoder().decode(await readZipEntry(entry, budget));
}
