// Right-click menus for the workspace and the layers list. Every entry reuses
// an action the app already has.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { GaugeMode } from '../lib/gaugeRender';
import type { Stack } from '../lib/layout';

const ADD_OPTIONS: { mode: GaugeMode; label: string }[] = [
  { mode: 'bar', label: 'Bar' },
  { mode: 'circ', label: 'Circular' },
  { mode: 'needle', label: 'Needle' },
  { mode: 'container', label: 'Container' },
  { mode: 'text', label: 'Label' },
  { mode: 'image', label: 'Image' },
];

export type ContextAction =
  | { kind: 'duplicate' }
  | { kind: 'delete' }
  | { kind: 'fitToContent' }
  | { kind: 'center'; axis: 'x' | 'y' }
  | { kind: 'restack'; stack: Stack }
  // Panel-space center for the new gauge.
  | { kind: 'add'; mode: GaugeMode; x: number; y: number }
  | { kind: 'selectAll' };

// What the open menu acts on, fixed when it opens: `count` is how many
// gauges the actions apply to (the whole selection when the right-clicked
// gauge was part of it).
export type MenuTarget =
  | { kind: 'gauges'; count: number }
  | { kind: 'panel'; x: number; y: number; hasGauges: boolean };

export interface OpenMenu {
  clientX: number;
  clientY: number;
  target: MenuTarget;
}

function Item({ label, shortcut, destructive, onClick }: { label: string; shortcut?: string; destructive?: boolean; onClick: () => void }) {
  return (
    <button type="button" role="menuitem" onClick={onClick}
      className={[
        'w-full flex items-center justify-between gap-6 px-3 py-1 text-left text-[11px] hover:bg-secondary cursor-pointer',
        destructive ? 'text-destructive' : 'text-foreground',
      ].join(' ')}
    >
      <span>{label}</span>
      {shortcut && <span className="text-[10px] text-muted-foreground">{shortcut}</span>}
    </button>
  );
}

function Separator() {
  return <div className="my-1 border-t border-border/50" />;
}

export function ContextMenu({ menu, onAction, onClose }: {
  menu: OpenMenu;
  onAction: (action: ContextAction) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: menu.clientX, top: menu.clientY });

  // Kept on screen: flipped up/left when it would run past the viewport.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({
      left: Math.max(4, Math.min(menu.clientX, window.innerWidth - width - 4)),
      top: Math.max(4, menu.clientY + height > window.innerHeight - 4 ? menu.clientY - height : menu.clientY),
    });
  }, [menu]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('blur', onClose);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  const pick = (action: ContextAction) => {
    onClose();
    onAction(action);
  };

  const { target } = menu;
  return (
    <div ref={ref} role="menu"
      className="fixed z-50 min-w-[170px] py-1 bg-card border border-border rounded shadow-lg"
      style={{ left: pos.left, top: pos.top }}
      onContextMenu={e => e.preventDefault()}
    >
      {target.kind === 'gauges' ? (
        <>
          {target.count > 1 && (
            <div className="px-3 py-0.5 text-[10px] text-muted-foreground">{target.count} gauges</div>
          )}
          <Item label="Duplicate" shortcut="Ctrl+D" onClick={() => pick({ kind: 'duplicate' })} />
          <Item label="Fit to content" onClick={() => pick({ kind: 'fitToContent' })} />
          <Separator />
          <Item label="Center horizontally" onClick={() => pick({ kind: 'center', axis: 'x' })} />
          <Item label="Center vertically" onClick={() => pick({ kind: 'center', axis: 'y' })} />
          <Separator />
          <Item label="Bring to front" onClick={() => pick({ kind: 'restack', stack: 'toFront' })} />
          <Item label="Bring forward" onClick={() => pick({ kind: 'restack', stack: 'forward' })} />
          <Item label="Send backward" onClick={() => pick({ kind: 'restack', stack: 'backward' })} />
          <Item label="Send to back" onClick={() => pick({ kind: 'restack', stack: 'toBack' })} />
          <Separator />
          <Item label="Delete" shortcut="Del" destructive onClick={() => pick({ kind: 'delete' })} />
        </>
      ) : (
        <>
          <div className="px-3 py-0.5 text-[10px] text-muted-foreground">Add here</div>
          {ADD_OPTIONS.map(o => (
            <Item key={o.mode} label={o.label} onClick={() => pick({ kind: 'add', mode: o.mode, x: target.x, y: target.y })} />
          ))}
          {target.hasGauges && (
            <>
              <Separator />
              <Item label="Select all" onClick={() => pick({ kind: 'selectAll' })} />
            </>
          )}
        </>
      )}
    </div>
  );
}
