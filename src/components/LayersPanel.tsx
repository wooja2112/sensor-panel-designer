import type { GaugeInstance } from '../types';
import type { GaugeMode } from '../lib/gaugeRender';

const ADD_OPTIONS: { mode: GaugeMode; label: string }[] = [
  { mode: 'bar', label: '+ Bar' },
  { mode: 'circ', label: '+ Circular' },
  { mode: 'needle', label: '+ Needle' },
  { mode: 'container', label: '+ Container' },
  { mode: 'text', label: '+ Label' },
  { mode: 'image', label: '+ Image' },
];

export function LayersPanel({
  gauges, selectedIds, onSelect, onAdd, onDelete, onReorder,
}: {
  gauges: GaugeInstance[];
  selectedIds: string[];
  onSelect: (id: string, additive?: boolean) => void;
  onAdd: (mode: GaugeMode) => void;
  onDelete: (id: string) => void;
  onReorder: (id: string, dir: -1 | 1) => void;
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[9px] tracking-[0.14em] uppercase font-medium text-muted-foreground">Gauges on panel</span>
        <div className="flex gap-1.5 flex-wrap justify-end">
          {ADD_OPTIONS.map(o => (
            <button key={o.mode} type="button" onClick={() => onAdd(o.mode)}
              className="px-2 py-0.5 text-[10px] rounded border border-border/40 text-muted-foreground hover:text-foreground hover:border-border/70 transition-colors cursor-pointer"
            >{o.label}</button>
          ))}
        </div>
      </div>

      {gauges.length === 0 ? (
        <div className="text-[11px] text-muted-foreground py-2">No gauges yet — add one above.</div>
      ) : (
        <div className="flex flex-col gap-1 max-h-32 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          {gauges.map((g, i) => (
            <div key={g.id}
              onClick={e => onSelect(g.id, e.shiftKey || e.ctrlKey || e.metaKey)}
              className={[
                'flex items-center gap-2 px-2 py-1 rounded text-[11px] cursor-pointer transition-colors',
                selectedIds.includes(g.id) ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/40',
              ].join(' ')}
            >
              <span className="flex-1 truncate">{g.name}</span>
              <span className="text-[9px] uppercase text-muted-foreground/70">{g.opts.mode}</span>
              <button type="button" disabled={i === 0} onClick={e => { e.stopPropagation(); onReorder(g.id, -1); }}
                className="w-5 h-5 flex items-center justify-center rounded hover:bg-secondary/70 disabled:opacity-20 cursor-pointer text-[10px]"
                title="Move up"
              >↑</button>
              <button type="button" disabled={i === gauges.length - 1} onClick={e => { e.stopPropagation(); onReorder(g.id, 1); }}
                className="w-5 h-5 flex items-center justify-center rounded hover:bg-secondary/70 disabled:opacity-20 cursor-pointer text-[10px]"
                title="Move down"
              >↓</button>
              <button type="button" onClick={e => { e.stopPropagation(); onDelete(g.id); }}
                className="w-5 h-5 flex items-center justify-center rounded hover:bg-destructive/20 text-destructive cursor-pointer text-[11px]"
                title="Delete"
              >×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
