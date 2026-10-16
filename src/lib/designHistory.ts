import type { GaugeInstance, PanelConfig } from '../types';
import type { ThemesMap } from './gaugeRender';

export const DESIGN_HISTORY_LIMIT = 40;
export const DESIGN_HISTORY_COALESCE_MS = 500;

export interface DesignSnapshot {
  panel: PanelConfig;
  gauges: GaugeInstance[];
  themes: ThemesMap;
  selectedIds: string[];
}

function sameDesign(a: DesignSnapshot, b: DesignSnapshot): boolean {
  return a.panel === b.panel && a.gauges === b.gauges && a.themes === b.themes;
}

// Ref-based undo stack. Snapshots keep the previous React state objects
// (updates in App are immutable), so a drag/slider burst is one undo step
// after DESIGN_HISTORY_COALESCE_MS of idle rather than one step per frame.
export class DesignHistory {
  past: DesignSnapshot[] = [];
  future: DesignSnapshot[] = [];
  present: DesignSnapshot;
  coalescing = false;
  restoring = false;

  constructor(initial: DesignSnapshot) {
    this.present = initial;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  touchSelection(selectedIds: string[]): void {
    if (this.present.selectedIds === selectedIds) return;
    this.present = { ...this.present, selectedIds };
  }

  onChange(next: DesignSnapshot): void {
    if (this.restoring) {
      this.restoring = false;
      this.present = next;
      return;
    }
    if (sameDesign(this.present, next)) return;
    if (!this.coalescing) {
      this.past.push(this.present);
      if (this.past.length > DESIGN_HISTORY_LIMIT) this.past.shift();
      this.future = [];
      this.coalescing = true;
    }
    this.present = next;
  }

  endCoalesce(): void {
    this.coalescing = false;
  }

  undo(): DesignSnapshot | null {
    if (this.past.length === 0) return null;
    this.future.push(this.present);
    this.present = this.past.pop()!;
    this.restoring = true;
    this.coalescing = false;
    return this.present;
  }

  redo(): DesignSnapshot | null {
    if (this.future.length === 0) return null;
    this.past.push(this.present);
    this.present = this.future.pop()!;
    this.restoring = true;
    this.coalescing = false;
    return this.present;
  }

  // Whole-design replacements (start fresh, open file) that must be one
  // undo step even if they land in the same tick as a selection clear.
  replace(next: DesignSnapshot): void {
    this.coalescing = false;
    if (sameDesign(this.present, next)) {
      this.present = next;
      return;
    }
    this.past.push(this.present);
    if (this.past.length > DESIGN_HISTORY_LIMIT) this.past.shift();
    this.future = [];
    this.present = next;
    this.restoring = true;
  }
}
