import { parseSnapshot, fileToTextStream } from './parse-snapshot.js'
import { buildLightAggregates } from './aggregate.js'
import {
  buildDominatorSubtree,
  buildAllocationFlame,
  expandAllocationNode,
  buildClassFlame,
  buildRootFlame,
} from './flame-build.js'

/** @type {import('heap-snapshot-toolkit').JSHeapSnapshot | null} */
let snapshot = null
let hasAllocationTraces = false

function serializeNode(node) {
  return {
    nodeIndex: node.nodeIndex,
    type: node.type(),
    name: node.name(),
    id: node.id(),
    selfSize: node.selfSize(),
    retainedSize: node.retainedSize(),
    distance: node.distance(),
    detached: node.detachedness() === 2,
    className: node.className(),
  }
}

function buildRetainerPath(nodeIndex) {
  if (!snapshot) return []

  const path = []
  let currentIndex = nodeIndex
  const visited = new Set()

  while (currentIndex !== snapshot.rootNodeIndex) {
    if (visited.has(currentIndex)) break
    visited.add(currentIndex)

    const node = snapshot.createNode(currentIndex)
    const retainers = []

    for (const it = node.retainers(); it.hasNext(); it.next()) {
      const edge = it.item()
      if (edge.type() === 'weak') continue

      const retainerNode = edge.node()
      retainers.push({
        edgeType: edge.type(),
        edgeName: edge.name(),
        nodeIndex: retainerNode.nodeIndex,
        distance: retainerNode.distance(),
      })
    }

    if (retainers.length === 0) {
      path.unshift({
        ...serializeNode(node),
        edgeType: null,
        edgeName: null,
      })
      break
    }

    retainers.sort((a, b) => a.distance - b.distance)
    const best = retainers[0]

    path.unshift({
      ...serializeNode(node),
      edgeType: best.edgeType,
      edgeName: best.edgeName,
    })

    currentIndex = best.nodeIndex
  }

  return path
}

function getTopObjects(limit = 100) {
  if (!snapshot) return []

  const top = []

  for (const it = snapshot.allNodes(); it.hasNext(); it.next()) {
    const node = it.item()
    const selfSize = node.selfSize()
    if (selfSize === 0) continue

    top.push(serializeNode(node))

    if (top.length > limit * 2) {
      top.sort((a, b) => b.selfSize - a.selfSize)
      top.length = limit
    }
  }

  top.sort((a, b) => b.selfSize - a.selfSize)
  return top.slice(0, limit)
}

function searchNodes(query) {
  if (!snapshot || !query.trim()) return []

  const trimmed = query.trim()
  const results = []

  const idMatch = trimmed.match(/^@?(\d+)$/)
  if (idMatch) {
    const id = parseInt(idMatch[1], 10)
    for (const it = snapshot.allNodes(); it.hasNext(); it.next()) {
      if (it.item().id() === id) {
        results.push(serializeNode(it.item()))
        break
      }
    }
    return results
  }

  const lower = trimmed.toLowerCase()
  for (const it = snapshot.allNodes(); it.hasNext(); it.next()) {
    const node = it.item()
    const name = node.name().toLowerCase()
    const className = node.className().toLowerCase()
    if (name.includes(lower) || className.includes(lower)) {
      results.push(serializeNode(node))
      if (results.length >= 200) break
    }
  }

  return results
}

function postProgress(payload) {
  self.postMessage({ type: 'progress', ...payload })
}

self.onmessage = async (event) => {
  const { type, ...data } = event.data

  try {
    if (type === 'parse') {
      const { file } = data
      snapshot = null
      hasAllocationTraces = false

      postProgress({ message: 'Reading file…' })
      const start = performance.now()

      const stream = fileToTextStream(file, (loaded, total) => {
        const percent = Math.round((loaded / total) * 100)
        postProgress({ message: 'Reading file…', percent })
      })
      snapshot = await parseSnapshot(stream, ({ message, percent }) => {
        postProgress({ message, percent })
      })

      hasAllocationTraces = (snapshot.profile?.snapshot?.trace_function_count ?? 0) > 0

      postProgress({ message: 'Building summary…' })

      const stats = snapshot.getStatistics()
      const staticData = snapshot.updateStaticData()
      const aggregateList = buildLightAggregates(snapshot)

      postProgress({ message: 'Building flamegraph…' })
      const flameTree = hasAllocationTraces
        ? buildAllocationFlame(snapshot)
        : buildRootFlame(snapshot, aggregateList, stats.total)

      const parseDuration = performance.now() - start

      self.postMessage({
        type: 'ready',
        stats,
        staticData: {
          nodeCount: staticData.nodeCount,
          rootNodeIndex: staticData.rootNodeIndex,
          totalSize: staticData.totalSize,
        },
        aggregates: aggregateList,
        flameTree,
        hasAllocationTraces,
        parseDuration,
      })
    } else if (type === 'flameSubtree') {
      let tree
      if (data.mode === 'allocation' && data.allocId != null) {
        tree = expandAllocationNode(snapshot, data.allocId)
      } else if (data.nodeIndex != null) {
        tree = buildDominatorSubtree(snapshot, data.nodeIndex)
      } else if (data.className) {
        tree = buildClassFlame(snapshot, data.className, data.classRetained)
      } else {
        tree = hasAllocationTraces
          ? buildAllocationFlame(snapshot)
          : buildRootFlame(snapshot, data.aggregates ?? [], data.totalRetained ?? 0)
      }
      self.postMessage({ type: 'flameSubtree', requestId: data.requestId, tree })
    } else if (type === 'nodeDetail') {
      const node = snapshot?.createNode(data.nodeIndex)
      if (!node) {
        self.postMessage({ type: 'nodeDetail', requestId: data.requestId, node: null })
        return
      }
      self.postMessage({
        type: 'nodeDetail',
        requestId: data.requestId,
        node: serializeNode(node),
      })
    } else if (type === 'retainers') {
      const path = buildRetainerPath(data.nodeIndex)
      self.postMessage({
        type: 'retainers',
        requestId: data.requestId,
        path,
      })
    } else if (type === 'topObjects') {
      const objects = getTopObjects(data.limit ?? 100)
      self.postMessage({
        type: 'topObjects',
        requestId: data.requestId,
        objects,
      })
    } else if (type === 'search') {
      const results = searchNodes(data.query)
      self.postMessage({
        type: 'search',
        requestId: data.requestId,
        results,
      })
    }
  } catch (err) {
    self.postMessage({
      type: 'error',
      message: err?.message ?? String(err),
    })
  }
}
