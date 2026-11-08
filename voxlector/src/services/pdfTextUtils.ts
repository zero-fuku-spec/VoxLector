import type { ParsedSentence } from '@/types'

const PDF_EXTRACTION_ARTIFACTS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\uFFFD]/u
const PDF_NUMERIC_ARTIFACTS = /^\d{1,5}(?:(?:\s*[,;|]\s*|\s+)\d{1,5})*[.,;:]?$/u

function normalizeRepeatedGlyphToken(token: string): string | null {
  const match = token.match(/^([^\p{L}\p{N}]*)([\p{L}\p{N}]+)([^\p{L}\p{N}]*)$/u)
  if (!match || !/\p{L}/u.test(match[2])) return null

  const glyphs = Array.from(match[2])
  if (glyphs.length < 2 || glyphs.length % 2 !== 0) return null
  for (let index = 0; index < glyphs.length; index += 2) {
    if (glyphs[index].toLocaleLowerCase() !== glyphs[index + 1].toLocaleLowerCase()) return null
  }

  return `${match[1]}${glyphs.filter((_, index) => index % 2 === 0).join('')}${match[3]}`
}

export function normalizePdfRepeatedGlyphs(text: string): string {
  const tokens = text.match(/\s+|[^\s]+/gu) ?? []
  const words = tokens.filter(token => !/^\s+$/u.test(token))
  const repeatedWords = words.filter(token => normalizeRepeatedGlyphToken(token) !== null)
  const confidentlyRepeatedWords = words.filter(token => {
    const normalized = normalizeRepeatedGlyphToken(token)
    return normalized !== null && Array.from(token).filter(character => /\p{L}|\p{N}/u.test(character)).length >= 4
  })
  const hasRepeatedLinePattern = words.length === 1
    ? confidentlyRepeatedWords.length === 1
    : confidentlyRepeatedWords.length >= 2 && repeatedWords.length / words.length >= 0.6
  if (!hasRepeatedLinePattern) return text
  return tokens.map(token => /^\s+$/u.test(token) ? token : normalizeRepeatedGlyphToken(token) ?? token).join('')
}

export function hasPdfExtractionArtifacts(text: string): boolean {
  return PDF_EXTRACTION_ARTIFACTS.test(text)
}

export function hasPdfTextEncodingErrors(sentences: ParsedSentence[]): boolean {
  // Problema 2: detecta texto PDF irrecuperable para mostrar la página original en lugar de �.
  return sentences.some(sentence =>
    [sentence.text, sentence.displayText, sentence.rawOriginalText]
      .some(text => typeof text === 'string' && text.includes('\uFFFD')),
  )
}

export function isPdfNumericArtifactText(text: string): boolean {
  return PDF_NUMERIC_ARTIFACTS.test(text.trim())
}

export function filterPdfExtractionArtifacts(sentences: ParsedSentence[]): ParsedSentence[] {
  const pageHasExtractionArtifacts = sentences.some(sentence =>
    [sentence.text, sentence.displayText, sentence.rawOriginalText]
      .some(text => typeof text === 'string' && hasPdfExtractionArtifacts(text)),
  )
  const readableSentences = sentences.filter(sentence =>
    ![sentence.text, sentence.displayText, sentence.rawOriginalText]
      .some(text => typeof text === 'string' && hasPdfExtractionArtifacts(text)),
  )

  // Problema: evita mostrar glifos ilegibles y números residuales del texto extraído de imágenes.
  return readableSentences
    .filter(sentence => !pageHasExtractionArtifacts || !isPdfNumericArtifactText(sentence.displayText ?? sentence.text))
    .map(sentence => {
      const text = normalizePdfRepeatedGlyphs(sentence.text)
      const displayText = sentence.displayText ? normalizePdfRepeatedGlyphs(sentence.displayText) : undefined
      const spokenText = sentence.spokenText ? normalizePdfRepeatedGlyphs(sentence.spokenText) : undefined
      const rawOriginalText = sentence.rawOriginalText ? normalizePdfRepeatedGlyphs(sentence.rawOriginalText) : undefined
      if (
        text === sentence.text &&
        displayText === sentence.displayText &&
        spokenText === sentence.spokenText &&
        rawOriginalText === sentence.rawOriginalText
      ) return sentence
      return { ...sentence, text, displayText, spokenText, rawOriginalText }
    })
}
