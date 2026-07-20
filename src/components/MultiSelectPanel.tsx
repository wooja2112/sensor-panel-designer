// Shown in place of GaugePanel when more than one gauge is selected — the
// per-mode controls in GaugePanel assume a single gauge, so a multi-select
// gets its own small set of batch actions instead.
import { CtrlRow } from './ui-primitives';

export function MultiSelectPanel({
  count, onMakeSameSize, onFitAllToContent, onSpaceEvenly, onCenterH, onCenterV, onDeselect,
}: {
  count: number;
  onMakeSameSize: () => void;
  onFitAllToContent: () => void;
  onSpaceEvenly: () => void;
  onCenterH: () => void;
  onCenterV: () => void;
  onDeselect: () => void;
}) {
  return (
    <div className="flex flex-col gap-3.5">
      <CtrlRow label={`${count} gauges selected`}>
        <span className="text-[11px] text-muted-foreground leading-relaxed">
          The first gauge you selected is the size reference; the first and
          last selected are the fixed ends for spacing.
        </span>
      </CtrlRow>

      <CtrlRow label="Align on panel">
        <div className="flex gap-2">
          <button type="button" onClick={onCenterH}
            className="flex-1 px-2 py-1.5 text-[10px] border border-border rounded hover:bg-secondary transition-colors cursor-pointer text-foreground"
            title="Center the whole selection horizontally on the panel, keeping every gauge's position relative to the others"
          >Center H</button>
          <button type="button" onClick={onCenterV}
            className="flex-1 px-2 py-1.5 text-[10px] border border-border rounded hover:bg-secondary transition-colors cursor-pointer text-foreground"
            title="Center the whole selection vertically on the panel, keeping every gauge's position relative to the others"
          >Center V</button>
        </div>
      </CtrlRow>

      <button type="button" onClick={onMakeSameSize}
        className="px-3 py-1.5 text-[11px] bg-primary text-primary-foreground rounded hover:opacity-90 transition-opacity cursor-pointer font-medium"
        title="Resize every selected gauge to match the first one you selected"
      >Make same size</button>

      <button type="button" onClick={onFitAllToContent}
        className="px-3 py-1.5 text-[11px] border border-border rounded hover:bg-secondary transition-colors cursor-pointer text-foreground"
        title="Shrink each selected gauge's bounding box down to exactly what it draws — no empty margin"
      >Fit each to content</button>

      <button type="button" onClick={onSpaceEvenly} disabled={count < 3}
        className="px-3 py-1.5 text-[11px] border border-border rounded hover:bg-secondary transition-colors disabled:opacity-40 cursor-pointer text-foreground"
        title="Evenly space the gauges you selected in between along a line from the first to the last one you selected"
      >Space evenly</button>

      <button type="button" onClick={onDeselect}
        className="px-3 py-1.5 text-[11px] border border-border rounded hover:bg-secondary transition-colors cursor-pointer text-foreground"
      >Deselect all</button>
    </div>
  );
}
