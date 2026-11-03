// Read-only projection of EA ItemRender's UI path. Coordinates are native pixels,
// with bottom-left origin and y increasing upward; layers are back to front.
export function composeWeapon(build, assemblyData) {
  const unknowns = [], items = assemblyData?.items || {}, sprites = assemblyData?.sprites || {};
  const rules = assemblyData?.rules || {}, hiddenMask = (rules.hiddenSubItemMask ?? 3758096384) >>> 0;
  const iconMask = (rules.useItemIconTag ?? 536903680) >>> 0;
  const ancestors = new Set();
  let visited = 0;
  const unknown = (path, itemId, reason) => unknowns.push({path: [...path], itemId, reason});
  function layer(spriteId, x, y, path, itemId, normalIcon = null) {
    const sprite = normalIcon || sprites[spriteId];
    if (!sprite || typeof sprite.url !== 'string' || !Number.isFinite(sprite.width) || !Number.isFinite(sprite.height) || sprite.width <= 0 || sprite.height <= 0) {
      unknown(path, itemId, '原生预览图或尺寸待核实');
      return [];
    }
    return [{spriteId, url: sprite.url, x, y, width: sprite.width, height: sprite.height, path: [...path]}];
  }
  function render(node, x, y, path, entry = false) {
    if (!node || typeof node !== 'object' || ancestors.has(node) || ++visited > 4096) {
      unknown(path, node?.itemId, '装配树结构无法解析');
      return [];
    }
    const item = items[node.itemId];
    if (!item) { unknown(path, node.itemId, '原生槽位资料待核实'); return []; }
    if (!entry && ((item.accsMask >>> 0) & hiddenMask) !== 0) return [];
    if (entry && ((item.accsMask >>> 0) & iconMask) !== 0) {
      return layer(`${node.itemId}:normal`, 0, 0, path, node.itemId, item.normalIcon);
    }
    const offset = item.bodyOffset;
    if (!Array.isArray(offset) || offset.length !== 2 || !offset.every(Number.isFinite)) {
      unknown(path, node.itemId, '原生部件偏移待核实');
      return [];
    }
    ancestors.add(node);
    let result = item.sprite ? layer(item.sprite, x - offset[0], y - offset[1], path, node.itemId) : [];
    if (!item.sprite) unknown(path, node.itemId, '原生部件图未绑定');
    const children = new Map();
    for (const child of node.children || []) {
      if (Number.isInteger(child?.slotIndex)) children.set(child.slotIndex, child.node);
    }
    for (const slot of [...(item.slots || [])].sort((a, b) => a.index - b.index)) {
      if (!Array.isArray(slot.anchor) || slot.anchor.length !== 2 || !slot.anchor.every(Number.isFinite)) {
        unknown([...path, slot.index], node.itemId, '原生槽位坐标待核实');
        continue;
      }
      const child = children.get(slot.index), childPath = [...path, slot.index];
      const cx = x + slot.anchor[0] - offset[0], cy = y + slot.anchor[1] - offset[1];
      if (child) {
        const rendered = render(child, cx, cy, childPath);
        // Unity SetAsFirstSibling/LastSibling moves the entire child subtree.
        if ((items[child.itemId]?.layerOffset ?? 0) <= 0) result = [...rendered, ...result];
        else result.push(...rendered);
      } else if (slot.emptySprite) result.push(...layer(slot.emptySprite, cx, cy, childPath, node.itemId));
    }
    ancestors.delete(node);
    return result;
  }
  const layers = render(build, 0, 0, [], true);
  // Native Bounds starts at default(Vector3.zero), so it includes the origin.
  let left = 0, bottom = 0, right = 0, top = 0;
  for (const image of layers) {
    left = Math.min(left, image.x); bottom = Math.min(bottom, image.y);
    right = Math.max(right, image.x + image.width); top = Math.max(top, image.y + image.height);
  }
  return {layers, bounds: {x: left, y: bottom, width: right - left, height: top - bottom}, unknowns};
}
