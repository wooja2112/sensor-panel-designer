import { useEffect, useRef, useState } from 'react';
import type { PanelConfig, GaugeInstance } from '../types';
import type { ThemesMap } from '../lib/gaugeRender';
import { renderPanel } from '../lib/compose';

type Zoom = number | 'fit';

const MIN_GAUGE_SIZE = 20;

interface DragState {
  id: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
}

interface ResizeState {
  id: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startWidth: number;
  startHeight: number;
}

export function CanvasWorkspace({
  panel, gauges, themes, selectedId, onSelect, onMoveGauge, onResizeGauge,
}: {
  panel: PanelConfig;
  gauges: GaugeInstance[];
  themes: ThemesMap;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onMoveGauge: (id: string, x: number, y: number) => void;
  onResizeGauge: (id: string, width: number, height: number) => void;
}) {
  const [zoom, setZoom] = useState<Zoom>('fit');
  const [available, setAvailable] = useState({ width: 600, height: 400 });

  const outerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);
  const scaleRef = useRef(1);

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setAvailable({ width: Math.max(1, width), height: Math.max(1, height) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const scale = zoom === 'fit'
    ? Math.max(0.02, Math.min(available.width / panel.width, available.height / panel.height, 4))
    : zoom;
  scaleRef.current = scale;

  const stageWidth = panel.width * scale;
  const stageHeight = panel.height * scale;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderPanel(canvas, panel, gauges, themes);
  }, [panel, gauges, themes]);

  useEffect(() => {
    function handleMove(e: PointerEvent) {
      const drag = dragRef.current;
      if (drag && e.pointerId === drag.pointerId) {
        const dx = (e.clientX - drag.startClientX) / scaleRef.current;
        const dy = (e.clientY - drag.startClientY) / scaleRef.current;
        onMoveGauge(drag.id, Math.round(drag.startX + dx), Math.round(drag.startY + dy));
        return;
      }
      const resize = resizeRef.current;
      if (resize && e.pointerId === resize.pointerId) {
        const dx = (e.clientX - resize.startClientX) / scaleRef.current;
        const dy = (e.clientY - resize.startClientY) / scaleRef.current;
        onResizeGauge(
          resize.id,
          Math.max(MIN_GAUGE_SIZE, Math.round(resize.startWidth + dx)),
          Math.max(MIN_GAUGE_SIZE, Math.round(resize.startHeight + dy)),
        );
      }
    }
    function handleUp() {
      dragRef.current = null;
      resizeRef.current = null;
    }
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [onMoveGauge, onResizeGauge]);

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      <div className="flex items-center justify-between">
        <span className="text-[9px] tracking-[0.14em] uppercase font-medium text-muted-foreground">
          {panel.width} × {panel.height}px
        </span>
        <div className="flex items-center gap-1">
          {(['fit', 0.25, 0.5, 0.75, 1] as Zoom[]).map(z => (
            <button key={z} type="button" onClick={() => setZoom(z)}
              className={[
                'px-2 py-0.5 text-[9px] rounded border transition-colors cursor-pointer',
                zoom === z ? 'bg-secondary border-border/60 text-foreground' : 'border-border/30 text-muted-foreground hover:text-foreground hover:border-border/60',
              ].join(' ')}
            >
              {z === 'fit' ? 'Fit' : `${(z as number) * 100}%`}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={outerRef}
        className="flex-1 min-h-0 flex items-center justify-center bg-background/40 rounded border border-border/40 overflow-auto"
      >
        <div
          className="relative flex-shrink-0"
          style={{ width: stageWidth, height: stageHeight }}
          onPointerDown={e => { if (e.target === e.currentTarget) onSelect(null); }}
        >
          <canvas
            ref={canvasRef}
            className="checkerboard"
            style={{ width: stageWidth, height: stageHeight, display: 'block', borderRadius: 3, imageRendering: scale > 1 ? 'pixelated' : 'auto' }}
            onPointerDown={() => onSelect(null)}
          />
          {gauges.map(g => {
            const isSelected = g.id === selectedId;
            return (
              <div
                key={g.id}
                onPointerDown={e => {
                  e.stopPropagation();
                  onSelect(g.id);
                  (e.target as HTMLElement).setPointerCapture(e.pointerId);
                  dragRef.current = {
                    id: g.id,
                    pointerId: e.pointerId,
                    startClientX: e.clientX,
                    startClientY: e.clientY,
                    startX: g.x,
                    startY: g.y,
                  };
                }}
                className={isSelected ? 'absolute cursor-move' : 'absolute cursor-move border border-transparent hover:border-primary/50'}
                style={{
                  left: g.x * scale,
                  top: g.y * scale,
                  width: g.width * scale,
                  height: g.height * scale,
                }}
                title={g.name}
              >
                {isSelected && (
                  // Rotated separately from the drag hitbox above: the hitbox and
                  // resize handle below stay axis-aligned (resize math assumes
                  // un-rotated width/height deltas), but the visible outline should
                  // track the gauge's own rotation so it still frames the rotated
                  // artwork instead of the un-rotated bounding box.
                  <div
                    className="absolute inset-0 border-2 border-primary pointer-events-none"
                    style={{ transform: `rotate(${g.opts.rotation}deg)` }}
                  />
                )}
                {isSelected && (
                  <div
                    onPointerDown={e => {
                      e.stopPropagation();
                      (e.target as HTMLElement).setPointerCapture(e.pointerId);
                      resizeRef.current = {
                        id: g.id,
                        pointerId: e.pointerId,
                        startClientX: e.clientX,
                        startClientY: e.clientY,
                        startWidth: g.width,
                        startHeight: g.height,
                      };
                    }}
                    className="absolute -right-1.5 -bottom-1.5 w-3 h-3 rounded-sm bg-primary border border-background cursor-nwse-resize"
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
