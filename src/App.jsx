import { useEffect, useRef, useState } from 'react'
import JSZip from 'jszip'
import {
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  CloudUpload,
  FileImage,
  ImagePlus,
  LoaderCircle,
  LockKeyhole,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import './App.css'

const acceptedTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
const maxFileSize = 50 * 1024 * 1024
const extensionTypes = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}
const extensions = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '—'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`
}

function getMimeType(file) {
  if (acceptedTypes.has(file.type)) return file.type
  const extension = file.name.split('.').pop()?.toLowerCase()
  return extensionTypes[extension] || ''
}

function makeFilename(name, mimeType) {
  const baseName = name.replace(/\.[^.]+$/, '')
  return `${baseName}-compressed.${extensions[mimeType] || 'webp'}`
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function App() {
  const [items, setItems] = useState([])
  const [quality, setQuality] = useState(78)
  const [outputFormat, setOutputFormat] = useState('image/webp')
  const [dropActive, setDropActive] = useState(false)
  const [notice, setNotice] = useState('')
  const [zipping, setZipping] = useState(false)
  const fileInputRef = useRef(null)
  const compressionRun = useRef(0)
  const activeCompressionJobs = useRef(new Map())
  const settingsKey = `${quality}:${outputFormat}`
  const previousSettingsKey = useRef(settingsKey)

  useEffect(() => {
    if (previousSettingsKey.current !== settingsKey) {
      previousSettingsKey.current = settingsKey
      compressionRun.current += 1
    }
    const runId = compressionRun.current
    const pendingItems = items.filter((item) => (
      item.settingsKey !== settingsKey
      && activeCompressionJobs.current.get(`${item.id}:${settingsKey}`) !== runId
    ))
    if (pendingItems.length === 0) return

    pendingItems.forEach((item) => activeCompressionJobs.current.set(`${item.id}:${settingsKey}`, runId))

    Promise.all(pendingItems.map(async (item) => {
      try {
        const image = await createImageBitmap(item.file)
        const canvas = document.createElement('canvas')
        canvas.width = image.width
        canvas.height = image.height
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Could not prepare this image.')

        const mimeType = outputFormat === 'original' ? item.mimeType : outputFormat
        if (mimeType === 'image/jpeg') {
          context.fillStyle = '#ffffff'
          context.fillRect(0, 0, canvas.width, canvas.height)
        }
        context.drawImage(image, 0, 0)
        image.close()

        const blob = await new Promise((resolve, reject) => {
          canvas.toBlob(
            (result) => result ? resolve(result) : reject(new Error('The browser could not encode this image.')),
            mimeType,
            quality / 100,
          )
        })
        if (blob.type !== mimeType) {
          throw new Error(`This browser cannot export ${mimeType.replace('image/', '').toUpperCase()}.`)
        }
        return { id: item.id, blob, width: image.width, height: image.height, mimeType }
      } catch (error) {
        return { id: item.id, error: error.message || 'This image could not be compressed.' }
      }
    })).then((results) => {
      if (runId !== compressionRun.current) return
      const resultsById = new Map(results.map((result) => [result.id, result]))
      setItems((currentItems) => currentItems.map((item) => {
        const result = resultsById.get(item.id)
        if (!result) return item
        if (item.compressedUrl) URL.revokeObjectURL(item.compressedUrl)
        if (result.error) {
          return { ...item, settingsKey, status: 'error', compressedBlob: null, compressedUrl: '', error: result.error }
        }
        return {
          ...item,
          settingsKey,
          status: 'complete',
          compressedBlob: result.blob,
          compressedUrl: URL.createObjectURL(result.blob),
          compressedSize: result.blob.size,
          width: result.width,
          height: result.height,
          outputMimeType: result.mimeType,
          error: '',
        }
      }))
    }).finally(() => {
      pendingItems.forEach((item) => {
        const jobKey = `${item.id}:${settingsKey}`
        if (activeCompressionJobs.current.get(jobKey) === runId) activeCompressionJobs.current.delete(jobKey)
      })
    })
  }, [items, outputFormat, quality, settingsKey])

  function addFiles(fileList) {
    const files = Array.from(fileList)
    const supportedFiles = files.filter((file) => acceptedTypes.has(getMimeType(file)))
    const validFiles = supportedFiles.filter((file) => file.size <= maxFileSize)
    const messages = []
    if (supportedFiles.length !== files.length) messages.push('Unsupported files were skipped; use JPEG, PNG, or WebP.')
    if (validFiles.length !== supportedFiles.length) messages.push('Images must be 50 MB or smaller.')
    setNotice(messages.join(' '))
    if (validFiles.length === 0) return

    setItems((currentItems) => [
      ...currentItems,
      ...validFiles.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        mimeType: getMimeType(file),
        previewUrl: URL.createObjectURL(file),
        compressedUrl: '',
        compressedBlob: null,
        compressedSize: 0,
        status: 'queued',
        settingsKey: '',
        error: '',
      })),
    ])
  }

  function removeItem(id) {
    setItems((currentItems) => {
      const removed = currentItems.find((item) => item.id === id)
      if (removed) {
        URL.revokeObjectURL(removed.previewUrl)
        if (removed.compressedUrl) URL.revokeObjectURL(removed.compressedUrl)
      }
      return currentItems.filter((item) => item.id !== id)
    })
  }

  function clearItems() {
    items.forEach((item) => {
      URL.revokeObjectURL(item.previewUrl)
      if (item.compressedUrl) URL.revokeObjectURL(item.compressedUrl)
    })
    setItems([])
    setNotice('')
  }

  function downloadItem(item) {
    if (!item.compressedBlob) return
    downloadBlob(item.compressedBlob, makeFilename(item.file.name, item.outputMimeType))
  }

  async function downloadAll() {
    const readyItems = items.filter((item) => item.settingsKey === settingsKey && item.status === 'complete' && item.compressedBlob)
    if (readyItems.length === 0) return
    setZipping(true)
    try {
      const archive = new JSZip()
      readyItems.forEach((item) => {
        archive.file(makeFilename(item.file.name, item.outputMimeType), item.compressedBlob)
      })
      const blob = await archive.generateAsync({ type: 'blob' })
      downloadBlob(blob, 'iamge-compresser.zip')
    } catch {
      setNotice('The archive could not be created. Download images individually instead.')
    } finally {
      setZipping(false)
    }
  }

  function handleDrop(event) {
    event.preventDefault()
    setDropActive(false)
    addFiles(event.dataTransfer.files)
  }

  const readyItems = items.filter((item) => item.settingsKey === settingsKey && item.status === 'complete' && item.compressedBlob)
  const totalOriginalSize = items.reduce((sum, item) => sum + item.file.size, 0)
  const readyOriginalSize = readyItems.reduce((sum, item) => sum + item.file.size, 0)
  const totalCompressedSize = readyItems.reduce((sum, item) => sum + item.compressedSize, 0)
  const totalSavings = readyOriginalSize - totalCompressedSize
  const totalSavingsPercent = readyOriginalSize > 0 ? Math.round((totalSavings / readyOriginalSize) * 100) : 0
  const isProcessing = items.some((item) => item.settingsKey !== settingsKey || item.status === 'compressing' || item.status === 'queued')

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="iamge compresser home">
          <span className="brand-mark"><FileImage size={19} strokeWidth={2.2} /></span>
          <span>iamge <strong>compresser</strong></span>
        </a>
        <div className="local-note"><LockKeyhole size={14} /> Images stay on this device</div>
      </header>

      <main id="top" className="workspace">
        <section className="intro">
          <div className="eyebrow"><span className="eyebrow-dot" /> IMAGE WORKSPACE</div>
          <div className="intro-row">
            <div>
              <h1>Less weight.<br /><span>Same picture.</span></h1>
              <p className="intro-copy">A lighter image is only a few clicks away.</p>
            </div>
            <div className="intro-stamp" aria-hidden="true">
              <Sparkles size={19} />
              <span>QUICK<br />& LOCAL</span>
            </div>
          </div>
        </section>

        <section className="workbench" aria-label="Image compression workspace">
          <div className="panel-heading">
            <div className="panel-title">
              <span className="step-number">01</span>
              <div>
                <h2>Your images</h2>
                <p>JPEG, PNG, or WebP</p>
              </div>
            </div>
            {items.length > 0 && (
              <button className="text-button" type="button" onClick={clearItems}>
                <Trash2 size={15} /> Clear all
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <button
              className={`dropzone${dropActive ? ' dropzone-active' : ''}`}
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(event) => { event.preventDefault(); setDropActive(true) }}
              onDragLeave={() => setDropActive(false)}
              onDrop={handleDrop}
              aria-label="Choose or drop images to compress"
            >
              <span className="upload-icon"><CloudUpload size={25} strokeWidth={1.7} /></span>
              <span className="drop-title">Drop images here</span>
              <span className="drop-subtitle">or <span className="browse-link">browse files</span> from your device</span>
              <span className="drop-footnote">UP TO 50 MB PER IMAGE</span>
            </button>
          ) : (
            <div
              className={`image-list${dropActive ? ' list-drop-active' : ''}`}
              onDragOver={(event) => { event.preventDefault(); setDropActive(true) }}
              onDragLeave={() => setDropActive(false)}
              onDrop={handleDrop}
            >
              {items.map((item) => {
                const itemStatus = item.settingsKey === settingsKey ? item.status : 'compressing'
                const savings = item.compressedBlob ? item.file.size - item.compressedSize : 0
                const percent = item.compressedBlob ? Math.round((savings / item.file.size) * 100) : 0
                return (
                  <article className="image-row" key={item.id}>
                    <div className="image-thumb">
                      <img src={item.compressedUrl || item.previewUrl} alt={`Preview of ${item.file.name}`} />
                    </div>
                    <div className="image-info">
                      <div className="image-name-line">
                        <span className="image-name" title={item.file.name}>{item.file.name}</span>
                        <span className={`status status-${itemStatus}`}>
                          {itemStatus === 'complete' && <><Check size={12} /> READY</>}
                          {itemStatus === 'compressing' && <><LoaderCircle className="spin" size={12} /> WORKING</>}
                          {itemStatus === 'queued' && 'QUEUED'}
                          {itemStatus === 'error' && 'ERROR'}
                        </span>
                      </div>
                      <div className="image-meta">
                        <span>{item.width ? `${item.width} x ${item.height} px` : formatBytes(item.file.size)}</span>
                        <span className="meta-separator" />
                        <span>{item.mimeType.replace('image/', '').toUpperCase()}</span>
                        {itemStatus === 'complete' && (
                          <span className={`saving-pill${percent < 0 ? ' saving-larger' : ''}`}>
                            {percent >= 0 ? `${percent}% smaller` : `${Math.abs(percent)}% larger`}
                          </span>
                        )}
                        {itemStatus === 'error' && <span className="error-copy">{item.error}</span>}
                      </div>
                      <div className="size-track" aria-label={itemStatus === 'complete' ? `${formatBytes(item.file.size)} original, ${formatBytes(item.compressedSize)} compressed` : 'Compression pending'}>
                        <span className="size-original">{formatBytes(item.file.size)}</span>
                        <ArrowUpRight size={13} />
                        <span className={itemStatus === 'complete' ? 'size-result' : 'size-pending'}>
                          {itemStatus === 'complete' ? formatBytes(item.compressedSize) : 'Compressing...'}
                        </span>
                      </div>
                    </div>
                    <div className="image-actions">
                      <button
                        className="icon-button"
                        type="button"
                        onClick={() => downloadItem(item)}
                        disabled={itemStatus !== 'complete'}
                        aria-label={`Download compressed ${item.file.name}`}
                        title="Download image"
                      >
                        <ArrowDownToLine size={17} />
                      </button>
                      <button
                        className="icon-button remove-button"
                        type="button"
                        onClick={() => removeItem(item.id)}
                        aria-label={`Remove ${item.file.name}`}
                        title="Remove image"
                      >
                        <X size={17} />
                      </button>
                    </div>
                  </article>
                )
              })}
              <button className="add-more" type="button" onClick={() => fileInputRef.current?.click()}>
                <ImagePlus size={16} /> Add more images
                <span>or drop them anywhere in this list</span>
              </button>
            </div>
          )}

          <input
            ref={fileInputRef}
            className="visually-hidden"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={(event) => { addFiles(event.target.files); event.target.value = '' }}
          />

          {notice && <div className="notice" role="status">{notice}</div>}

          <div className="settings-divider" />
          <div className="panel-heading settings-heading">
            <div className="panel-title">
              <span className="step-number">02</span>
              <div>
                <h2>Compression</h2>
                <p>Fine-tune the final file</p>
              </div>
            </div>
          </div>

          <div className="settings-grid">
            <div className="quality-control">
              <div className="control-label-row">
                <label htmlFor="quality">Quality</label>
                <output htmlFor="quality">{quality}%</output>
              </div>
              <input
                id="quality"
                className="quality-slider"
                type="range"
                min="20"
                max="95"
                step="1"
                value={quality}
                onChange={(event) => setQuality(Number(event.target.value))}
                aria-describedby="quality-hint"
              />
              <div className="slider-labels"><span>Smaller file</span><span>Sharper image</span></div>
              <span id="quality-hint" className="visually-hidden">Higher quality usually creates a larger file.</span>
            </div>
            <div className="format-control">
              <label htmlFor="format">Output format</label>
              <div className="select-wrap">
                <select id="format" value={outputFormat} onChange={(event) => setOutputFormat(event.target.value)}>
                  <option value="image/webp">WebP</option>
                  <option value="image/jpeg">JPEG</option>
                  <option value="image/png">PNG</option>
                  <option value="original">Keep original</option>
                </select>
                <span className="select-chevron" aria-hidden="true">⌄</span>
              </div>
              <span className="format-hint">{outputFormat === 'image/png' ? 'Lossless format; quality setting is ignored.' : 'Conversion happens locally in your browser.'}</span>
            </div>
          </div>

          {items.length > 0 && (
            <div className="results-bar">
              <div className="results-total">
                <span className="results-label">TOTAL SIZE</span>
                <div>
                  <span>{formatBytes(totalOriginalSize)}</span>
                  <ArrowUpRight size={14} />
                  <strong>{readyItems.length === items.length ? formatBytes(totalCompressedSize) : '...'}</strong>
                </div>
              </div>
              <div className="results-savings">
                <span className="savings-spark"><Sparkles size={15} /></span>
                <div>
                  <strong>{readyItems.length === 0 ? '—' : `${Math.abs(totalSavingsPercent)}%`}</strong>
                  <span>{totalSavingsPercent < 0 ? 'larger total' : 'saved so far'}</span>
                </div>
              </div>
              <button
                className="download-all"
                type="button"
                onClick={downloadAll}
                disabled={readyItems.length === 0 || isProcessing || zipping}
              >
                {zipping ? <LoaderCircle className="spin" size={16} /> : <ArrowDownToLine size={16} />}
                {zipping ? 'Preparing...' : 'Download all'}
              </button>
            </div>
          )}
        </section>

        <footer className="workspace-footer">
          <span><LockKeyhole size={13} /> Private by design. Files never leave your browser.</span>
          <span>JPEG / PNG / WEBP</span>
        </footer>
      </main>
      <div className="sr-only" aria-live="polite">{items.length} images loaded. {readyItems.length} compressed.</div>
    </div>
  )
}

export default App
