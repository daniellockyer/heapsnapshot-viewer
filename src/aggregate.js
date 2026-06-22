/** Build per-class aggregates without storing millions of node indexes. */
export function buildLightAggregates(snapshot) {
  const aggregates = new Map()
  const nodes = snapshot.nodes
  const nodesLength = nodes.length
  const nodeFieldCount = snapshot.nodeFieldCount
  const selfSizeOffset = snapshot.nodeSelfSizeOffset
  const nodeDistances = snapshot.nodeDistances
  const node = snapshot.createNode(0)

  for (let nodeIndex = 0; nodeIndex < nodesLength; nodeIndex += nodeFieldCount) {
    const selfSize = nodes.getValue(nodeIndex + selfSizeOffset)
    if (!selfSize) continue

    node.nodeIndex = nodeIndex
    const classKey = node.classKeyInternal()
    const nodeOrdinal = nodeIndex / nodeFieldCount
    const distance = nodeDistances[nodeOrdinal]

    let aggregate = aggregates.get(classKey)
    if (!aggregate) {
      aggregates.set(classKey, {
        count: 1,
        distance,
        self: selfSize,
        maxRet: 0,
        name: node.className(),
      })
    } else {
      aggregate.distance = Math.min(aggregate.distance, distance)
      aggregate.count++
      aggregate.self += selfSize
    }
  }

  snapshot.calculateClassesRetainedSize(aggregates, null)

  const result = []
  for (const [classKey, aggregate] of aggregates.entries()) {
    result.push({
      key: snapshot.classKeyFromClassKeyInternal(classKey),
      name: aggregate.name,
      count: aggregate.count,
      self: aggregate.self,
      maxRet: aggregate.maxRet,
      distance: aggregate.distance,
    })
  }

  return result
}
