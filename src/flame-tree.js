import { chartCellLightness } from './theme.js'

const DEFAULTS = {
  maxDepth: 12,
  expandLevels: 4,
  maxChildren: 20,
  maxExpandChildren: 8,
  classTopInstances: 12,
  topClasses: 24,
  rootExpandClasses: 6,
  rootInstancesPerClass: 4,
  rootSubtreeLevels: 3,
}

/** Build top-level flame from summary aggregates (fast, no extra scan). */
export function aggregatesToFlame(aggregates, totalRetained) {
  const sorted = [...aggregates].sort((a, b) => b.maxRet - a.maxRet)
  const top = sorted.slice(0, DEFAULTS.topClasses)
  const other = sorted.slice(DEFAULTS.topClasses).reduce((sum, row) => sum + row.maxRet, 0)

  const children = top.map((row) => ({
    name: row.name,
    value: row.maxRet,
    className: row.name,
    classKey: row.key,
    hasChildren: true,
    children: [],
  }))

  if (other > 0) {
    children.push({
      name: 'Other',
      value: other,
      hasChildren: false,
      children: [],
    })
  }

  return {
    mode: 'summary',
    name: 'Retained heap',
    value: totalRetained,
    hasChildren: true,
    children,
  }
}

/** Layout icicle/flame rects: root at top, children below. */
export function layoutIcicle(root, width, rowHeight) {
  const rects = []

  function walk(node, x, y, w, depth) {
    rects.push({
      x,
      y,
      width: w,
      height: rowHeight,
      depth,
      node,
    })

    if (!node.children?.length || w < 2) return

    const total = node.children.reduce((sum, c) => sum + c.value, 0) || 1
    let cx = x
    for (const child of node.children) {
      const cw = Math.max((w * child.value) / total, w < 120 ? 0 : 1)
      if (cw > 0) {
        walk(child, cx, y + rowHeight, cw, depth + 1)
        cx += cw
      }
    }
  }

  walk(root, 0, 0, width, 0)
  return rects
}

export function flameColor(depth, name) {
  if (name === 'Other') {
    return `hsl(0, 0%, ${chartCellLightness(0)}%)`
  }
  const hue = (depth * 47 + name.length * 13) % 360
  return `hsl(${hue}, 50%, ${chartCellLightness(depth + 2)}%)`
}

export { DEFAULTS }
