import { DEFAULTS } from './flame-tree.js'

function frameName(node) {
  const name = node.name()
  const cls = node.className()
  if (name && cls && name !== cls) return `${name} · ${cls}`
  return name || cls || node.type()
}

function hasDominatedChildren(snapshot, nodeIndex) {
  const ordinal = nodeIndex / snapshot.nodeFieldCount
  return snapshot.firstDominatedNodeIndex[ordinal] < snapshot.firstDominatedNodeIndex[ordinal + 1]
}

function shortLabel(node, maxLen = 48) {
  const name = node.name()
  const cls = node.className()
  let label = frameName(node)
  if (name && name !== cls && name.length > maxLen) {
    label = `${name.slice(0, maxLen - 1)}… · ${cls}`
  }
  return label
}

export function findTopNodesForClass(snapshot, className, limit = DEFAULTS.classTopInstances) {
  const top = []
  const probe = snapshot.createNode(0)
  const nodeFieldCount = snapshot.nodeFieldCount

  for (let nodeIndex = 0; nodeIndex < snapshot.nodes.length; nodeIndex += nodeFieldCount) {
    probe.nodeIndex = nodeIndex
    if (probe.className() !== className) continue
    const retained = probe.retainedSize()
    if (retained === 0) continue

    if (top.length < limit) {
      top.push({ nodeIndex, retained })
      continue
    }

    let minIdx = 0
    for (let i = 1; i < top.length; i++) {
      if (top[i].retained < top[minIdx].retained) minIdx = i
    }
    if (retained > top[minIdx].retained) {
      top[minIdx] = { nodeIndex, retained }
    }
  }

  return top.sort((a, b) => b.retained - a.retained)
}

export function findTopNodeForClass(snapshot, className) {
  const top = findTopNodesForClass(snapshot, className, 1)
  return top[0]?.nodeIndex ?? -1
}

/** One heap scan to find top instances for multiple class names. */
function indexTopInstancesPerClass(snapshot, classNames, limitPerClass) {
  const nameSet = new Set(classNames)
  const heaps = new Map()
  const probe = snapshot.createNode(0)
  const nodeFieldCount = snapshot.nodeFieldCount

  for (let nodeIndex = 0; nodeIndex < snapshot.nodes.length; nodeIndex += nodeFieldCount) {
    probe.nodeIndex = nodeIndex
    const className = probe.className()
    if (!nameSet.has(className)) continue

    const retained = probe.retainedSize()
    if (retained === 0) continue

    let top = heaps.get(className)
    if (!top) {
      top = []
      heaps.set(className, top)
    }

    if (top.length < limitPerClass) {
      top.push({ nodeIndex, retained })
      continue
    }

    let minIdx = 0
    for (let i = 1; i < top.length; i++) {
      if (top[i].retained < top[minIdx].retained) minIdx = i
    }
    if (retained > top[minIdx].retained) {
      top[minIdx] = { nodeIndex, retained }
    }
  }

  for (const [key, list] of heaps) {
    heaps.set(key, list.sort((a, b) => b.retained - a.retained))
  }

  return heaps
}

function instanceFramesForClass(snapshot, instances, classRetained) {
  const frames = instances.map(({ nodeIndex, retained }) => {
    const node = snapshot.createNode(nodeIndex)
    const subtree = buildDominatorSubtree(snapshot, nodeIndex, 0, DEFAULTS.rootSubtreeLevels)
    return {
      ...subtree,
      name: shortLabel(node),
      fullName: frameName(node),
      value: retained,
      nodeIndex,
      hasChildren: true,
    }
  })

  const shown = frames.reduce((sum, f) => sum + f.value, 0)
  const other = classRetained - shown
  if (other > 0) {
    frames.push({
      mode: 'retained',
      name: 'Other',
      value: other,
      hasChildren: false,
      children: [],
    })
  }

  return frames
}

/** Multi-level flame from summary constructors, expanding the largest classes. */
export function buildRootFlame(snapshot, aggregates, totalRetained) {
  const sorted = [...aggregates].sort((a, b) => b.maxRet - a.maxRet)
  const top = sorted.slice(0, DEFAULTS.topClasses)
  const expandRows = top.slice(0, DEFAULTS.rootExpandClasses)
  const instancesByClass = indexTopInstancesPerClass(
    snapshot,
    expandRows.map((row) => row.name),
    DEFAULTS.rootInstancesPerClass
  )

  const children = top.map((row, index) => {
    const base = {
      mode: 'summary',
      name: row.name,
      value: row.maxRet,
      className: row.name,
      classKey: row.key,
      hasChildren: true,
      children: [],
    }

    if (index >= DEFAULTS.rootExpandClasses) return base

    const instances = instancesByClass.get(row.name) ?? []
    if (instances.length === 0) return base

    base.children = instanceFramesForClass(snapshot, instances, row.maxRet)
    return base
  })

  const other = sorted.slice(DEFAULTS.topClasses).reduce((sum, row) => sum + row.maxRet, 0)
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

/** Show the largest individual instances of a class side-by-side. */
export function buildClassFlame(snapshot, className, classRetainedTotal, levelsLeft = DEFAULTS.expandLevels) {
  const instances = findTopNodesForClass(snapshot, className)

  const children = instances.map(({ nodeIndex, retained }) => {
    const node = snapshot.createNode(nodeIndex)
    const subtree = buildDominatorSubtree(snapshot, nodeIndex, 0, Math.max(1, levelsLeft - 1))
    return {
      ...subtree,
      name: shortLabel(node),
      fullName: frameName(node),
      value: retained,
      nodeIndex,
      hasChildren: true,
    }
  })

  const shownTotal = children.reduce((sum, c) => sum + c.value, 0)
  const total = classRetainedTotal || shownTotal
  const other = total - shownTotal

  if (other > 0) {
    children.push({
      mode: 'retained',
      name: 'Other',
      value: other,
      hasChildren: false,
      children: [],
    })
  }

  return {
    mode: 'retained',
    name: className,
    value: total,
    hasChildren: children.length > 0,
    children,
  }
}
function groupDominatedChildren(snapshot, nodeIndex) {
  const ordinal = nodeIndex / snapshot.nodeFieldCount
  const from = snapshot.firstDominatedNodeIndex[ordinal]
  const to = snapshot.firstDominatedNodeIndex[ordinal + 1]
  const groups = new Map()

  for (let i = from; i < to; i++) {
    const childIndex = snapshot.dominatedNodes[i]
    const child = snapshot.createNode(childIndex)
    const childRet = child.retainedSize()
    if (childRet === 0) continue

    const key = child.className() || child.type()
    let group = groups.get(key)
    if (!group) {
      group = { name: key, value: 0, nodeIndex: childIndex, bestRet: 0 }
      groups.set(key, group)
    }
    group.value += childRet
    if (childRet >= group.bestRet) {
      group.bestRet = childRet
      group.nodeIndex = childIndex
    }
  }

  let children = [...groups.values()].sort((a, b) => b.value - a.value)

  let otherValue = 0
  if (children.length > DEFAULTS.maxChildren) {
    otherValue = children.slice(DEFAULTS.maxChildren).reduce((sum, c) => sum + c.value, 0)
    children = children.slice(0, DEFAULTS.maxChildren)
  }

  return { children, otherValue }
}

function buildGroupedLevel(snapshot, nodeIndex, depth, levelsLeft) {
  const { children, otherValue } = groupDominatedChildren(snapshot, nodeIndex)

  const childFrames = children.map((c, i) => {
    const canExpand =
      levelsLeft > 1 &&
      i < DEFAULTS.maxExpandChildren &&
      c.nodeIndex != null &&
      hasDominatedChildren(snapshot, c.nodeIndex)

    const frame = {
      mode: 'retained',
      name: c.name,
      value: c.value,
      nodeIndex: c.nodeIndex,
      className: c.name,
      hasChildren: canExpand || hasDominatedChildren(snapshot, c.nodeIndex),
      children: [],
    }

    if (canExpand) {
      frame.children = buildGroupedLevel(snapshot, c.nodeIndex, depth + 1, levelsLeft - 1)
      frame.hasChildren = frame.children.length > 0 || hasDominatedChildren(snapshot, c.nodeIndex)
    }

    return frame
  })

  if (otherValue > 0) {
    childFrames.push({
      mode: 'retained',
      name: 'Other',
      value: otherValue,
      hasChildren: false,
      children: [],
    })
  }

  return childFrames
}

/** Build dominator subtree with multiple expanded levels. */
export function buildDominatorSubtree(snapshot, nodeIndex, depth = 0, levelsLeft = DEFAULTS.expandLevels) {
  const node = snapshot.createNode(nodeIndex)
  const self = node.selfSize()
  const retained = node.retainedSize()
  const ordinal = nodeIndex / snapshot.nodeFieldCount
  const from = snapshot.firstDominatedNodeIndex[ordinal]
  const to = snapshot.firstDominatedNodeIndex[ordinal + 1]

  if (depth >= DEFAULTS.maxDepth || from >= to || levelsLeft < 1) {
    return {
      mode: 'retained',
      name: frameName(node),
      value: self || retained,
      nodeIndex,
      hasChildren: from < to,
      children: [],
    }
  }

  const childFrames = buildGroupedLevel(snapshot, nodeIndex, depth + 1, levelsLeft - 1)
  const childTotal = childFrames.reduce((sum, c) => sum + c.value, 0)

  return {
    mode: 'retained',
    name: frameName(node),
    value: Math.max(self, childTotal, retained),
    nodeIndex,
    hasChildren: childFrames.length > 0,
    children: childFrames,
  }
}

function allocLabel(entry) {
  const loc = entry.line > 0 ? `:${entry.line}` : ''
  const script = entry.scriptName ? ` (${entry.scriptName}${loc})` : ''
  return `${entry.name}${script}`
}

function expandAllocationBranch(snapshot, entry, levelsLeft) {
  const frame = {
    mode: 'allocation',
    name: allocLabel(entry),
    value: entry.liveSize,
    allocId: entry.id,
    hasChildren: entry.hasChildren,
    children: [],
  }

  if (!entry.hasChildren || levelsLeft < 2) return frame

  const callers = snapshot.allocationNodeCallers(entry.id)
  const branches = callers.branchingCallers ?? []
  frame.children = branches
    .slice(0, DEFAULTS.maxExpandChildren)
    .map((row) => expandAllocationBranch(snapshot, row, levelsLeft - 1))
  frame.hasChildren = frame.children.length > 0 || entry.hasChildren

  return frame
}

export function buildAllocationFlame(snapshot) {
  const tops = snapshot.allocationTracesTops()
  if (!tops?.length) return null

  const total = tops.reduce((sum, row) => sum + row.liveSize, 0)
  const children = tops
    .slice(0, DEFAULTS.topClasses)
    .map((row) => expandAllocationBranch(snapshot, row, DEFAULTS.expandLevels))

  return {
    mode: 'allocation',
    name: 'Allocation stacks',
    value: total,
    hasChildren: true,
    children,
  }
}

export function expandAllocationNode(snapshot, allocId) {
  const callers = snapshot.allocationNodeCallers(allocId)
  const chain = callers.nodesWithSingleCaller ?? []
  const branches = callers.branchingCallers ?? []

  const root = chain.length > 0 ? chain[chain.length - 1] : branches[0]
  if (!root) {
    return { mode: 'allocation', name: 'Unknown', value: 0, hasChildren: false, children: [] }
  }

  const frame = expandAllocationBranch(snapshot, root, DEFAULTS.expandLevels)
  if (chain.length > 1) {
    frame.name = allocLabel(chain[chain.length - 1])
  }

  return frame
}
