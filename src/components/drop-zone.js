export function createDropZone({ onFile }) {
  const el = document.createElement('div')
  el.className = 'drop-zone'
  el.innerHTML = `
    <h1>Heap Snapshot Viewer</h1>
    <p>Drop a <code>.heapsnapshot</code> file here to analyze memory usage — summary tables, treemap, top objects, and retainer paths.</p>
    <button type="button" class="btn">Browse files</button>
    <input type="file" accept=".heapsnapshot,.heapsnapshot.gz" hidden />
  `

  const input = el.querySelector('input')
  const btn = el.querySelector('.btn')

  btn.addEventListener('click', () => input.click())

  input.addEventListener('change', () => {
    const file = input.files?.[0]
    if (file) onFile(file)
  })

  el.addEventListener('dragover', (e) => {
    e.preventDefault()
    el.classList.add('drag-over')
  })

  el.addEventListener('dragleave', () => {
    el.classList.remove('drag-over')
  })

  el.addEventListener('drop', (e) => {
    e.preventDefault()
    el.classList.remove('drag-over')
    const file = e.dataTransfer?.files?.[0]
    if (!file) return
    if (!file.name.endsWith('.heapsnapshot')) {
      alert('Please drop a .heapsnapshot file')
      return
    }
    onFile(file)
  })

  return el
}

export function createLoadingView(fileName, fileSize) {
  const el = document.createElement('div')
  el.className = 'loading-overlay'
  el.innerHTML = `
    <div class="spinner"></div>
    <div class="loading-phase">Parsing snapshot…</div>
    <div class="loading-file"></div>
  `

  const phaseEl = el.querySelector('.loading-phase')
  const fileEl = el.querySelector('.loading-file')
  fileEl.textContent = `${fileName} (${formatFileSize(fileSize)})`

  return {
    el,
    setPhase(message, percent) {
      phaseEl.textContent = percent != null ? `${message} (${percent}%)` : message
    },
  }
}

function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
