import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DESIGN_HISTORY_COALESCE_MS,
  DesignHistory,
  type DesignSnapshot,
} from '../lib/designHistory';
import type { GaugeInstance, PanelConfig } from '../types';
import type { ThemesMap } from '../lib/gaugeRender';

export function useDesignHistory(
  panel: PanelConfig,
  gauges: GaugeInstance[],
  themes: ThemesMap,
  selectedIds: string[],
  apply: (snapshot: DesignSnapshot) => void,
) {
  const historyRef = useRef<DesignHistory | null>(null);
  if (!historyRef.current) {
    historyRef.current = new DesignHistory({ panel, gauges, themes, selectedIds });
  }

  const applyRef = useRef(apply);
  applyRef.current = apply;
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;

  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const syncButtons = () => {
    const h = historyRef.current!;
    setCanUndo(h.canUndo);
    setCanRedo(h.canRedo);
  };

  // Record design edits before touchSelection so a combined change
  // (e.g. delete + clear selection) pushes the *previous* selection
  // onto the undo stack instead of the already-cleared one. Selection is read
  // through a ref so a selection-only change never records an undo step;
  // touchSelection below keeps the present snapshot's selection current.
  useEffect(() => {
    historyRef.current!.onChange({ panel, gauges, themes, selectedIds: selectedIdsRef.current });
    syncButtons();
    const t = setTimeout(() => historyRef.current!.endCoalesce(), DESIGN_HISTORY_COALESCE_MS);
    return () => clearTimeout(t);
  }, [panel, gauges, themes]);

  useEffect(() => {
    historyRef.current!.touchSelection(selectedIds);
  }, [selectedIds]);

  const undo = useCallback(() => {
    const snapshot = historyRef.current!.undo();
    if (snapshot) applyRef.current(snapshot);
    syncButtons();
  }, []);

  const redo = useCallback(() => {
    const snapshot = historyRef.current!.redo();
    if (snapshot) applyRef.current(snapshot);
    syncButtons();
  }, []);

  const replace = useCallback((snapshot: DesignSnapshot) => {
    historyRef.current!.replace(snapshot);
    applyRef.current(snapshot);
    syncButtons();
  }, []);

  return { undo, redo, replace, canUndo, canRedo };
}
