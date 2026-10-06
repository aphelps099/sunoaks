"use client";

import { useCallback, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";

// Pointer-driven reordering for a row or column of siblings, with no library.
// The picked item follows the pointer; the items it passes slide out of the way
// by its own size, so the drop target reads before the drop. The axis is
// measured from the siblings at pick-up, so one hook serves the vertical scene
// list, its horizontal phone layout, and the timeline.
export type ReorderDrag = { index: number; target: number; delta: number; axis: "x" | "y"; size: number };
type Session = { pointerId: number; index: number; startX: number; startY: number; mids: number[]; axis: "x" | "y"; size: number; active: boolean };
type Options = {
  disabled?: boolean;
  /** Touch drags along a scrolling list fight the scroll, so lists opt in. */
  touch?: boolean;
  /** Fires on pick-up, before any movement, so the item is selected as it lifts. */
  onPick?: (index: number) => void;
  onReorder: (from: number, to: number) => void;
};
const ITEM = "data-reorder-item";
const THRESHOLD = 5;

export function useDragReorder({ disabled, touch = false, onPick, onReorder }: Options) {
  const [drag, setDrag] = useState<ReorderDrag | null>(null);
  const dragRef = useRef<ReorderDrag | null>(null);
  const session = useRef<Session | null>(null);
  const dropped = useRef(false);
  const update = (next: ReorderDrag | null) => { dragRef.current = next; setDrag(next); };

  const onPointerDown = useCallback((index: number, event: ReactPointerEvent<HTMLElement>) => {
    if (disabled || event.button !== 0 || (event.pointerType === "touch" && !touch)) return;
    dropped.current = false;
    const item = event.currentTarget.closest<HTMLElement>(`[${ITEM}]`) || event.currentTarget;
    const siblings = Array.from(item.parentElement?.querySelectorAll<HTMLElement>(`:scope > [${ITEM}]`) ?? [item]);
    const rects = siblings.map((element) => element.getBoundingClientRect());
    const axis: "x" | "y" = rects.length > 1 && Math.abs(rects[1].left - rects[0].left) > Math.abs(rects[1].top - rects[0].top) ? "x" : "y";
    const gap = rects.length > 1 ? Math.max(0, axis === "x" ? rects[1].left - rects[0].right : rects[1].top - rects[0].bottom) : 0;
    const own = rects[index] ?? rects[0];
    session.current = { pointerId: event.pointerId, index, startX: event.clientX, startY: event.clientY, axis, active: false, size: (own ? (axis === "x" ? own.width : own.height) : 0) + gap, mids: rects.map((rect) => axis === "x" ? rect.left + rect.width / 2 : rect.top + rect.height / 2) };
    onPick?.(index);
  }, [disabled, touch, onPick]);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const current = session.current;
    if (!current || event.pointerId !== current.pointerId) return;
    const dx = event.clientX - current.startX, dy = event.clientY - current.startY;
    if (!current.active) {
      if (Math.hypot(dx, dy) < THRESHOLD) return;
      current.active = true;
      if (typeof event.currentTarget.setPointerCapture === "function") { try { event.currentTarget.setPointerCapture(event.pointerId); } catch {} }
    }
    const pointer = current.axis === "x" ? event.clientX : event.clientY;
    let target = current.index;
    for (let index = 0; index < current.mids.length; index += 1) {
      if (index < current.index && pointer < current.mids[index]) { target = index; break; }
      if (index > current.index && pointer > current.mids[index]) target = index;
    }
    update({ index: current.index, target, delta: current.axis === "x" ? dx : dy, axis: current.axis, size: current.size });
    event.preventDefault();
  }, []);

  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const current = session.current;
    if (!current || event.pointerId !== current.pointerId) return;
    session.current = null;
    if (!current.active) return;
    if (typeof event.currentTarget.releasePointerCapture === "function") { try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {} }
    const result = dragRef.current;
    update(null);
    dropped.current = true;
    if (result && result.target !== result.index) onReorder(result.index, result.target);
  }, [onReorder]);

  const onPointerCancel = useCallback(() => { session.current = null; update(null); }, []);
  // A drop should not also count as a click on the item beneath the pointer.
  const onClickCapture = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (!dropped.current) return;
    dropped.current = false; event.preventDefault(); event.stopPropagation();
  }, []);

  /** Pointer handlers for the surface that picks the item up. */
  const handle = (index: number) => ({ onPointerDown: (event: ReactPointerEvent<HTMLElement>) => onPointerDown(index, event), onPointerMove, onPointerUp, onPointerCancel, onClickCapture });
  /** Attributes for the sibling that moves, which may be the handle itself. */
  const item = (index: number): { [ITEM]: string; style: CSSProperties | undefined; lifted: boolean } => {
    if (!drag) return { [ITEM]: "", style: undefined, lifted: false };
    const { index: from, target, delta, axis, size } = drag;
    const translate = (amount: number) => axis === "x" ? `translateX(${amount}px)` : `translateY(${amount}px)`;
    if (index === from) return { [ITEM]: "", style: { transform: translate(delta), zIndex: 3, position: "relative", transition: "none" }, lifted: true };
    if (index > from && index <= target) return { [ITEM]: "", style: { transform: translate(-size) }, lifted: false };
    if (index < from && index >= target) return { [ITEM]: "", style: { transform: translate(size) }, lifted: false };
    return { [ITEM]: "", style: undefined, lifted: false };
  };
  return { drag, handle, item };
}

/** Alt + arrow keys move the focused item one slot; returns true when handled. */
export function reorderKey(event: ReactKeyboardEvent<HTMLElement>, index: number, count: number, onReorder: (from: number, to: number) => void) {
  if (!event.altKey) return false;
  const earlier = event.key === "ArrowUp" || event.key === "ArrowLeft", later = event.key === "ArrowDown" || event.key === "ArrowRight";
  if (!earlier && !later) return false;
  event.preventDefault();
  const to = earlier ? index - 1 : index + 1;
  if (to >= 0 && to < count) onReorder(index, to);
  return true;
}
