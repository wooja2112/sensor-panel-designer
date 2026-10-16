// Static import so Vite puts jszip in the initial module graph. A dynamic
// `import('jszip')` is rewritten to `/node_modules/.vite/deps/jszip.js?v=HASH`
// and 404s after a mid-session re-optimize (lockfile change, new dep, etc.).
import JSZip from 'jszip';
export { JSZip };
