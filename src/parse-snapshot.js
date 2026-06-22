import { DevToolsAPI } from 'heap-snapshot-toolkit'

const { HeapSnapshotLoader, SecondaryInitManager } = DevToolsAPI

class ProgressDispatcher {
  constructor(onProgress) {
    this.onProgress = onProgress
  }

  sendEvent(name, data) {
    if (name !== 'ProgressUpdate' || !this.onProgress) return
    try {
      const { string, values } = JSON.parse(data)
      let message = string
      if (values) {
        for (const [key, val] of Object.entries(values)) {
          message = message.replace(`{${key}}`, String(val))
        }
      }
      const percent = values?.PH1 != null ? Number(values.PH1) : undefined
      this.onProgress({ message, percent })
    } catch {
      this.onProgress({ message: String(data) })
    }
  }
}

export async function parseSnapshot(readableStream, onProgress) {
  const dispatcher = onProgress ? new ProgressDispatcher(onProgress) : undefined
  const loader = new HeapSnapshotLoader.HeapSnapshotLoader(dispatcher)

  for await (const chunk of readableStream) {
    loader.write(chunk)
  }

  loader.close()
  await loader.parsingComplete

  const channel = new MessageChannel()
  try {
    new SecondaryInitManager(channel.port2)
    return await loader.buildSnapshot(channel.port1)
  } finally {
    channel.port1.close()
    channel.port2.close()
  }
}

const SLICE_BYTES = 32 * 1024 * 1024

/**
 * Stream a File as large UTF-8 text chunks.
 * Reads in slices (lower peak memory than file.arrayBuffer()) and avoids
 * the small-chunk overhead of TextDecoderStream on Blob.stream().
 */
export function fileToTextStream(file, onReadProgress) {
  const decoder = new TextDecoder()

  return new ReadableStream({
    async start(controller) {
      let offset = 0
      while (offset < file.size) {
        const slice = file.slice(offset, offset + SLICE_BYTES)
        const buffer = await slice.arrayBuffer()
        offset += buffer.byteLength
        onReadProgress?.(offset, file.size)
        controller.enqueue(
          decoder.decode(new Uint8Array(buffer), { stream: offset < file.size })
        )
      }
      controller.close()
    },
  })
}
