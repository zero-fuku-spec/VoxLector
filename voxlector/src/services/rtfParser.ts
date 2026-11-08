const WIN1252_MAP: Record<number, number> = {
  0x80: 0x20AC, // €
  0x82: 0x201A, // ‚
  0x83: 0x0192, // ƒ
  0x84: 0x201E, // „
  0x85: 0x2026, // …
  0x86: 0x2020, // †
  0x87: 0x2021, // ‡
  0x88: 0x02C6, // ˆ
  0x89: 0x2030, // ‰
  0x8A: 0x0160, // Š
  0x8B: 0x2039, // ‹
  0x8C: 0x0152, // Œ
  0x8E: 0x017D, // Ž
  0x91: 0x2018, // ‘
  0x92: 0x2019, // ’
  0x93: 0x201C, // “
  0x94: 0x201D, // ”
  0x95: 0x2022, // •
  0x96: 0x2013, // –
  0x97: 0x2014, // —
  0x98: 0x02DC, // ˜
  0x99: 0x2122, // ™
  0x9A: 0x0161, // š
  0x9B: 0x203A, // ›
  0x9C: 0x0153, // œ
  0x9E: 0x017E, // ž
  0x9F: 0x0178, // Ÿ
}

function decodeWindows1252Byte(byte: number): string {
  if (byte < 0x80) return String.fromCharCode(byte)
  if (WIN1252_MAP[byte]) return String.fromCharCode(WIN1252_MAP[byte])
  return String.fromCharCode(byte)
}

function decodeWindows1252Bytes(bytes: number[] | Uint8Array): string {
  let res = ''
  for (let i = 0; i < bytes.length; i++) {
    res += decodeWindows1252Byte(bytes[i])
  }
  return res
}

function decodeHexBytes(bytes: number[]): string {
  if (bytes.length > 1) {
    try {
      const utf8Decoder = new TextDecoder('utf-8', { fatal: true })
      return utf8Decoder.decode(new Uint8Array(bytes))
    } catch {
      // Fallback a Windows-1252 byte a byte
    }
  }
  return decodeWindows1252Bytes(bytes)
}

const SKIPPED_DESTINATIONS = new Set([
  'annotation', 'author', 'colortbl', 'datastore', 'filetbl', 'fonttbl',
  'footer', 'footerf', 'footerl', 'footerr', 'header', 'headerf', 'headerl',
  'headerr', 'info', 'listoverridetable', 'listtable', 'object', 'pict',
  'revtbl', 'stylesheet', 'themedata', 'xmlattrname', 'xmlattrvalue',
  'xmlclose', 'xmlname', 'xmlnstbl', 'xmlopen',
])

function getRtfEncoding(source: string): string {
  const codePage = Number(source.match(/\\ansicpg(\d+)/u)?.[1] ?? 1252)
  if (codePage === 65001) return 'utf-8'
  if (codePage >= 1250 && codePage <= 1258) return `windows-${codePage}`
  if (codePage === 437 || codePage === 850) return `ibm${codePage}`
  if (codePage === 874) return 'windows-874'
  if (codePage === 932) return 'shift_jis'
  if (codePage === 936) return 'gbk'
  if (codePage === 949) return 'euc-kr'
  if (codePage === 950) return 'big5'
  return 'windows-1252'
}

function decodeRtfSource(bytes: Uint8Array): { source: string; encoding: string } {
  let header = ''
  for (let i = 0; i < Math.min(bytes.length, 4096); i++) {
    header += String.fromCharCode(bytes[i] & 0x7F)
  }
  const encoding = getRtfEncoding(header)
  let source = ''
  try {
    source = new TextDecoder(encoding).decode(bytes)
  } catch {
    try {
      source = new TextDecoder('windows-1252').decode(bytes)
    } catch {
      source = decodeWindows1252Bytes(bytes)
    }
  }
  return { source: source.replace(/^\uFEFF/u, ''), encoding }
}

export function extractRtfText(bytes: Uint8Array): string {
  const { source } = decodeRtfSource(bytes)
  if (!/^\s*\{\\rtf\d*/iu.test(source)) {
    throw new Error('El archivo no contiene una estructura RTF válida.')
  }

  const output: string[] = []
  const states: Array<{ skip: boolean; unicodeFallbackCount: number; groupStart: boolean; skipDestination: boolean }> = []
  let state = { skip: false, unicodeFallbackCount: 1, groupStart: true, skipDestination: false }
  let index = 0

  while (index < source.length) {
    const character = source[index]
    if (character === '{') {
      states.push({ ...state })
      state = { ...state, groupStart: true, skipDestination: false }
      index++
      continue
    }
    if (character === '}') {
      const previous = states.pop()
      if (previous) state = previous
      index++
      continue
    }
    if (character !== '\\') {
      if (!state.skip) {
        if (character !== '\0' && character !== '\r') {
          output.push(character)
          if (!/\s/u.test(character)) state.groupStart = false
        }
      }
      index++
      continue
    }

    index++
    if (index >= source.length) break
    const next = source[index]

    if (next === '\'' && /^[\da-f]{2}$/iu.test(source.slice(index + 1, index + 3))) {
      const bytesForCharacter = [Number.parseInt(source.slice(index + 1, index + 3), 16)]
      index += 3
      while (source[index] === '\\' && source[index + 1] === '\'' &&
             /^[\da-f]{2}$/iu.test(source.slice(index + 2, index + 4))) {
        bytesForCharacter.push(Number.parseInt(source.slice(index + 2, index + 4), 16))
        index += 4
      }
      if (!state.skip) {
        output.push(decodeHexBytes(bytesForCharacter))
        state.groupStart = false
      }
      continue
    }

    if (!/[a-z]/iu.test(next)) {
      index++
      if (next === '*') {
        state.skipDestination = true
      } else if (!state.skip) {
        if (next === '\\' || next === '{' || next === '}') output.push(next)
        else if (next === '~') output.push(' ')
        else if (next === '_') output.push('\u2011')
        else if (next === '-') { /* Optional hyphen is not visible text. */ }
        else if (next === '"') output.push('"')
        else if (next === '\'') output.push('\'')
        state.groupStart = false
      }
      continue
    }

    const wordStart = index
    while (index < source.length && /[a-z]/iu.test(source[index])) index++
    const word = source.slice(wordStart, index).toLowerCase()
    let parameter: number | undefined
    const parameterMatch = source.slice(index).match(/^(-?\d+)/u)
    if (parameterMatch) {
      parameter = Number(parameterMatch[1])
      index += parameterMatch[1].length
    }
    if (source[index] === ' ') index++

    if (state.groupStart && (state.skipDestination || SKIPPED_DESTINATIONS.has(word))) {
      state.skip = true
    }
    state.skipDestination = false
    if (state.skip) continue

    switch (word) {
      case 'u':
        if (parameter !== undefined) {
          const codePoint = parameter < 0 ? parameter + 65536 : parameter
          try {
            output.push(String.fromCodePoint(codePoint))
          } catch {
            output.push(String.fromCharCode(codePoint))
          }
          let fallback = state.unicodeFallbackCount
          while (fallback > 0 && index < source.length) {
            if (source[index] === '\\' && source[index + 1] === '\'' &&
                /^[\da-f]{2}$/iu.test(source.slice(index + 2, index + 4))) {
              index += 4
            } else if (source[index] === '\\' && index + 1 < source.length) {
              index += 2
            } else {
              index++
            }
            fallback--
          }
          state.groupStart = false
        }
        break
      case 'uc':
        if (parameter !== undefined) state.unicodeFallbackCount = Math.max(0, parameter)
        break
      case 'par':
      case 'sect':
      case 'page':
      case 'row':
        output.push('\n\n')
        state.groupStart = false
        break
      case 'line':
      case 'softline':
        output.push('\n')
        state.groupStart = false
        break
      case 'tab':
      case 'cell':
        output.push('\t')
        state.groupStart = false
        break
      case 'emdash':
        output.push('\u2014')
        state.groupStart = false
        break
      case 'endash':
        output.push('\u2013')
        state.groupStart = false
        break
      case 'lquote':
        output.push('\u2018')
        state.groupStart = false
        break
      case 'rquote':
        output.push('\u2019')
        state.groupStart = false
        break
      case 'ldblquote':
        output.push('\u201c')
        state.groupStart = false
        break
      case 'rdblquote':
        output.push('\u201d')
        state.groupStart = false
        break
      case 'bullet':
        output.push('\u2022')
        state.groupStart = false
        break
      case 'bin':
        if (parameter && parameter > 0) index += parameter
        break
      default:
        break
    }
  }

  return output.join('')
    .replace(/\0/gu, '')
    .replace(/\r\n?/gu, '\n')
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n[ \t]+/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim()
}
