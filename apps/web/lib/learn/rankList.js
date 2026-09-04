/**
 * Pure helpers for Learn-mode drag-to-rank lists.
 */

export function reorder(list, from, to) {
  if (from === to || from < 0 || to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function slotIndexFromY(clientY, listTop, listHeight, count) {
  if (count <= 0 || !(listHeight > 0)) return 0;
  const y = clientY - listTop;
  if (y <= 0) return 0;
  if (y >= listHeight) return count - 1;
  return Math.min(count - 1, Math.max(0, Math.floor((y / listHeight) * count)));
}

export function slotsWithPlaceholder(order, fromIndex, overIndex) {
  if (fromIndex < 0 || fromIndex >= order.length) {
    return order.map((id) => ({ kind: "item", id }));
  }
  const draggedId = order[fromIndex];
  const rest = order.filter((_, index) => index !== fromIndex);
  const insertAt = Math.min(Math.max(overIndex, 0), rest.length);
  const slots = rest.map((id) => ({ kind: "item", id }));
  slots.splice(insertAt, 0, { kind: "placeholder", id: draggedId });
  return slots;
}
