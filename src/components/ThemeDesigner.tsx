import { useState } from 'react';
import type { ThemeColors, ThemesMap } from '../lib/gaugeRender';
import { CtrlRow, ColorTriple, SectionLabel } from './ui-primitives';

export function ThemeDesigner({
  themes,
  activeKey,
  onClose,
  onThemesChange,
  onActiveKeyChange,
}: {
  themes: ThemesMap;
  activeKey: string;
  onClose: () => void;
  onThemesChange: (t: ThemesMap) => void;
  onActiveKeyChange: (k: string) => void;
}) {
  const [editingKey, setEditingKey] = useState(activeKey);
  const [nameInput, setNameInput] = useState(activeKey);

  const current = themes[editingKey] ?? themes[Object.keys(themes)[0]];

  const update = (patch: Partial<ThemeColors>) => {
    onThemesChange({ ...themes, [editingKey]: { ...current, ...patch } });
  };

  const applyRename = () => {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === editingKey) return;
    const newKey = trimmed.toLowerCase().replace(/\s+/g, '-');
    if (themes[newKey]) return; // already exists
    const updated: ThemesMap = {};
    for (const [k, v] of Object.entries(themes)) {
      updated[k === editingKey ? newKey : k] = v;
    }
    onThemesChange(updated);
    if (editingKey === activeKey) onActiveKeyChange(newKey);
    setEditingKey(newKey);
    setNameInput(newKey);
  };

  const addTheme = () => {
    let n = 1;
    while (themes[`custom-${n}`]) n++;
    const newKey = `custom-${n}`;
    onThemesChange({ ...themes, [newKey]: { ...current } });
    setEditingKey(newKey);
    setNameInput(newKey);
  };

  const deleteTheme = () => {
    if (Object.keys(themes).length <= 1) return;
    const updated = { ...themes };
    delete updated[editingKey];
    const firstKey = Object.keys(updated)[0];
    onThemesChange(updated);
    if (editingKey === activeKey) onActiveKeyChange(firstKey);
    setEditingKey(firstKey);
    setNameInput(firstKey);
  };

  const selectTheme = (k: string) => {
    setEditingKey(k);
    setNameInput(k);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.65)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-card border border-border rounded-xl flex flex-col overflow-hidden"
        style={{ width: 580, maxHeight: '85vh', fontFamily: "'DM Mono', monospace" }}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <span className="text-[11px] font-medium tracking-wider uppercase text-foreground">Theme Designer</span>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-base leading-none cursor-pointer w-6 h-6 flex items-center justify-center rounded hover:bg-secondary transition-colors"
          >×</button>
        </div>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          <div className="w-36 flex-shrink-0 border-r border-border flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto py-2" style={{ scrollbarWidth: 'thin' }}>
              {Object.keys(themes).map(k => (
                <button
                  type="button"
                  key={k}
                  onClick={() => selectTheme(k)}
                  className={[
                    'w-full text-left px-3 py-1.5 text-[11px] transition-colors cursor-pointer flex items-center gap-2',
                    editingKey === k ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/40',
                  ].join(' ')}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ background: themes[k].zone[0] }}
                  />
                  {k}
                </button>
              ))}
            </div>
            <div className="border-t border-border p-2">
              <button
                type="button"
                onClick={addTheme}
                className="w-full text-[10px] text-primary hover:text-primary/80 py-1 transition-colors cursor-pointer tracking-wider uppercase"
              >
                + Add theme
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5" style={{ scrollbarWidth: 'thin' }}>
            <CtrlRow label="Theme name">
              <div className="flex gap-2">
                <input
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  onBlur={applyRename}
                  onKeyDown={e => { if (e.key === 'Enter') { applyRename(); (e.target as HTMLInputElement).blur(); } }}
                  className="flex-1 bg-background border border-border rounded px-2 py-1 text-[11px] text-foreground focus:outline-none focus:border-primary/60"
                />
              </div>
            </CtrlRow>

            <div className="border-t border-border/50" />

            <ColorTriple
              label="Zone colors — low / mid / high"
              colors={current.zone}
              onChange={(i, v) => {
                const zone: [string, string, string] = [...current.zone];
                zone[i] = v;
                update({ zone });
              }}
            />

            <ColorTriple
              label="Mono colors — low / mid / high"
              colors={current.mono}
              onChange={(i, v) => {
                const mono: [string, string, string] = [...current.mono];
                mono[i] = v;
                update({ mono });
              }}
            />

            <div className="flex flex-col gap-1.5">
              <SectionLabel>Solid color</SectionLabel>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-8 h-8 rounded border border-border" style={{ background: current.solid }} />
                  <input
                    type="color"
                    value={current.solid}
                    onChange={e => update({ solid: e.target.value })}
                    className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                  />
                </div>
                <span className="text-[10px] text-muted-foreground font-mono">{current.solid}</span>
              </div>
            </div>

            <div className="border-t border-border/50 pt-3">
              <button
                type="button"
                onClick={deleteTheme}
                disabled={Object.keys(themes).length <= 1}
                className="text-[10px] text-destructive hover:opacity-80 transition-opacity disabled:opacity-25 cursor-pointer tracking-wider uppercase"
              >
                Delete "{editingKey}"
              </button>
            </div>
          </div>
        </div>

        <div className="border-t border-border px-5 py-3 flex items-center justify-between">
          <span className="text-[9px] text-muted-foreground">Changes apply immediately to the preview</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-[11px] bg-primary text-primary-foreground rounded hover:opacity-90 transition-opacity cursor-pointer font-medium"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
