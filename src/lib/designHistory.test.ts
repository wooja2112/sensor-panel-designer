import { describe, expect, it } from 'vitest';
import { DesignHistory, type DesignSnapshot } from './designHistory';
import { isEditableKeyboardTarget } from './keyboard';

function snap(label: string): DesignSnapshot {
  return {
    panel: { label } as unknown as DesignSnapshot['panel'],
    gauges: [{ label }] as unknown as DesignSnapshot['gauges'],
    themes: { label } as unknown as DesignSnapshot['themes'],
    selectedIds: [label],
  };
}

describe('DesignHistory', () => {
  it('does not record the initial snapshot as an undo step', () => {
    const a = snap('a');
    const h = new DesignHistory(a);
    h.onChange(a);
    expect(h.canUndo).toBe(false);
    expect(h.undo()).toBeNull();
  });

  it('coalesces a burst of changes into one undo step', () => {
    const a = snap('a');
    const b = snap('b');
    const c = snap('c');
    const h = new DesignHistory(a);
    h.onChange(b);
    h.onChange(c);
    expect(h.undo()).toEqual(a);
    expect(h.present).toEqual(a);
    expect(h.redo()).toEqual(c);
  });

  it('starts a new undo step after endCoalesce', () => {
    const a = snap('a');
    const b = snap('b');
    const c = snap('c');
    const h = new DesignHistory(a);
    h.onChange(b);
    h.endCoalesce();
    h.onChange(c);
    expect(h.undo()).toEqual(b);
    expect(h.undo()).toEqual(a);
    expect(h.redo()).toEqual(b);
    expect(h.redo()).toEqual(c);
  });

  it('records replace as a single undo step', () => {
    const a = snap('a');
    const b = snap('b');
    const h = new DesignHistory(a);
    h.replace(b);
    h.onChange(b); // React effect after apply — must not record a second step
    expect(h.undo()).toEqual(a);
    expect(h.redo()).toEqual(b);
  });

  it('clears redo when a new edit happens after undo', () => {
    const a = snap('a');
    const b = snap('b');
    const d = snap('d');
    const h = new DesignHistory(a);
    h.onChange(b);
    h.endCoalesce();
    h.undo();
    h.onChange(h.present);
    h.endCoalesce();
    h.onChange(d);
    expect(h.canRedo).toBe(false);
    expect(h.undo()).toEqual(a);
  });
});

describe('isEditableKeyboardTarget', () => {
  it('treats form fields as editable and ignores the window', () => {
    expect(isEditableKeyboardTarget(null)).toBe(false);
    expect(isEditableKeyboardTarget({ tagName: 'INPUT' })).toBe(true);
    expect(isEditableKeyboardTarget({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isEditableKeyboardTarget({ tagName: 'SELECT' })).toBe(true);
    expect(isEditableKeyboardTarget({ tagName: 'BUTTON' })).toBe(false);
    expect(isEditableKeyboardTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
  });
});
