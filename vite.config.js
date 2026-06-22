import { defineConfig } from 'vite'

/** Skip O(arrays) edge walks in calculateStatistics — ~1.5s saved on large snapshots. */
function patchHeapSnapshotPerf() {
  return {
    name: 'patch-heap-snapshot-perf',
    transform(code, id) {
      if (!id.includes('devtools-frontend/index.js')) return
      const needle = 'sizeJSArrays += this.calculateArraySize(node);'
      if (!code.includes(needle)) {
        this.warn('heap snapshot perf patch: target not found')
        return
      }
      return code.replace(needle, 'sizeJSArrays += nodeSize;')
    },
  }
}

export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  worker: {
    format: 'es',
  },
  plugins: [patchHeapSnapshotPerf()],
})
