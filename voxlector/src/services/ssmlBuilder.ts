const PUNCTUATION_PAUSE_MS: Record<string, number> = {
  comma: 130,
  semicolon: 190,
  question: 340,
  period: 300,
  ellipsis: 480,
};

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function pauseFor(mark: string, emotion?: string): number {
  if (emotion === 'sollozando' && mark === ',') return 65
  if (mark.includes('…') || (/^\.+$/u.test(mark) && mark.length >= 3)) return PUNCTUATION_PAUSE_MS.ellipsis
  if (/[!?]/u.test(mark)) return PUNCTUATION_PAUSE_MS.question
  if (mark.includes('.')) return PUNCTUATION_PAUSE_MS.period
  if (/[;:]/u.test(mark)) return PUNCTUATION_PAUSE_MS.semicolon
  return PUNCTUATION_PAUSE_MS.comma
}

export function buildPunctuationSsml(text: string, emotion?: string, isQuestion = false): string {
  const punctuation = /[,;:!?…]+|\.+/gu
  let result = '<speak>'
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = punctuation.exec(text))) {
    if (
      match[0][0] === '.' &&
      /\d/u.test(text[match.index - 1] ?? '') &&
      /\d/u.test(text[punctuation.lastIndex] ?? '')
    ) continue

    const phrase = `${text.slice(cursor, match.index)}${match[0]}`
    const endsText = text.slice(punctuation.lastIndex).trim() === ''
    const punctuationIsQuestion = /[?]/u.test(match[0]) || isQuestion && endsText
    const punctuationIsExclamation = /[!]/u.test(match[0]) && !punctuationIsQuestion
    result += wrapProsody(
      escapeEmotionPauses(phrase, emotion),
      emotion,
      punctuationIsQuestion,
      punctuationIsExclamation,
    )
    result += `<break time="${pauseFor(match[0], emotion)}ms"/>`
    cursor = punctuation.lastIndex
  }

  const remainder = text.slice(cursor)
  const remainderSsml = remainder
    ? wrapProsody(
        escapeEmotionPauses(remainder, emotion),
        emotion,
        isQuestion || /[?]\s*$/u.test(remainder),
        /[!]\s*$/u.test(remainder),
      )
    : ''
  return `${result}${remainderSsml}</speak>`
}

function escapeEmotionPauses(text: string, emotion?: string): string {
  if (emotion !== 'sollozando') return escapeXml(text)
  return text.replace(/\S+(?:\s+|$)/gu, token => {
    const whitespace = token.match(/\s+$/u)?.[0] ?? ''
    const word = whitespace ? token.slice(0, -whitespace.length) : token
    const breakAfterWord = /[,;:!?….)]$/u.test(word) ? '' : '<break time="65ms"/>'
    return `${escapeXml(word)}${breakAfterWord}${whitespace}`
  })
}

function wrapProsody(text: string, emotion?: string, question = false, exclamation = false): string {
  const styles: Record<string, string> = {
    alegre: 'rate="+10%" pitch="+10%"',
    enojado: 'rate="+8%" pitch="+8%"',
    miedo: 'rate="+8%" pitch="+12%"',
    nervioso: 'rate="+8%" pitch="+9%"',
    triste: 'rate="-10%" pitch="-8%"',
    sollozando: 'rate="-12%" pitch="-8%"',
    susurro: 'rate="-12%" pitch="-10%" volume="soft"',
    épico: 'rate="-8%" pitch="-4%"',
    misterioso: 'rate="-10%" pitch="-8%"',
    dolor: 'rate="-10%" pitch="-9%"',
    jadeando: 'rate="+8%" pitch="+6%"',
    riendo: 'rate="+12%" pitch="+12%"',
  }
  const words = text.match(/\S+/gu) ?? []
  if ((question || exclamation) && words.length > 1 && !text.includes('<')) {
    const tail = words.splice(-Math.min(3, words.length)).join(' ')
    const contour = question
      ? 'pitch="+2st"'
      : 'pitch="+2st" rate="+8%"'
    text = `${words.length ? `${words.join(' ')} ` : ''}<prosody ${contour}>${tail}</prosody>`
  }
  const style = emotion ? styles[emotion.normalize('NFD').replace(/[\u0300-\u036f]/gu, '').toLocaleLowerCase('es')] : undefined
  if (style) return `<prosody ${style}>${text}</prosody>`
  if (question) return `<prosody pitch="+2st">${text}</prosody>`
  return exclamation ? `<prosody pitch="+2st" rate="+8%">${text}</prosody>` : text
}
