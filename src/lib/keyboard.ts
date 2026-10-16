// True when the event target is a field that should keep native keys
// (arrows in a number input, Delete while editing a name, Ctrl+Z for text).
export function isEditableKeyboardTarget(target: EventTarget | null | object): boolean {
  if (!target || typeof target !== 'object') return false;
  const el = target as { tagName?: string; isContentEditable?: boolean };
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return Boolean(el.isContentEditable);
}
