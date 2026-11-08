// ============================================================
// VoxLector AI — Document Parser Service
// High-fidelity layout reconstruction for PDF (preserving lines,
// paragraphs, dialogues, and formatting), EPUB, DOCX, FB2, and TXT
// ============================================================

import type { BookFormat, ParsedSentence, DetectedCharacter } from '@/types';
import { DOMParser as XmlDOMParser } from '@xmldom/xmldom';
import {
  detectCharactersAndParse,
  getCharacterId,
  isValidCharacterName,
  type DialogueContext,
} from './characterDetector';
import { dbService } from './dbService'
import { ProsodyEngine } from './ProsodyEngine'
import { hasPdfExtractionArtifacts, isPdfNumericArtifactText, normalizePdfRepeatedGlyphs } from './pdfTextUtils'
import { extractRtfText } from './rtfParser'

const prosodyEngine = new ProsodyEngine()

export interface ParseResult {
  sentences: ParsedSentence[];
  characters: DetectedCharacter[];
  pages: number[][];
  totalPages: number;
  title: string;
  author: string;
  format: BookFormat;
  sourceData?: ArrayBuffer;
  coverImage?: string;
}

export type ParseSummary = Pick<ParseResult, 'characters' | 'totalPages' | 'title' | 'author' | 'format' | 'coverImage'>

export function parseDocumentInWorker(
  file: File,
  bookId: string,
  onProgress?: (percent: number, current: number, total: number) => void,
  signal?: AbortSignal,
): Promise<ParseSummary> {
  const coverPromise = createDocumentCover(file).catch(error => {
    console.warn('[VoxLector] No se pudo extraer la portada del documento:', error)
    return undefined
  })
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./documentWorker.ts', import.meta.url), { type: 'module' })
    let timeoutId: number
    let settled = false
    let abortHandler: (() => void) | undefined

    const cleanup = () => {
      window.clearTimeout(timeoutId)
      worker.terminate()
      worker.onmessage = null
      worker.onerror = null
      worker.onmessageerror = null
      if (abortHandler) signal?.removeEventListener('abort', abortHandler)
    }
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      cleanup()
      callback()
    }
    const resetTimeout = () => {
      window.clearTimeout(timeoutId)
      timeoutId = window.setTimeout(() => {
        finish(() => reject(new Error('No se pudo procesar la estructura de este documento: el análisis superó el tiempo de espera.')))
      }, 120_000)
    }

    worker.onmessage = (event: MessageEvent<
      | { type: 'progress'; percent: number; current: number; total: number }
      | { type: 'result'; result: ParseSummary }
      | { type: 'error'; message: string }
    >) => {
      resetTimeout()
      const message = event.data
      if (message.type === 'progress') {
        onProgress?.(message.percent, message.current, message.total)
      } else if (message.type === 'result') {
        void (async () => {
          const coverImage = await coverPromise
          if (signal?.aborted) return
          if (coverImage) {
            try {
              const metadata = (await dbService.loadBookMetadata()).find(book => book.id === bookId)
              if (metadata) {
                await dbService.saveBookMetadata({ ...metadata, coverImage })
              } else {
                console.warn(`[VoxLector] No se encontró metadato para asociar la portada del libro "${bookId}".`)
              }
            } catch (error) {
              console.error('[VoxLector] No se pudo guardar la portada del documento:', error)
            }
          }
          finish(() => resolve({ ...message.result, coverImage }))
        })().catch(error => {
          finish(() => reject(error))
        })
      } else if (message.type === 'error') {
        finish(() => reject(new Error(`No se pudo procesar la estructura de este documento: ${message.message}`)))
      }
    }
    worker.onerror = event => {
      event.preventDefault()
      finish(() => reject(new Error(`Falló el procesamiento del documento en segundo plano: ${event.message || 'error del Worker'}`)))
    }
    worker.onmessageerror = () => {
      finish(() => reject(new Error('No se pudo recibir el resultado del análisis del documento.')))
    }

    abortHandler = () => finish(() => reject(new DOMException('Importación cancelada.', 'AbortError')))
    if (signal?.aborted) {
      abortHandler()
      return
    }
    signal?.addEventListener('abort', abortHandler, { once: true })

    resetTimeout()
    try {
      worker.postMessage({ type: 'parse', file, bookId })
    } catch (error) {
      finish(() => reject(new Error(`No se pudo enviar el documento al Worker: ${String(error)}`)))
    }
  })
}

async function createDocumentCover(file: File): Promise<string | undefined> {
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (extension === 'pdf') return createPdfCover(file)
  if (extension === 'epub') return createEpubCover(file)
  return undefined
}

async function createPdfCover(file: File): Promise<string | undefined> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()
  const buffer = await file.arrayBuffer()
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer.slice(0)), useSystemFonts: true })
  let pdf: Awaited<typeof loadingTask.promise> | undefined

  try {
    pdf = await loadingTask.promise
    if (pdf.numPages < 1) return undefined
    const page = await pdf.getPage(1)
    try {
      const pageViewport = page.getViewport({ scale: 1 })
      const scale = Math.min(320 / pageViewport.width, 460 / pageViewport.height, 1)
      const viewport = page.getViewport({ scale })
      const canvas = createCoverCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
      const context = getCoverContext(canvas)
      await page.render({ canvasContext: context, viewport }).promise
      return await coverCanvasToDataUrl(canvas)
    } finally {
      page.cleanup()
    }
  } finally {
    if (pdf) await pdf.destroy()
    else await loadingTask.destroy()
  }
}

async function createEpubCover(file: File): Promise<string | undefined> {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const containerXml = await zip.file('META-INF/container.xml')?.async('text') ?? ''
  const container = new XmlDOMParser().parseFromString(containerXml, 'application/xml')
  const opfPath = container.getElementsByTagNameNS('*', 'rootfile')[0]?.getAttribute('full-path')
  if (!opfPath) return undefined

  const opfContent = await zip.file(opfPath)?.async('text') ?? ''
  const opf = new XmlDOMParser().parseFromString(opfContent, 'application/xml')
  const coverId = Array.from(opf.getElementsByTagNameNS('*', 'meta'))
    .find(meta => meta.getAttribute('name')?.toLowerCase() === 'cover')
    ?.getAttribute('content')
  const coverItem = Array.from(opf.getElementsByTagNameNS('*', 'item')).find(item =>
    item.getAttribute('id') === coverId ||
    (item.getAttribute('properties') ?? '').split(/\s+/u).includes('cover-image'),
  )
  const coverHref = coverItem?.getAttribute('href')
  if (!coverHref) return undefined

  const coverPath = decodeURIComponent(new URL(coverHref, `https://epub.invalid/${opfPath}`).pathname.slice(1))
  const coverFile = zip.file(coverPath)
  if (!coverFile) return undefined
  const blob = await coverFile.async('blob')
  const image = await createImageBitmap(blob)
  try {
    const scale = Math.min(320 / image.width, 460 / image.height, 1)
    const canvas = createCoverCanvas(Math.ceil(image.width * scale), Math.ceil(image.height * scale))
    const context = getCoverContext(canvas)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return await coverCanvasToDataUrl(canvas)
  } finally {
    image.close()
  }
}

function createCoverCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function getCoverContext(canvas: HTMLCanvasElement | OffscreenCanvas): CanvasRenderingContext2D {
  const context = canvas.getContext('2d')
  if (!context) throw new Error('No se pudo crear el canvas de la portada.')
  return context as CanvasRenderingContext2D
}

async function coverCanvasToDataUrl(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<string> {
  if ('convertToBlob' in canvas) {
    const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.7 })
    return blobToDataUrl(blob)
  }
  return canvas.toDataURL('image/webp', 0.7)
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error('No se pudo codificar la portada como DataURL.'))
    reader.onerror = () => reject(reader.error ?? new Error('Falló la codificación de la portada.'))
    reader.readAsDataURL(blob)
  })
}

export async function parseDocument(
  file: File,
  onProgress?: (percent: number, current: number, total: number) => void
): Promise<ParseResult> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'txt';
  const format = ext as BookFormat;

  let title = file.name.replace(/\.[^.]+$/, '');
  let author = 'Desconocido';

  let allSentences: ParsedSentence[] = [];
  let pages: number[][] = [];
  let sourceData: ArrayBuffer | undefined;

  switch (format) {
    case 'pdf': {
      const pdfData = await parsePDFComplete(file, onProgress);
      title = pdfData.title || title;
      author = pdfData.author || author;
      allSentences = pdfData.sentences;
      pages = pdfData.pages;
      sourceData = pdfData.sourceData;
      break;
    }

    case 'epub': {
      const epubData = await parseEPUBComplete(file, onProgress);
      title = epubData.title || title;
      author = epubData.author || author;
      allSentences = epubData.sentences;
      pages = epubData.pages;
      break;
    }

    case 'docx': {
      const { paragraphs } = await parseDOCX(file);
      const rawText = paragraphs.map(paragraph => paragraph.text).join('\n\n');
      const res = await detectCharactersAndParseYielding(rawText, 1, onProgress);
      allSentences = res.sentences;
      // Problema: conserva las imágenes incrustadas de DOCX junto al párrafo correspondiente.
      for (let paragraphIndex = 0; paragraphIndex < paragraphs.length; paragraphIndex++) {
        const images = paragraphs[paragraphIndex].images;
        if (images.length === 0) continue;
        const sentence = allSentences.find(item => (item.paragraphIndex ?? -1) >= paragraphIndex);
        if (sentence) sentence.embeddedImages = [...(sentence.embeddedImages ?? []), ...images];
      }
      pages = paginateByLength(allSentences, 1800);
      break;
    }

    case 'fb2': {
      const fb2Data = await parseFB2(file);
      title = fb2Data.title || title;
      author = fb2Data.author || author;
      const res = await detectCharactersAndParseYielding(fb2Data.rawText, 1, onProgress);
      allSentences = res.sentences;
      pages = paginateByLength(allSentences, 1800);
      break;
    }

    case 'rtf': {
      const rawText = extractRtfText(new Uint8Array(await file.arrayBuffer()))
      const res = await detectCharactersAndParseYielding(rawText, 1, onProgress)
      allSentences = res.sentences
      pages = paginateByLength(allSentences, 1800)
      break
    }

    case 'md':
    case 'txt':
    default: {
      const rawText = await file.text();
      const res = await detectCharactersAndParseYielding(rawText, 1, onProgress);
      allSentences = res.sentences;
      pages = paginateByLength(allSentences, 1800);
      break;
    }
  }

  // Aggregate characters and filter out invalid names
  const charCounts = new Map<string, { name: string; count: number }>();
  let countedSentences = 0;
  for (const s of allSentences) {
    if (s.character && isValidCharacterName(s.character, true)) {
      const characterId = s.characterId ?? getCharacterId(s.character)
      s.characterId = characterId
      const existing = charCounts.get(characterId)
      charCounts.set(characterId, {
        name: existing?.name ?? s.character,
        count: (existing?.count ?? 0) + 1,
      })
    }
    if (++countedSentences % 5000 === 0) {
      onProgress?.(100, countedSentences, allSentences.length)
      await yieldToMainThread()
    }
  }

  const CHAR_COLORS = [
    '#7c5cff', '#ff6b9d', '#4ade80', '#fbbf24', '#60a5fa',
    '#f87171', '#a78bfa', '#fb923c', '#34d399', '#f472b6',
  ];
  const CHAR_EMOJIS = ['🎭', '👤', '🗣️', '📢', '💬', '🎤', '🎙️', '📣', '🧙', '👑', '⚔️', '🦊', '🧚'];

  const characters: DetectedCharacter[] = Array.from(charCounts.entries())
    .map(([characterId, { name, count }], i) => ({
      characterId,
      name,
      emoji: CHAR_EMOJIS[i % CHAR_EMOJIS.length],
      color: CHAR_COLORS[i % CHAR_COLORS.length],
      lineCount: count,
    }))
    .sort((a, b) => b.lineCount - a.lineCount);

  if (pages.length === 0) {
    pages = [allSentences.map(s => s.index)];
  }

  return {
    sentences: allSentences,
    characters,
    pages,
    totalPages: pages.length,
    title,
    author,
    format,
    sourceData,
  };
}

async function detectCharactersAndParseYielding(
  rawText: string,
  pageNumber: number,
  onProgress?: (percent: number, current: number, total: number) => void,
): Promise<{ sentences: ParsedSentence[] }> {
  const paragraphs = rawText.replace(/\r\n?/g, '\n').split(/\n{2,}/)
  const context: DialogueContext = {}
  const sentences: ParsedSentence[] = []
  const linesPerChunk = 100
  const totalChunks = Math.max(1, paragraphs.reduce(
    (total, paragraph) => total + Math.max(1, Math.ceil(paragraph.split('\n').length / linesPerChunk)),
    0,
  ))
  let processedChunks = 0

  for (let paragraphIndex = 0; paragraphIndex < paragraphs.length; paragraphIndex++) {
    const lines = paragraphs[paragraphIndex].split('\n')
    for (let start = 0; start < lines.length; start += linesPerChunk) {
      const chunk = lines.slice(start, start + linesPerChunk).join('\n')
      const parsed = detectCharactersAndParse(chunk, pageNumber, context)
      preserveNarratorDialogueSource(parsed.sentences, chunk)
      enrichSentenceProsody(parsed.sentences)
      for (const sentence of parsed.sentences) {
        sentence.index = sentences.length
        sentence.paragraphIndex = paragraphIndex
        sentence.isParagraphStart =
          sentences.length === 0 ||
          sentences[sentences.length - 1].paragraphIndex !== paragraphIndex
        sentences.push(sentence)
      }
      processedChunks++
      onProgress?.(Math.round((processedChunks / totalChunks) * 100), processedChunks, totalChunks)
      if (start + linesPerChunk < lines.length || paragraphIndex < paragraphs.length - 1) {
        await yieldToMainThread()
      }
    }
  }

  return { sentences }
}

function preserveNarratorDialogueSource(sentences: ParsedSentence[], sourceText: string): void {
  const lines = sourceText.split(/\r\n?|\n/u)
  const decoratedLines = new Set<number>()
  const sentenceLines = new Map<ParsedSentence, number>()
  const lineSentenceCounts = new Map<number, number>()
  let searchFromLine = 0

  for (const sentence of sentences) {
    const normalizedSentence = sentence.text.replace(/\s+/gu, ' ').trim()
    let lineIndex = lines.findIndex((line, index) =>
      index >= searchFromLine &&
      line.replace(/\s+/gu, ' ').includes(normalizedSentence),
    )
    if (lineIndex < 0) {
      lineIndex = lines.findIndex(line =>
        line.replace(/\s+/gu, ' ').includes(normalizedSentence),
      )
    }
    if (lineIndex < 0) continue
    searchFromLine = lineIndex
    sentenceLines.set(sentence, lineIndex)
    lineSentenceCounts.set(lineIndex, (lineSentenceCounts.get(lineIndex) ?? 0) + 1)
  }

  for (const sentence of sentences) {
    if (!sentence.character) continue
    const lineIndex = sentenceLines.get(sentence)
    if (lineIndex === undefined) continue
    const line = lines[lineIndex]
    if (lineSentenceCounts.get(lineIndex) === 1) {
      sentence.rawOriginalText = line.trim()
      continue
    }
    if (decoratedLines.has(lineIndex)) {
      sentence.rawOriginalText = sentence.displayText ?? sentence.text
      continue
    }
    sentence.rawOriginalText = sentence.displayText ?? sentence.text
    decoratedLines.add(lineIndex)
  }
}

function enrichSentenceProsody(sentences: ParsedSentence[]): void {
  for (const sentence of sentences) {
    const source = sentence.rawOriginalText ?? sentence.text
    const analysis = prosodyEngine.analyze(source, sentence.emotion, true)
    if (analysis.emotion) sentence.emotion = analysis.emotion
  }
}

interface TextLine {
  y: number;
  height: number;
  items: Array<{ str: string; x: number; y: number; width: number; fontName: string }>;
}

interface PdfParagraphLayout {
  pdfFontFamily: string;
  pdfFontScale: number;
  pdfFontWeight: number;
  pdfFontStyle: 'normal' | 'italic';
  pdfTextIndentEm: number;
  pdfPageMarginLeft: number;
  pdfPageMarginRight: number;
}

function clampPdfLayout(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

// ── Layout-Preserving PDF Parser ──────────────────────────────
async function parsePDFComplete(
  file: File,
  onProgress?: (percent: number, current: number, total: number) => void
): Promise<{
  title: string;
  author: string;
  sentences: ParsedSentence[];
  pages: number[][];
  sourceData: ArrayBuffer;
}> {
  const arrayBuffer = await readFileAsArrayBuffer(file);
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();

  const loadingTask = pdfjsLib.getDocument({
    // PDF.js may transfer and detach the supplied buffer to its worker.
    data: new Uint8Array(arrayBuffer.slice(0)),
    useSystemFonts: true,
    disableFontFace: false,
  });
  let pdf: Awaited<typeof loadingTask.promise>;
  try {
    pdf = await loadingTask.promise;
  } catch (error) {
    try {
      await loadingTask.destroy();
    } catch (cleanupError) {
      console.warn('[VoxLector] No se pudo cerrar la carga fallida del PDF:', cleanupError);
    }
    throw new Error(`No se pudo abrir el PDF: ${error instanceof Error ? error.message : String(error)}`);
  }

  const totalNumPages = pdf.numPages;
  const meta = await pdf.getMetadata().catch(() => ({ info: {} }));
  const info = (meta.info as Record<string, string>) ?? {};
  const title = info['Title'] || file.name.replace(/\.pdf$/i, '');
  const author = info['Author'] || 'Desconocido';

  const allSentences: ParsedSentence[] = [];
  const pages: number[][] = [];
  let globalSentenceIdx = 0;
  let globalParagraphIdx = 0;

  try {
  for (let pageNum = 1; pageNum <= totalNumPages; pageNum++) {
    let page: Awaited<ReturnType<typeof pdf.getPage>> | undefined;
    try {
      const pageProxy = await pdf.getPage(pageNum);
      page = pageProxy;
      const content = await pageProxy.getTextContent();
      // Problema: extrae ilustraciones PDF separadas, sin convertir la página completa en imagen.
      const pageEmbeddedImages = await extractPdfEmbeddedImages(
        pageProxy,
        pdfjsLib.OPS,
        pageNum,
      )

      const rawItems = content.items.filter(
        (item): item is import('pdfjs-dist/types/src/display/api').TextItem =>
          'str' in item && typeof item.str === 'string'
      );

      // Group items into visual lines by clustering Y baseline
      const lines: TextLine[] = [];
      const lineBuckets = new Map<number, TextLine[]>();
      const Y_TOLERANCE = 4.0;
      const malformedTextBuckets = new Set<number>()

      for (const item of rawItems) {
        const str = item.str;
        if (!str) continue;

        const x = item.transform[4];
        const y = item.transform[5];
        if (hasPdfExtractionArtifacts(str)) {
          // Problema: evita que glifos binarios de imágenes se conviertan en cuadritos en el lector.
          malformedTextBuckets.add(Math.floor(y / Y_TOLERANCE))
          continue
        }
        const height = item.height || 12;
        const width = item.width || 0;

        // Find existing line within Y tolerance
        const bucket = Math.floor(y / Y_TOLERANCE);
        let matchedLine: TextLine | undefined;
        for (let candidateBucket = bucket - 1; candidateBucket <= bucket + 1; candidateBucket++) {
          matchedLine = lineBuckets.get(candidateBucket)?.find(l => Math.abs(l.y - y) <= Y_TOLERANCE);
          if (matchedLine) break;
        }
        if (!matchedLine) {
          matchedLine = { y, height, items: [] };
          lines.push(matchedLine);
          const bucketLines = lineBuckets.get(bucket) ?? [];
          bucketLines.push(matchedLine);
          lineBuckets.set(bucket, bucketLines);
        }
        // Drop the same PDF text layer when its glyphs overlap at the same visual position.
        const duplicateTextLayer = matchedLine.items.some(existing =>
          existing.str === str &&
          Math.abs(existing.x - x) <= 1 &&
          Math.abs(existing.y - y) <= Y_TOLERANCE,
        )
        if (!duplicateTextLayer) {
          matchedLine.items.push({ str, x, y, width, fontName: item.fontName });
        }
      }

      for (let lineIndex = lines.length - 1; lineIndex >= 0; lineIndex--) {
        const line = lines[lineIndex]
        const bucket = Math.floor(line.y / Y_TOLERANCE)
        const sharesMalformedRow = [-1, 0, 1].some(offset => malformedTextBuckets.has(bucket + offset))
        const lineText = line.items.map(item => item.str).join(' ')
        if (sharesMalformedRow && isPdfNumericArtifactText(lineText)) lines.splice(lineIndex, 1)
      }

      // Sort lines from Top to Bottom (higher Y in PDF = higher on page)
      lines.sort((a, b) => b.y - a.y);

      // Problema de duplicados: descarta capas PDF idénticas solo cuando están superpuestas verticalmente.
      for (let lineIndex = 1; lineIndex < lines.length;) {
        const previous = lines[lineIndex - 1]
        const current = lines[lineIndex]
        const previousText = previous.items.map(item => item.str).join(' ').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('es')
        const currentText = current.items.map(item => item.str).join(' ').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('es')
        const lineHeight = (previous.height + current.height) / 2 || 12
        if (previousText && previousText === currentText && Math.abs(previous.y - current.y) < lineHeight * 0.65) {
          lines.splice(lineIndex, 1)
        } else {
          lineIndex++
        }
      }

      // Sort items within each line from Left to Right (X ascending)
      lines.forEach(l => l.items.sort((a, b) => a.x - b.x));

      // Problema 3: conserva en cada párrafo tipografía, escala e indentación del PDF.
      const lineHeights = lines.map(line => line.height).filter(height => height > 0).sort((a, b) => a - b)
      const medianLineHeight = lineHeights.length > 0
        ? lineHeights[Math.floor(lineHeights.length / 2)]
        : 12
      const allItems = lines.flatMap(line => line.items)
      const textLeft = allItems.reduce((left, item) => Math.min(left, item.x), Number.POSITIVE_INFINITY)
      const textRight = allItems.reduce((right, item) => Math.max(right, item.x + item.width), 0)
      const pageLeft = Math.min(pageProxy.view[0], pageProxy.view[2])
      const pageRight = Math.max(pageProxy.view[0], pageProxy.view[2])
      const pageWidth = Math.max(1, pageRight - pageLeft)
      const pageMarginLeft = clampPdfLayout((textLeft - pageLeft) / pageWidth, 0, 0.3)
      const pageMarginRight = clampPdfLayout((pageRight - textRight) / pageWidth, 0, 0.3)
      const fontPresentationByName = new Map<string, {
        family: string;
        weight: number;
        style: 'normal' | 'italic';
      }>()
      const getFontPresentation = (fontName: string, fallbackFamily: string) => {
        const cached = fontPresentationByName.get(fontName)
        if (cached) return cached
        const fontData: unknown = pageProxy.commonObjs.has(fontName)
          ? pageProxy.commonObjs.get(fontName)
          : undefined
        const fontRecord = fontData && typeof fontData === 'object'
          ? fontData as Record<string, unknown>
          : {}
        const cssFontInfo = fontRecord.cssFontInfo && typeof fontRecord.cssFontInfo === 'object'
          ? fontRecord.cssFontInfo as Record<string, unknown>
          : {}
        const rawName = typeof cssFontInfo.fontFamily === 'string'
          ? cssFontInfo.fontFamily
          : typeof fontRecord.name === 'string'
            ? fontRecord.name.replace(/^[A-Z]{6}\+/u, '')
            : ''
        const normalizedName = rawName.replace(/[- ](?:Bold|Italic|Oblique|Regular|Medium|Light|Semibold|Black).*$/iu, '').trim()
        const family = /(?:times|cambria|georgia|liberation\s+serif|nimbus\s+roman)/iu.test(normalizedName)
          ? '"Times New Roman", Georgia, serif'
          : /(?:arial|helvetica|calibri|liberation\s+sans|nimbus\s+sans)/iu.test(normalizedName)
            ? 'Arial, Helvetica, sans-serif'
            : /(?:courier|consolas|liberation\s+mono|nimbus\s+mono)/iu.test(normalizedName)
              ? '"Courier New", monospace'
              : /^[\p{L}\p{N}\s,'"-]+$/u.test(normalizedName)
                ? `"${normalizedName}", ${fallbackFamily}`
                : fallbackFamily
        const weight = fontRecord.bold === true ? 700 : 400
        const style: 'normal' | 'italic' = fontRecord.italic === true ? 'italic' : 'normal'
        const presentation = { family, weight, style }
        fontPresentationByName.set(fontName, presentation)
        return presentation
      }
      const getLineLayout = (line: TextLine): PdfParagraphLayout => {
        const sourceItem = [...line.items].sort((a, b) => b.str.length - a.str.length)[0]
        const family = sourceItem
          ? content.styles[sourceItem.fontName]?.fontFamily.toLowerCase() ?? ''
          : ''
        const fallbackFamily = family.includes('mono')
          ? 'monospace'
          : family.includes('serif') && !family.includes('sans')
            ? 'serif'
            : 'sans-serif'
        const fontPresentation = sourceItem
          ? getFontPresentation(sourceItem.fontName, fallbackFamily)
          : { family: fallbackFamily, weight: 400, style: 'normal' as const }
        return {
          pdfFontFamily: fontPresentation.family,
          pdfFontScale: clampPdfLayout(line.height / medianLineHeight, 0.7, 2.4),
          pdfFontWeight: fontPresentation.weight,
          pdfFontStyle: fontPresentation.style,
          pdfTextIndentEm: line.items[0]
            ? clampPdfLayout((line.items[0].x - textLeft) / medianLineHeight, 0, 6)
            : 0,
          pdfPageMarginLeft: pageMarginLeft,
          pdfPageMarginRight: pageMarginRight,
        }
      }

      // Reconstruct formatted paragraphs from lines
      let pageText = '';
      let prevLine: TextLine | null = null;
      const paragraphLayouts: PdfParagraphLayout[] = []

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Merge items in this line with appropriate spacing
        let lineString = '';
        for (let j = 0; j < line.items.length; j++) {
          const it = line.items[j];
          if (j > 0) {
            const prevIt = line.items[j - 1];
            const gap = it.x - (prevIt.x + prevIt.width);
            if (gap > 2.0 && !lineString.endsWith(' ') && !it.str.startsWith(' ')) {
              lineString += ' ';
            }
          }
          lineString += it.str;
        }

        lineString = normalizePdfRepeatedGlyphs(lineString.trim());
        if (!lineString) continue;

        if (prevLine === null) {
          pageText = lineString;
          paragraphLayouts.push(getLineLayout(line))
        } else {
          const deltaY = prevLine.y - line.y;
          const avgHeight = (prevLine.height + line.height) / 2 || 12;
          const isParagraphBreak = deltaY > avgHeight * 1.6;
          const isDialogueLineStart =
            /^[—–-―«"“'‘]/u.test(lineString) ||
            /^(?:[A-ZÁÉÍÓÚÑÜ]{1,2}|Dr|Dra|Sr|Sra|Prof|Pregunta|Respuesta|Entrevistador|Entrevistada|Entrevistado)(?:\.|\.-|:)\s+/u.test(lineString) ||
            /^(?:Nota|Comentario|Apunte|Reflexión|Reflexion)\s+de(?:l|\s+la)?\s+[A-ZÁÉÍÓÚÑÜ]/iu.test(lineString) ||
            /^[A-ZÁÉÍÓÚÑÜ][\p{L}'’-]*(?:\s+[A-ZÁÉÍÓÚÑÜ][\p{L}'’-]*){0,3}(?:\s*(?:dice|comenta|anota|explica|\([^)]*\)))?:\s+/u.test(lineString);

          if (isParagraphBreak) {
            pageText += '\n\n' + lineString;
            paragraphLayouts.push(getLineLayout(line))
          } else if (isDialogueLineStart) {
            pageText += '\n' + lineString;
          } else {
            // Soft wrap within a paragraph: remove hyphenation if word was split
            if (pageText.endsWith('-')) {
              pageText = pageText.slice(0, -1) + lineString;
            } else {
              pageText += ' ' + lineString;
            }
          }
        }

        prevLine = line;
      }

      pageText = pageText.trim();
      const pageSentenceIndices: number[] = [];

      if (pageText.length > 0) {
        const paragraphs = pageText.split(/\n{2,}/).map(text => text.trim()).filter(Boolean);
        for (let paragraphIndex = 0; paragraphIndex < paragraphs.length; paragraphIndex++) {
          const paragraph = paragraphs[paragraphIndex]
          // Problema 3: no hereda un hablante activo de otro párrafo o página.
          const { sentences: paragraphSentences } = detectCharactersAndParse(
            paragraph,
            pageNum,
            {},
          );
          preserveNarratorDialogueSource(paragraphSentences, paragraph)
          enrichSentenceProsody(paragraphSentences)
          for (let sentenceIndex = 0; sentenceIndex < paragraphSentences.length; sentenceIndex++) {
            const sentence = paragraphSentences[sentenceIndex];
            const reIndexed: ParsedSentence = {
              ...sentence,
              ...paragraphLayouts[paragraphIndex],
              index: globalSentenceIdx++,
              pageNumber: pageNum,
              paragraphIndex: globalParagraphIdx,
              isParagraphStart: sentenceIndex === 0,
            };
            allSentences.push(reIndexed);
            pageSentenceIndices.push(reIndexed.index);
          }
          globalParagraphIdx++;
        }
      }
      if (pageEmbeddedImages.length > 0 && pageSentenceIndices.length > 0) {
        const firstSentence = allSentences[pageSentenceIndices[0]]
        firstSentence.embeddedImages = [...(firstSentence.embeddedImages ?? []), ...pageEmbeddedImages]
      }

      pages.push(pageSentenceIndices);
      page.cleanup();

      if (onProgress) {
        onProgress(Math.round((pageNum / totalNumPages) * 100), pageNum, totalNumPages);
      }
      if (pageNum < totalNumPages && pageNum % 4 === 0) await yieldToMainThread();
    } catch (err) {
      console.warn(`Error on PDF page ${pageNum}:`, err);
      page?.cleanup();
      throw new Error(`No se pudo procesar la página ${pageNum} del PDF: ${String(err)}`);
    }
  }
  } finally {
    try {
      pdf.cleanup();
    } catch (cleanupError) {
      console.warn('[VoxLector] No se pudo liberar completamente el PDF:', cleanupError);
    }
    try {
      await loadingTask.destroy();
    } catch (cleanupError) {
      console.warn('[VoxLector] No se pudo cerrar completamente la carga del PDF:', cleanupError);
    }
  }
  return { title, author, sentences: allSentences, pages, sourceData: arrayBuffer };
}

// ── Complete EPUB Parser ─────────────────────────────────────
async function parseEPUBComplete(
  file: File,
  onProgress?: (percent: number, current: number, total: number) => void
): Promise<{
  title: string;
  author: string;
  sentences: ParsedSentence[];
  pages: number[][];
}> {
  const { default: JSZip } = await import('jszip');
  const arrayBuffer = await readFileAsArrayBuffer(file);
  const zip = await JSZip.loadAsync(arrayBuffer);

  const containerXml = await zip.file('META-INF/container.xml')?.async('text') ?? '';
  const containerDoc = new XmlDOMParser().parseFromString(containerXml, 'application/xml');
  const opfPath = containerDoc.getElementsByTagNameNS('*', 'rootfile')[0]?.getAttribute('full-path')
    ?? 'OEBPS/content.opf';

  let title = file.name.replace(/\.epub$/i, '');
  let author = 'Desconocido';

  const opfContent = await zip.file(opfPath)?.async('text') ?? '';
  const opfDoc = new XmlDOMParser().parseFromString(opfContent, 'application/xml');
  if (opfContent) {
    title = opfDoc.getElementsByTagNameNS('*', 'title')[0]?.textContent?.trim() || title;
    author = opfDoc.getElementsByTagNameNS('*', 'creator')[0]?.textContent?.trim() || author;
  }

  const manifest = new Map<string, string>();
  for (const item of Array.from(opfDoc.getElementsByTagNameNS('*', 'item'))) {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    const mediaType = item.getAttribute('media-type') || '';
    if (id && href && /html|xhtml/i.test(mediaType)) {
      manifest.set(
        id,
        decodeURIComponent(new URL(href, `https://epub.invalid/${opfPath}`).pathname.slice(1))
      );
    }
  }
  const spineFiles = Array.from(opfDoc.getElementsByTagNameNS('*', 'itemref'))
    .map(item => manifest.get(item.getAttribute('idref') || ''))
    .filter((name): name is string => !!name);
  const htmlFiles = spineFiles.length > 0
    ? spineFiles
    : Object.keys(zip.files).filter(name => /\.(html|xhtml|htm)$/i.test(name)).sort();

  const allSentences: ParsedSentence[] = [];
  const pages: number[][] = [];
  let globalSentenceIdx = 0;
  let pageNum = 1;
  let paragraphNum = 0;
  let pendingEmbeddedImages: Array<{ src: string; alt: string }> = [];
  const dialogueContext: DialogueContext = {}
  let currentPageIndices: number[] = [];
  let currentPageLength = 0;

  for (let i = 0; i < htmlFiles.length; i++) {
    const fname = htmlFiles[i];
    const html = await zip.file(fname)?.async('text') ?? '';
    let paragraphIndex = 0;
    for (const paragraph of extractStructuredHtmlBlocks(html)) {
      const { sentences } = detectCharactersAndParse(paragraph.text, pageNum, dialogueContext);
      preserveNarratorDialogueSource(sentences, paragraph.text)
      enrichSentenceProsody(sentences)
      const embeddedImages = [...pendingEmbeddedImages, ...await resolveEpubImages(zip, fname, paragraph.images)]
      pendingEmbeddedImages = []
      if (sentences.length === 0) {
        pendingEmbeddedImages = embeddedImages
        paragraphNum++
        paragraphIndex++
        if (paragraphIndex > 0 && paragraphIndex % 40 === 0) await yieldToMainThread()
        continue
      }
      let imagesAttached = false
      for (const sentence of sentences) {
        if (currentPageIndices.length > 0 && currentPageLength + sentence.text.length > 1800) {
          pages.push(currentPageIndices)
          currentPageIndices = []
          currentPageLength = 0
          pageNum++
        }
        const sentenceItem: ParsedSentence = {
          ...sentence,
          index: globalSentenceIdx++,
          pageNumber: pageNum,
          paragraphIndex: paragraphNum,
          ...(!imagesAttached && embeddedImages.length > 0 ? { embeddedImages } : {}),
        }
        imagesAttached = imagesAttached || embeddedImages.length > 0
        allSentences.push(sentenceItem)
        currentPageIndices.push(sentenceItem.index)
        currentPageLength += sentenceItem.text.length
      }
      paragraphNum++
      paragraphIndex++
      if (paragraphIndex > 0 && paragraphIndex % 40 === 0) await yieldToMainThread();
    }

    if (currentPageIndices.length > 0) {
      pages.push(currentPageIndices)
      currentPageIndices = []
      currentPageLength = 0
      pageNum++
    }

    if (onProgress) {
      onProgress(Math.round(((i + 1) / htmlFiles.length) * 100), i + 1, htmlFiles.length);
    }
    if (i < htmlFiles.length - 1) await yieldToMainThread();
  }

  if (currentPageIndices.length > 0) pages.push(currentPageIndices)
  return { title, author, sentences: allSentences, pages };
}

async function parseDOCX(file: File): Promise<{ paragraphs: StructuredHtmlBlock[] }> {
  const { convertToHtml } = await import('mammoth');
  const arrayBuffer = await readFileAsArrayBuffer(file);
  const result = await convertToHtml({ arrayBuffer });
  // Problema: conservar imágenes integradas del DOCX en vez de perderlas al aplanar HTML a texto.
  return { paragraphs: Array.from(extractStructuredHtmlBlocks(result.value)) };
}

async function parseFB2(file: File): Promise<{ rawText: string; title: string; author: string }> {
  const text = await file.text();
  const doc = new XmlDOMParser().parseFromString(text, 'application/xml');

  const title = doc.getElementsByTagName('book-title')[0]?.textContent?.trim() || file.name.replace(/\.fb2$/i, '');
  const authorFirst = doc.getElementsByTagName('first-name')[0]?.textContent || '';
  const authorLast = doc.getElementsByTagName('last-name')[0]?.textContent || '';
  const author = [authorFirst, authorLast].filter(Boolean).join(' ') || 'Desconocido';

  const paragraphs = Array.from(doc.getElementsByTagName('p'))
    .map(p => p.textContent?.trim())
    .filter(Boolean) as string[];

  return { rawText: paragraphs.join('\n\n'), title, author };
}

function paginateByLength(sentences: ParsedSentence[], charsPerPage = 1800): number[][] {
  const pages: number[][] = [];
  let currentPage: number[] = [];
  let currentLen = 0;

  for (const s of sentences) {
    currentPage.push(s.index);
    currentLen += s.text.length;
    if (currentLen >= charsPerPage) {
      pages.push(currentPage);
      currentPage = [];
      currentLen = 0;
    }
  }
  if (currentPage.length > 0) pages.push(currentPage);
  return pages;
}

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

interface StructuredHtmlBlock {
  text: string;
  images: Array<{ src: string; alt: string }>;
}

function* extractStructuredHtmlBlocks(html: string): Generator<StructuredHtmlBlock> {
  // This parser also runs in a Web Worker, where the browser DOMParser and
  // Node constants are not available. Mammoth output is normalized to XML first.
  const normalizedHtml = html
    .replace(/<br(\s[^>]*)?>/gi, (_tag, attributes = '') => `<br${attributes}/>`)
    .replace(/<(img|hr|input|meta|link|source|wbr)\b([^>]*?)\/?\s*>/gi, '<$1$2/>')
    .replace(/&nbsp;/gi, '&#160;');
  const doc = new XmlDOMParser({
    errorHandler: { warning: () => undefined, error: () => undefined, fatalError: () => undefined },
  }).parseFromString(`<root>${normalizedHtml}</root>`, 'application/xml');
  const blockTags = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'DIV', 'SECTION']);
  let current = '';
  let currentImages: Array<{ src: string; alt: string }> = [];

  function* flush(): Generator<StructuredHtmlBlock> {
    const text = current.replace(/[ \t]+/g, ' ').trim();
    if (text || currentImages.length > 0) yield { text, images: currentImages };
    current = '';
    currentImages = [];
  }

  function* visit(node: Node): Generator<StructuredHtmlBlock> {
    if (node.nodeType === 3) {
      current += node.textContent ?? '';
      return;
    }
    if (node.nodeType !== 1) return;
    const element = node as Element;
    const tagName = element.tagName.toUpperCase();
    if (['SCRIPT', 'STYLE', 'NAV', 'SVG'].includes(tagName)) return;
    if (tagName === 'IMG') {
      const src = element.getAttribute('src')?.trim();
      if (src) currentImages.push({ src, alt: element.getAttribute('alt')?.trim() || '' });
      return;
    }
    if (tagName === 'BR') {
      yield* flush();
      return;
    }
    const isBlock = blockTags.has(tagName);
    if (isBlock) yield* flush();
    for (const child of Array.from(element.childNodes)) yield* visit(child);
    if (isBlock) yield* flush();
  }

  yield* visit(doc.documentElement);
  yield* flush();
}

async function resolveEpubImages(
  zip: { file(path: string): { dir: boolean; async(type: 'base64'): Promise<string> } | null },
  htmlPath: string,
  images: Array<{ src: string; alt: string }>,
): Promise<Array<{ src: string; alt: string }>> {
  // Problema: solo se muestran imágenes embebidas locales, evitando solicitudes a recursos externos.
  const resolved: Array<{ src: string; alt: string }> = [];
  for (const image of images) {
    if (/^data:image\/(?:png|jpeg|gif|webp|svg\+xml);base64,/i.test(image.src)) {
      if (image.src.length <= 16_000_000) resolved.push(image);
      continue;
    }
    if (/^(?:https?:|\/\/|blob:)/i.test(image.src)) continue;
    const imagePath = new URL(image.src, `https://epub.invalid/${htmlPath}`).pathname.slice(1);
    const entry = zip.file(decodeURIComponent(imagePath));
    if (!entry || entry.dir) continue;
    const mime = imagePath.toLowerCase().endsWith('.png') ? 'image/png'
      : imagePath.toLowerCase().endsWith('.gif') ? 'image/gif'
        : imagePath.toLowerCase().endsWith('.webp') ? 'image/webp'
          : imagePath.toLowerCase().endsWith('.svg') ? 'image/svg+xml'
            : 'image/jpeg';
    const data = await entry.async('base64');
    if (data.length <= 16_000_000) resolved.push({ ...image, src: `data:${mime};base64,${data}` });
  }
  return resolved;
}

async function extractPdfEmbeddedImages(
  page: {
    getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[][] }>;
    objs: { get(id: string, callback?: (value: unknown) => void): unknown };
    view: number[];
  },
  ops: { paintImageXObject: number; paintImageXObjectRepeat: number; paintInlineImageXObject: number },
  pageNumber: number,
): Promise<Array<{ src: string; alt: string }>> {
  const operatorList = await page.getOperatorList()
  const objectIds = new Set<string>()
  const inlineImages: unknown[] = []
  for (let index = 0; index < operatorList.fnArray.length; index++) {
    const operation = operatorList.fnArray[index]
    const args = operatorList.argsArray[index]
    if (operation === ops.paintImageXObject || operation === ops.paintImageXObjectRepeat) {
      if (typeof args?.[0] === 'string') objectIds.add(args[0])
    } else if (operation === ops.paintInlineImageXObject && args?.[0]) {
      inlineImages.push(args[0])
    }
  }

  const candidates: unknown[] = [...inlineImages]
  for (const id of objectIds) {
    candidates.push(await new Promise<unknown>(resolve => page.objs.get(id, resolve)))
  }

  const pageWidth = Math.abs((page.view[2] ?? 0) - (page.view[0] ?? 0))
  const pageHeight = Math.abs((page.view[3] ?? 0) - (page.view[1] ?? 0))
  const pageAspect = pageHeight > 0 ? pageWidth / pageHeight : 0
  const embeddedImages: Array<{ src: string; alt: string }> = []
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object' || embeddedImages.length >= 8) continue
    const image = candidate as { width?: unknown; height?: unknown; data?: unknown; bitmap?: unknown }
    const width = typeof image.width === 'number' ? image.width : 0
    const height = typeof image.height === 'number' ? image.height : 0
    if (width < 2 || height < 2 || width * height > 4_000_000) continue
    if (width >= 1000 && height >= 1000 && pageAspect > 0 &&
        Math.abs(width / height - pageAspect) < 0.015) continue

    const canvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(width, height)
      : typeof document !== 'undefined'
        ? document.createElement('canvas')
        : undefined
    if (!canvas) continue
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) continue
    const bitmap = image.bitmap
    if (typeof ImageBitmap !== 'undefined' && bitmap instanceof ImageBitmap) {
      context.drawImage(bitmap, 0, 0, width, height)
    } else {
      const pixels = image.data
      if (!(pixels instanceof Uint8Array) && !(pixels instanceof Uint8ClampedArray)) continue
      const imageData = context.createImageData(width, height)
      if (pixels.length === width * height * 4) {
        imageData.data.set(pixels)
      } else if (pixels.length === width * height * 3) {
        for (let source = 0, target = 0; source < pixels.length; source += 3, target += 4) {
          imageData.data[target] = pixels[source]
          imageData.data[target + 1] = pixels[source + 1]
          imageData.data[target + 2] = pixels[source + 2]
          imageData.data[target + 3] = 255
        }
      } else if (pixels.length === width * height) {
        for (let source = 0, target = 0; source < pixels.length; source++, target += 4) {
          imageData.data[target] = pixels[source]
          imageData.data[target + 1] = pixels[source]
          imageData.data[target + 2] = pixels[source]
          imageData.data[target + 3] = 255
        }
      } else {
        continue
      }
      context.putImageData(imageData, 0, 0)
    }
    const src = await canvasToPngDataUrl(canvas)
    if (src) embeddedImages.push({ src, alt: `Ilustración incrustada, página ${pageNumber}` })
  }
  return embeddedImages
}

async function canvasToPngDataUrl(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<string | undefined> {
  if ('convertToBlob' in canvas) {
    const blob = await canvas.convertToBlob({ type: 'image/png' })
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let binary = ''
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
    }
    return `data:image/png;base64,${btoa(binary)}`
  }
  return canvas.toDataURL('image/png')
}

function yieldToMainThread(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}
