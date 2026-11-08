// ============================================================
// VoxLector — Character Detector & Dialogue Parser
// High-precision Spanish literary & interview dialogue extractor
// Supports fiction, biography, interviews (P:/R:), and editorial notes,
// with strict false-positive suppression (filters abstract concepts).
// ============================================================

import type { DetectedCharacter, ParsedSentence } from '@/types';

const CHAR_COLORS = [
  '#7c5cff', '#ff6b9d', '#4ade80', '#fbbf24', '#60a5fa',
  '#f87171', '#a78bfa', '#fb923c', '#34d399', '#f472b6',
  '#38bdf8', '#c084fc', '#f43f5e', '#10b981', '#eab308'
];
const CHAR_EMOJIS = ['🎭', '👤', '🗣️', '📢', '💬', '🎤', '🎙️', '📣', '🧙', '👑', '⚔️', '🦊', '🧚'];

// Comprehensive blacklist of editorial, structural, and grammatical terms
const BLACKLIST_WORDS = new Set([
  // Problema 3: los encabezados genéricos no deben convertirse en personajes.
  'personaje', 'personajes', 'protagonista', 'protagonistas',
  'capítulo', 'capitulo', 'chapter', 'página', 'pagina', 'page', 'sección', 'seccion',
  'parte', 'tomo', 'volumen', 'vol', 'prólogo', 'prologo', 'epílogo', 'epilogo',
  'acto', 'escena', 'introducción', 'introduccion', 'conclusión', 'conclusion',
  'nota', 'notas', 'editorial', 'autor', 'autora', 'traductor', 'traducción', 'traduccion',
  'edición', 'edicion', 'copyright', 'isbn', 'depósito', 'deposito', 'índice', 'indice',
  'index', 'resumen', 'abstract', 'bibliografía', 'bibliografia', 'fuente', 'figura',
  'tabla', 'imagen', 'gráfico', 'grafico', 'anexo', 'apéndice', 'apendice', 'prefacio',
  'advertencia', 'glosario', 'dedicatoria', 'agradecimientos', 'fin', 'continuará', 'continuara',
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'y', 'o', 'pero', 'mas', 'más',
  'de', 'del', 'en', 'a', 'al', 'con', 'por', 'para', 'sin', 'sobre', 'tras',
  'este', 'esta', 'estos', 'estas', 'ese', 'esa', 'esos', 'esas', 'aquel', 'aquella',
  'todo', 'toda', 'todos', 'todas', 'otro', 'otra', 'otros', 'otras',
  'madrid', 'barcelona', 'méxico', 'mexico', 'buenos aires', 'españa', 'espana',
]);

// Abstract thematic concepts, section topics, and generic dictionary terms (false positives in non-fiction)
const ABSTRACT_AND_DICTIONARY_WORDS = new Set([
  // Thematic concepts (specifically reported by user)
  'matrimonio', 'matrimonios', 'ocupación', 'ocupacion', 'ocupaciones',
  'ahorro', 'ahorros', 'ambiente', 'ambientes', 'le',
  // Self-help, psychology, business, and philosophical concepts
  'educación', 'educacion', 'religión', 'religion', 'religiones',
  'política', 'politica', 'economía', 'economia', 'salud', 'dinero',
  'trabajo', 'trabajos', 'empleo', 'hábito', 'habito', 'hábitos', 'habitos',
  'miedo', 'miedos', 'temor', 'temores', 'fracaso', 'fracasos',
  'éxito', 'exito', 'éxitos', 'exitos', 'definición', 'definicion',
  'propósito', 'proposito', 'propósitos', 'propositos',
  'pensamiento', 'pensamientos', 'mente', 'mentes', 'cerebro',
  'libertad', 'justicia', 'verdad', 'verdades', 'mentira', 'mentiras',
  'deber', 'deberes', 'derecho', 'derechos', 'ley', 'leyes',
  'regla', 'reglas', 'principio', 'principios', 'causa', 'causas',
  'efecto', 'efectos', 'origen', 'destino', 'tiempo', 'tiempos',
  'vida', 'vidas', 'muerte', 'muertes', 'alma', 'almas',
  'espíritu', 'espiritu', 'espíritus', 'espiritus', 'conciencia',
  'fe', 'duda', 'dudas', 'deseo', 'deseos', 'voluntad', 'voluntades',
  'poder', 'poderes', 'fuerza', 'fuerzas', 'disciplina', 'autodisciplina',
  'conocimiento', 'conocimientos', 'sabiduría', 'sabiduria',
  'experiencia', 'experiencias', 'filosofía', 'filosofia', 'ciencia', 'ciencias',
  'historia', 'historias', 'futuro', 'pasado', 'presente',
  'familia', 'familias', 'sociedad', 'sociedades', 'gobierno', 'gobiernos',
  'estado', 'estados', 'iglesia', 'escuela', 'escuelas', 'universidad',
  'tema', 'temas', 'título', 'titulo', 'subtítulo', 'subtitulo',
  'caso', 'casos', 'ejemplo', 'ejemplos', 'lección', 'leccion', 'lecciones',
  'consejo', 'consejos', 'rutina', 'rutinas', 'meta', 'metas',
  'objetivo', 'objetivos', 'estrategia', 'estrategias', 'método', 'metodo', 'métodos', 'metodos',
  'fórmula', 'formula', 'fórmulas', 'formulas', 'secreto', 'secretos',
  'clave', 'claves', 'valor', 'valores', 'virtud', 'virtudes',
  'vicio', 'vicios', 'pasión', 'pasion', 'pasiones', 'emoción', 'emocion', 'emociones',
  'sentimiento', 'sentimientos', 'carácter', 'caracter', 'personalidad',
  'actitud', 'actitudes', 'creencia', 'creencias', 'opinión', 'opinion', 'opiniones',
  'ilusión', 'ilusion', 'realidad', 'realidades', 'naturaleza',
  'universo', 'mundo', 'mundos', 'tierra', 'cultura', 'arte',
  'música', 'musica', 'literatura', 'lenguaje', 'palabra', 'palabras',
  'voz', 'voces', 'silencio', 'soledad', 'paz', 'guerra', 'guerras',
  'conflicto', 'conflictos', 'problema', 'problemas', 'solución', 'solucion', 'soluciones',
  'razón', 'razon', 'razones', 'lógica', 'logica', 'intuición', 'intuicion',
  'instinto', 'instintos', 'memoria', 'imaginación', 'imaginacion',
  'atención', 'atencion', 'concentración', 'concentracion',
  'motivación', 'motivacion', 'inspiración', 'inspiracion', 'creatividad',
  'acción', 'accion', 'acciones', 'reacción', 'reaccion', 'resultado', 'resultados',
  'cambio', 'cambios', 'progreso', 'desarrollo', 'crecimiento',
  'derrota', 'derrotas', 'victoria', 'victorias', 'triunfo', 'triunfos',
  'obstáculo', 'obstaculo', 'obstáculos', 'obstaculos', 'dificultad', 'dificultades',
  'adversidad', 'oportunidad', 'oportunidades', 'riesgo', 'riesgos',
  'peligro', 'peligros', 'seguridad', 'confianza', 'autoestima',
  'respeto', 'honor', 'dignidad', 'orgullo', 'humildad',
  'paciencia', 'perseverancia', 'persistencia', 'resistencia',
  'lealtad', 'traición', 'traicion', 'amor', 'odio', 'ira', 'rabia',
  'rencor', 'envidia', 'celos', 'culpa', 'vergüenza', 'verguenza',
  'tristeza', 'alegría', 'alegria', 'felicidad', 'dolor', 'sufrimiento',
  'placer', 'gozo', 'esperanza', 'desesperación', 'desesperacion',
  'angustia', 'ansiedad', 'estrés', 'estres', 'calma', 'tranquilidad', 'serenidad',
  // Time units & calendar
  'lunes', 'martes', 'miércoles', 'miercoles', 'jueves', 'viernes', 'sábado', 'sabado', 'domingo',
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre',
  'mañana', 'manana', 'tarde', 'noche', 'mediodía', 'mediodia', 'medianoche',
  'hora', 'horas', 'minuto', 'minutos', 'segundo', 'segundos',
  'día', 'dia', 'días', 'dias', 'semana', 'semanas', 'mes', 'meses',
  'año', 'ano', 'años', 'anos', 'siglo', 'siglos', 'época', 'epoca',
  // Generic nouns & categories
  'hombre', 'hombres', 'mujer', 'mujeres', 'persona', 'personas',
  'gente', 'individuo', 'individuos', 'cosa', 'cosas', 'objeto', 'objetos',
  'lugar', 'lugares', 'sitio', 'sitios', 'forma', 'formas', 'manera', 'maneras',
  'modo', 'modos', 'tipo', 'tipos', 'clase', 'clases', 'grupo', 'grupos',
  'sistema', 'sistemas', 'orden', 'desorden', 'nivel', 'niveles',
  'grado', 'grados', 'número', 'numero', 'números', 'numeros',
  'punto', 'puntos', 'paso', 'pasos', 'fase', 'fases', 'libro', 'texto',
]);

const COMMON_FALSE_NAMES = new Set([
  'aquí', 'ahi', 'ahí', 'ahora', 'ayer', 'bien', 'bueno', 'claro', 'cómo', 'como',
  'cuando', 'donde', 'entonces', 'era', 'estaba', 'estoy', 'gracias', 'hace', 'hola',
  'hoy', 'jamás', 'luego', 'mientras', 'nada', 'nunca', 'porque', 'quizá', 'quizas',
  'quizás', 'siempre', 'tampoco', 'todavía', 'vamos', 'dijo', 'respondió', 'respondio',
  'preguntó', 'pregunto', 'contestó', 'contesto', 'exclamó', 'exclamo', 'gritó', 'grito',
  'susurró', 'susurro', 'murmuró', 'murmuro', 'replicó', 'replico', 'afirmó', 'afirmo',
  'está', 'esta', 'estoy', 'estaba', 'había', 'habia', 'hay', 'dice', 'dije', 'quiero',
  'puedo', 'debo', 'será', 'sera', 'tenía', 'tenia', 'narrador', 'narradora',
  // Problema 1: evitar que palabras funcionales capitalizadas al inicio de una línea sean personajes.
  'lo', 'ante', 'antes', 'durante', 'mediante', 'desde', 'hasta', 'hacia', 'según', 'segun',
  'bajo', 'contra', 'entre', 'ni', 'que', 'quien', 'quién', 'cual', 'cuál', 'cuales', 'cuáles',
  'su', 'sus', 'mi', 'mis', 'tu', 'tus', 'me', 'te', 'se', 'le', 'les', 'nos', 'os',
  'ellos', 'ellas', 'esto', 'eso', 'aquello', 'cada', 'ambos', 'ambas',
]);

// Valid interlocutor codes for interview & transcript formats
export const VALID_INTERLOCUTOR_CODES = new Set([
  'p', 'r', 'q', 'a', 'e', 'd', 'h', 'i', 'n', 'x', 'y',
  'dr', 'dra', 'sr', 'sra', 'prof',
  'pregunta', 'respuesta', 'entrevistador', 'entrevistada', 'entrevistado',
  'interlocutor', 'question', 'answer', 'interviewer',
]);

const NAME_PARTICLES = new Set(['de', 'del', 'la', 'las', 'los', 'y']);

// Roman numerals regex (I, II, III, IV, V, VI, VII, VIII, IX, X, XI, XII, etc.)
const ROMAN_NUMERAL_REGEX = /^[IVXLCDMivxlcdm]+$/;

// Spanish & English speech reporting verbs
const SPEECH_VERBS = [
  'dijo', 'dice', 'habló', 'hablo', 'habla', 'preguntó', 'pregunto', 'pregunta',
  'respondió', 'respondio', 'responde', 'contestó', 'contesto', 'contesta',
  'exclamó', 'exclamo', 'exclama', 'gritó', 'grito', 'grita', 'susurró', 'susurro', 'susurra',
  'murmuró', 'murmuro', 'murmura', 'añadió', 'anadio', 'añade', 'anade', 'replicó', 'replico', 'replica',
  'pensó', 'penso', 'piensa', 'comentó', 'comento', 'comenta',
  'ordenó', 'ordeno', 'ordena', 'inquirió', 'inquirio', 'sollozó', 'sollozo', 'repuso',
  'balbuceó', 'balbuceo', 'proclamó', 'proclamo', 'afirmó', 'afirmo', 'negó', 'nego', 'bramó',
  'decía', 'decia', 'decían', 'decian', 'gritaba', 'gritaban', 'preguntaba', 'preguntaban',
  'respondía', 'respondia', 'respondían', 'respondian', 'susurraba', 'susurraban',
  'murmuraba', 'murmuraban', 'exclamaba', 'exclamaban', 'apuntó', 'apunto', 'aseguró', 'aseguro',
  'said', 'says', 'asked', 'asks', 'answered', 'replied', 'shouted', 'whispered',
  'muttered', 'exclaimed', 'called', 'cried', 'thought',
];

const EMOTION_MAP: Record<string, string> = {
  incertidumbre: 'nervioso',
  incierto: 'nervioso',
  incierta: 'nervioso',
  dudando: 'nervioso',
  triste: 'triste',
  tristeza: 'triste',
  llorando: 'triste',
  pena: 'triste',
  melancólico: 'triste',
  melancolico: 'triste',
  desolado: 'triste',
  deprimido: 'triste',
  alegre: 'alegre',
  alegría: 'alegre',
  alegria: 'alegre',
  feliz: 'alegre',
  felicidad: 'alegre',
  contento: 'alegre',
  contenta: 'alegre',
  contentos: 'alegre',
  contentas: 'alegre',
  emocionado: 'alegre',
  emocionada: 'alegre',
  riendo: 'riendo',
  risa: 'riendo',
  carcajada: 'riendo',
  'a carcajadas': 'riendo',
  sollozando: 'sollozando',
  sollozo: 'sollozando',
  'entre sollozos': 'sollozando',
  'voz entrecortada y llanto': 'sollozando',
  'llorando de felicidad': 'alegre',
  'llanto de felicidad': 'alegre',
  'de dolor': 'dolor',
  'con dolor': 'dolor',
  gimiendo: 'dolor',
  gemido: 'dolor',
  quejándose: 'dolor',
  quejandose: 'dolor',
  tartamudeando: 'tartamudeando',
  tartamudeo: 'tartamudeando',
  tímido: 'tartamudeando',
  timido: 'tartamudeando',
  tímida: 'tartamudeando',
  timida: 'tartamudeando',
  sonriendo: 'alegre',
  entusiasta: 'alegre',
  animado: 'alegre',
  jocoso: 'alegre',
  enojado: 'enojado',
  enojada: 'enojado',
  enfadado: 'enojado',
  enfadada: 'enojado',
  furioso: 'enojado',
  furiosa: 'enojado',
  furia: 'enojado',
  ira: 'enojado',
  molesto: 'enojado',
  gritando: 'enojado',
  rabia: 'enojado',
  susurro: 'susurro',
  susurrando: 'susurro',
  'en voz baja': 'susurro',
  quedo: 'susurro',
  secreto: 'susurro',
  épico: 'épico',
  epico: 'épico',
  solemne: 'épico',
  heroico: 'épico',
  majestuoso: 'épico',
  misterioso: 'misterioso',
  siniestro: 'misterioso',
  oscuro: 'misterioso',
  tembloroso: 'miedo',
  temblorosa: 'miedo',
  'voz temblorosa': 'miedo',
  'voz rota': 'sollozando',
  rota: 'sollozando',
  baja: 'susurro',
  bajo: 'susurro',
  jadeando: 'jadeando',
  jadendo: 'jadeando',
  jadeaba: 'jadeando',
  jadeo: 'jadeando',
  'sin aliento': 'jadeando',
  'respirando con dificultad': 'jadeando',
  agotado: 'jadeando',
  agotada: 'jadeando',
  cansado: 'jadeando',
  cansada: 'jadeando',
  miedo: 'miedo',
  sorpresa: 'sorpresa',
  sorprendido: 'sorpresa',
  sorprendida: 'sorpresa',
  asombrado: 'sorpresa',
  asombrada: 'sorpresa',
};

export interface DetectionResult {
  sentences: ParsedSentence[];
  characters: DetectedCharacter[];
}

export function getCharacterId(name: string): string {
  const normalized = normalizeCharName(name).toLocaleLowerCase('es');
  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index++) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `character_${(hash >>> 0).toString(36)}`;
}

function stutterFirstWord(text: string): string {
  return text.replace(/^(\s*)([\p{L}]+)(?=\b)/u, (_match, leading: string, word: string) => {
    const first = word.match(/^[bcdfghjklmnñpqrstvwxyz]/iu)?.[0]
      ?? word.match(/^[aeiouáéíóúü][\p{L}]?/iu)?.[0];
    return first ? `${leading}${first}-${word}` : `${leading}${word}`;
  });
}

export interface DialogueContext {
  activeCharacter?: string;
  emotionByCharacter?: Record<string, string>;
}

/**
 * Validates whether a candidate string is a plausible character name
 * and NOT a heading, number, chapter, Roman numeral, common word, or abstract concept.
 */
export function isValidCharacterName(candidate: string, isStructuredInterlocutor = false): boolean {
  const trimmed = candidate.trim().replace(/^[-—«"\s]+|[-—»"\s:]+$/g, '');
  if (!trimmed) return false;

  const lower = trimmed.toLowerCase();

  // Problema 3: solo códigos y rótulos explícitos de entrevista omiten los filtros de nombres.
  if (VALID_INTERLOCUTOR_CODES.has(lower.replace(/\.$/u, ''))) {
    return true;
  }

  // Minimum length for standard names is 2 chars, max 30
  if (trimmed.length < 2 || trimmed.length > 30) return false;

  // Cannot contain numbers
  if (/\d/.test(trimmed)) return false;

  // Cannot be a Roman numeral
  if (ROMAN_NUMERAL_REGEX.test(trimmed)) return false;

  // Check against blacklisted heading words
  if (BLACKLIST_WORDS.has(lower)) return false;

  // Check against abstract concepts and dictionary words (e.g. Matrimonio, Ocupación, Ahorros, Ambiente)
  if (ABSTRACT_AND_DICTIONARY_WORDS.has(lower)) return false;

  // Check against common false names (adverbs, pronouns, auxiliary verbs)
  if (COMMON_FALSE_NAMES.has(lower)) return false;

  // Must begin with an uppercase letter
  if (!/^[A-ZÁÉÍÓÚÑÜ]/.test(trimmed)) return false;

  // Cannot contain URLs, file extensions or punctuation
  if (/[\/\\]|\.pdf|\.txt|\.org|\.com|[{}<>@#$%^&*+=~`.,:;!?()[\]"]/i.test(trimmed)) return false;

  // Allow up to three name parts plus common surname particles
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length > 5 || words.filter(word => !NAME_PARTICLES.has(word.toLowerCase())).length > 3) return false;

  // Every word in a multi-word name must start with uppercase (or be a particle)
  if (words.some((word) =>
    !NAME_PARTICLES.has(word.toLowerCase()) &&
    !/^[A-ZÁÉÍÓÚÑÜ][\p{L}'’-]*$/u.test(word)
  )) return false;

  // No word in the name can be an abstract concept or blacklisted term
  if (words.some(word =>
    ABSTRACT_AND_DICTIONARY_WORDS.has(word.toLowerCase()) ||
    BLACKLIST_WORDS.has(word.toLowerCase()) ||
    COMMON_FALSE_NAMES.has(word.toLowerCase())
  )) return false;

  return true;
}

/**
 * Checks if a text segment following a colon is an expository definition or bullet item
 * rather than spoken dialogue.
 */
function isExpositoryDefinition(text: string): boolean {
  const trimmed = text.trim();
  return /^(?:(?:Es|Son|Consiste en|Se define como|Se refiere a|Cualquier|El acto de|La acción de|La costumbre de|Un conjunto de|Las fuerzas que|Los problemas de|Una forma de|Tiene por objeto|Implica|Significa)\b|(?:\d+[\s.)]))/iu.test(trimmed);
}

/**
 * Normalizes a character name, maintaining title casing and formatting single-letter interlocutors cleanly.
 */
export function normalizeCharName(raw: string): string {
  const cleaned = raw.trim().replace(/^[-—«"\s]+|[-—»"\s:]+$/g, '');
  if (!cleaned) return '';

  const lower = cleaned.toLowerCase();
  // Standard interview single letters should remain uppercase (P, R, Q, A, etc.)
  if (['p', 'r', 'q', 'a', 'e', 'd', 'h', 'i', 'n', 'x', 'y'].includes(lower)) {
    return cleaned.toUpperCase();
  }
  if (lower === 'dr' || lower === 'dr.') return 'Dr.';
  if (lower === 'dra' || lower === 'dra.') return 'Dra.';
  if (lower === 'sr' || lower === 'sr.') return 'Sr.';
  if (lower === 'sra' || lower === 'sra.') return 'Sra.';
  if (lower === 'prof' || lower === 'prof.') return 'Prof.';

  return cleaned
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => {
      const wLower = word.toLowerCase();
      if (index > 0 && NAME_PARTICLES.has(wLower)) return wLower;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * Extracts emotional keywords from parentheticals and strips them from the spoken text.
 */
export function extractEmotionAndClean(rawText: string): { cleanText: string; emotion?: string } {
  let emotion: string | undefined;

  const parentheticalRegex = /\(([^)]+)\)/g;
  let match: RegExpExecArray | null;

  while ((match = parentheticalRegex.exec(rawText)) !== null) {
    const inside = match[1].toLowerCase();
    for (const [trigger, mappedEmotion] of Object.entries(EMOTION_MAP)) {
      if (inside.includes(trigger)) {
        emotion = mappedEmotion;
        break;
      }
    }
  }

  // Remove parentheticals and square brackets so they are NOT spoken aloud
  let clean = rawText
    .replace(/\([^)]*\)/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return { cleanText: clean, emotion };
}

/**
 * Multi-format universal dialogue parser:
 * Simultaneously parses traditional dash dialogues, quoted dialogues, interview formats (P:/R:),
 * and editorial notes, with strict filtering of abstract concepts.
 */
export function detectCharactersAndParse(
  rawText: string,
  pageNumber = 1,
  context: DialogueContext = {},
): DetectionResult {
  const paragraphs = rawText.replace(/\r\n?/g, '\n').split(/\n{2,}/);
  const charFrequency = new Map<string, number>();
  const sentences: ParsedSentence[] = [];
  let sentenceIdx = 0;

  const appendSegment = (
    originalText: string,
    character: string | undefined,
    emotion: string | undefined,
    paragraphIndex: number,
    narratorAnnouncement?: string,
    spokenText?: string,
    displaySource?: string,
  ) => {
    const text = removeNonSpokenCues(originalText);
    const parts = splitIntoSentences(text);
    const displayParts = splitDisplaySentences(displaySource ?? originalText);
    const spokenParts = spokenText ? splitIntoSentences(spokenText) : parts;
    for (let partIndex = 0; partIndex < parts.length; partIndex++) {
      const part = parts[partIndex];
      const words = part.split(/\s+/).filter(Boolean);
      sentences.push({
        index: sentenceIdx++,
        pageNumber,
        text: part,
        displayText: displayParts[partIndex] ?? part,
        spokenText: spokenText && spokenParts[partIndex] !== part
          ? spokenParts[partIndex]
          : undefined,
        rawOriginalText: part,
        character,
        characterId: character ? getCharacterId(character) : undefined,
        emotion: character ? emotion : emotion ?? detectEmotion(originalText),
        narratorAnnouncement: partIndex === 0 ? narratorAnnouncement : undefined,
        isNarration: !character,
        words,
        isParagraphStart: sentences.length === 0 ||
          sentences[sentences.length - 1].paragraphIndex !== paragraphIndex,
        paragraphIndex,
      });
      if (character) charFrequency.set(character, (charFrequency.get(character) ?? 0) + 1);
    }
  };

  paragraphs.forEach((paragraph, paragraphIndex) => {
    for (const rawLine of paragraph.split('\n')) {
      const line = rawLine.trim();
      if (!line) continue;

      // 1. Editorial Notes & Commentary (e.g. "Nota de Sharon:", "Comentario de Sharon:", "Sharon dice:")
      const editorialMatch = line.match(
        /^(?:(?:Nota|Comentario|Apunte|Reflexión|Reflexion)\s+de(?:l|\s+la)?\s+([A-ZÁÉÍÓÚÑÜ][\p{L}'’-]*(?:\s+[A-ZÁÉÍÓÚÑÜ][\p{L}'’-]*){0,2})|([A-ZÁÉÍÓÚÑÜ][\p{L}'’-]*(?:\s+[A-ZÁÉÍÓÚÑÜ][\p{L}'’-]*){0,2})\s+(?:dice|comenta|anota|explica|agrega|puntualiza))\s*:\s*(.+)$/u
      );
      if (editorialMatch) {
        const candidateSpeaker = (editorialMatch[1] || editorialMatch[2] || '').trim();
        const speaker = normalizeCharName(candidateSpeaker);
        if (isValidCharacterName(speaker, true)) {
          context.activeCharacter = speaker;
          const speech = editorialMatch[3].trim();
          const announcement = line.slice(0, line.indexOf(':')).trim();
          const dialogueParts = splitDialogueCues(speech, speaker, context, '');
          for (const part of dialogueParts) {
            appendSegment(
              part.text,
              speaker,
              part.emotion,
              paragraphIndex,
              part.announcement || announcement,
              part.spokenText,
              part.displayText,
            );
          }
          continue;
        }
      }

      // 2. Interlocutor Prefixes for Interviews & Biographies (e.g. "P:", "R:", "Q:", "A:", "Dr:", "P.-", "R.-")
      const interlocutorMatch = line.match(
        /^(?:(?<codeOption>[A-ZÁÉÍÓÚÑÜ]{1,2}|Dr|Dra|Sr|Sra|Prof|Pregunta|Respuesta|Entrevistador|Entrevistada|Entrevistado|Question|Answer)(?:\.|\.-|:)\s+|(?<colonOption>[A-ZÁÉÍÓÚÑÜ]{1,2}|Dr\.|Dra\.|Sr\.|Sra\.|Prof\.|Pregunta|Respuesta|Entrevistador|Entrevistada|Entrevistado|Question|Answer):\s*)(?<speech>.+)$/u
      );
      if (interlocutorMatch) {
        const rawCode = (interlocutorMatch.groups?.codeOption || interlocutorMatch.groups?.colonOption || '').replace(/[.:-]/g, '').trim();
        const speaker = normalizeCharName(rawCode);
        if (isValidCharacterName(speaker, true)) {
          context.activeCharacter = speaker;
          const speech = interlocutorMatch.groups?.speech.trim() || '';
          const dialogueParts = splitDialogueCues(speech, speaker, context, '');
          for (const part of dialogueParts) {
            appendSegment(
              part.text,
              speaker,
              part.emotion,
              paragraphIndex,
              part.announcement,
              part.spokenText,
              part.displayText,
            );
          }
          continue;
        }
      }

      // 3. Screenplay / Theatrical Script Format (CHARACTER_NAME: Speech)
      // Strictly validated to exclude abstract nouns, headings, and expository definitions
      const scriptMatch = line.match(
        /^([A-ZÁÉÍÓÚÑÜ][\p{L}'’-]*(?:\s+(?:(?:de|del|la|las|los|y)\s+)?[A-ZÁÉÍÓÚÑÜ][\p{L}'’-]*){0,3})(?:\s*\(([^)]*)\))?\s*:\s*(.+)$/u
      );
      if (scriptMatch) {
        const label = scriptMatch[1].trim();
        const candidate = normalizeCharName(label);
        const speechText = scriptMatch[3].trim();
        // Discard abstract concepts ("Matrimonio:", "Ahorros:", "Ambiente:", "Ocupación:") or definitions
        if (
          isValidCharacterName(candidate, false) &&
          !isExpositoryDefinition(speechText)
        ) {
          context.activeCharacter = candidate;
          const dialogueParts = splitDialogueCues(
            speechText,
            candidate,
            context,
            scriptMatch[2] ?? '',
          );
          for (const part of dialogueParts) {
            appendSegment(
              part.text,
              candidate,
              part.emotion,
              paragraphIndex,
              part.announcement,
              part.spokenText,
              part.displayText,
            );
          }
          continue;
        }
      }

      const leadingAttribution = parseLeadingAttribution(line, context);
      if (leadingAttribution) {
        const dialogueParts = splitDialogueCues(
          leadingAttribution.speech,
          leadingAttribution.character,
          context,
          leadingAttribution.cue,
        );
        for (const part of dialogueParts) {
          appendSegment(
            part.text,
            leadingAttribution.character,
            part.emotion,
            paragraphIndex,
            part.announcement,
            part.spokenText,
            part.displayText,
          );
        }
        continue;
      }

      // 4. Attributed Quotes (e.g. "Hola", dijo María / María dijo: "Hola")
      const attributedQuotes = parseAttributedQuotes(line, context);
      if (attributedQuotes) {
        for (const node of attributedQuotes) {
          appendSegment(
            node.text,
            node.type === 'dialogue' ? node.character : undefined,
            node.type === 'dialogue' ? node.emotion : undefined,
            paragraphIndex,
            node.type === 'dialogue' ? node.announcement : undefined,
            node.type === 'dialogue' ? node.spokenText : undefined,
            node.displayText,
          );
        }
        continue;
      }

      // 5. Attributed Em-Dashes (e.g. —Hola —dijo Juan—, ¿cómo estás?)
      const attributedDash = parseAttributedEmDash(line, context);
      if (attributedDash) {
        for (const node of attributedDash) {
          appendSegment(
            node.text,
            node.type === 'dialogue' ? node.character : undefined,
            node.type === 'dialogue' ? node.emotion : undefined,
            paragraphIndex,
            node.type === 'dialogue' ? node.announcement : undefined,
            node.type === 'dialogue' ? node.spokenText : undefined,
            node.displayText,
          );
        }
        continue;
      }

      // 6. Continued Dialogue under established Active Speaker
      const activeSpeaker = context.activeCharacter;
      const leadingDialogue = line.match(/^[-—–-―]\s*(.+)$/u);
      if (activeSpeaker && leadingDialogue && isValidCharacterName(activeSpeaker, true)) {
        const dialogueParts = splitDialogueCues(leadingDialogue[1], activeSpeaker, context, '')
        for (const [partIndex, part] of dialogueParts.entries()) {
          appendSegment(
            part.text,
            activeSpeaker,
            part.emotion,
            paragraphIndex,
            part.announcement,
            part.spokenText,
            `${partIndex === 0 ? line[0] : ''}${part.displayText ?? part.text}`,
          );
        }
        continue;
      }

      const standaloneQuotedDialogue = line.match(/^[«“"](.+)[»”"]$/u);
      if (activeSpeaker && standaloneQuotedDialogue && isValidCharacterName(activeSpeaker, true)) {
        const dialogueParts = splitDialogueCues(standaloneQuotedDialogue[1], activeSpeaker, context, '')
        for (const [partIndex, part] of dialogueParts.entries()) {
          appendSegment(
            part.text,
            activeSpeaker,
            part.emotion,
            paragraphIndex,
            part.announcement,
            part.spokenText,
            `${partIndex === 0 ? line[0] : ''}${part.displayText ?? part.text}${partIndex === dialogueParts.length - 1 ? line[line.length - 1] : ''}`,
          );
        }
        continue;
      }

      // 7. Narration (Expository paragraphs, descriptions, section headings, definitions)
      appendSegment(line, undefined, detectEmotion(line), paragraphIndex);
    }
  });

  // Filter out any invalid characters, keeping only genuine characters and valid interlocutors
  const characters: DetectedCharacter[] = Array.from(charFrequency.entries())
    .filter(([name, count]) => isValidCharacterName(name, true) && count >= 1)
    .map(([name, count], i) => ({
      characterId: getCharacterId(name),
      name,
      emoji: CHAR_EMOJIS[i % CHAR_EMOJIS.length],
      color: CHAR_COLORS[i % CHAR_COLORS.length],
      lineCount: count,
    }))
    .sort((a, b) => b.lineCount - a.lineCount);

  return { sentences, characters };
}

type DialogueNode =
  | { type: 'narration'; text: string; displayText?: string }
  | { type: 'dialogue'; text: string; character: string; emotion?: string; announcement?: string; spokenText?: string; displayText?: string };

function narrationNode(text: string): DialogueNode | null {
  const cleaned = removeNonSpokenCues(text);
  return cleaned ? { type: 'narration', text: cleaned, displayText: text.trim() } : null;
}

interface DialogueTextPart {
  text: string;
  displayText?: string;
  spokenText?: string;
  emotion?: string;
  announcement?: string;
}

function splitDialogueCues(
  rawText: string,
  character: string,
  context: DialogueContext,
  initialCue: string,
): DialogueTextPart[] {
  // Problema TTS: preserve bracketed action cues for the voice-assignment and effects stage.
  let emotion = getActiveCharacterEmotion(context, character, detectEmotion(initialCue));
  let pendingCue = initialCue.trim();
  let stutterNext = detectEmotion(initialCue) === 'tartamudeando';
  let hasSpoken = false;
  const parts: DialogueTextPart[] = [];
  let pendingDisplayCue = '';

  for (const token of rawText.split(/(\([^)]*\)|\[[^\]]*\]|\{[^}]*\})/gu)) {
    if (/^(?:\([^)]*\)|\[[^\]]*\]|\{[^}]*\})$/u.test(token)) {
      pendingDisplayCue += token;
      const cue = token.slice(1, -1).trim();
      if (!cue) continue;
      pendingCue = [pendingCue, cue].filter(Boolean).join(' ');
      const cueEmotion = detectEmotion(cue);
      emotion = getActiveCharacterEmotion(context, character, cueEmotion) ?? emotion;
      if (cueEmotion === 'tartamudeando') stutterNext = true;
      continue;
    }

    const text = stripWrappingQuotes(token).trim();
    if (!text) continue;
    parts.push({
      text,
      displayText: `${pendingDisplayCue}${token}`.trim(),
      spokenText: stutterNext ? stutterFirstWord(text) : undefined,
      emotion,
      announcement: pendingCue
        ? hasSpoken
          ? stripNonSpeechAnnotations(pendingCue)
          : buildAnnouncement(character, pendingCue)
        : hasSpoken
          ? undefined
          : buildAnnouncement(character, ''),
    });
    pendingDisplayCue = '';
    hasSpoken = true;
    stutterNext = false;
    pendingCue = '';
  }

  if (pendingDisplayCue && parts.length > 0) {
    parts[parts.length - 1].displayText = `${parts[parts.length - 1].displayText ?? parts[parts.length - 1].text} ${pendingDisplayCue}`.trim()
  }

  return parts;
}

function parseAttributedQuotes(line: string, context: DialogueContext): DialogueNode[] | null {
  const quotePattern = /([«“"])([^»”"]+)[»”"]/g;
  let match: RegExpExecArray | null;
  let cursor = 0;
  let found = false;
  const segments: DialogueNode[] = [];
  while ((match = quotePattern.exec(line)) !== null) {
    const suffixStart = quotePattern.lastIndex;
    const nextQuoteOffset = line.slice(suffixStart).search(/[«“"]/);
    const suffixEnd = nextQuoteOffset < 0 ? line.length : suffixStart + nextQuoteOffset;
    const suffix = line.slice(suffixStart, suffixEnd);
    const suffixAttribution = parseAttribution(suffix);
    const prefixText = line.slice(cursor, match.index);
    const prefixAttribution = parseLeadingQuoteAttribution(prefixText, context);
    const attribution = suffixAttribution ?? prefixAttribution;
    if (!attribution) continue;

    found = true;
    const prefix = narrationNode(prefixAttribution ? prefixAttribution.remainingText : prefixText);
    if (prefix) segments.push(prefix);
    const dialogueParts = splitDialogueCues(
      match[2],
      attribution.character,
      context,
      attribution.cue,
    );
    for (const [partIndex, part] of dialogueParts.entries()) {
      if (part.text) {
        segments.push({
          type: 'dialogue',
          text: part.text,
          displayText: `${partIndex === 0 ? match[1] : ''}${part.displayText ?? part.text}${partIndex === dialogueParts.length - 1 ? match[0].slice(-1) : ''}`,
          spokenText: part.spokenText,
          character: attribution.character,
          emotion: part.emotion,
          announcement: part.announcement,
        });
      }
    }
    context.activeCharacter = attribution.character;
    cursor = suffixAttribution
      ? suffixStart + suffixAttribution.consumedLength
      : match.index + match[0].length;
    quotePattern.lastIndex = cursor;
  }

  if (!found) return null;
  const trailing = narrationNode(line.slice(cursor));
  if (trailing) segments.push(trailing);
  return segments;
}

function parseLeadingAttribution(
  line: string,
  context: DialogueContext,
): (Attribution & { speech: string }) | null {
  // Prosody: resolve both speaker-first and cue-first reporting styles before treating text as narration.
  const verbs = SPEECH_VERBS.join('|');
  const cueFirst = line.match(new RegExp(
    `^(?<cue>(?:(?:hablando|pensando|reflexionando|sonriendo|gritando|susurrando)\\s+)?(?:con|en)\\s+(?:(?:un|una)\\s+)?(?:voz|tono)\\s+[^,;]+|(?:hablando|pensando|reflexionando)\\s+(?:con|en)\\s+[^,;]+|(?:con|en)\\s+[^,;]+),?\\s+(?<speaker>[\\p{Lu}][\\p{L}'’-]*(?:\\s+(?:(?:de|del|la|las|los|y)\\s+)?[\\p{Lu}][\\p{L}'’-]*){0,3})\\s+(?:${verbs})(?:ía|aban|aba|ían|an|a|ó|ieron|ió|e|en|o)?\\s*[:,—–-]\\s*(?<speech>[\\s\\S]+)$`,
    'iu',
  ));
  if (cueFirst?.groups?.speaker && cueFirst.groups.speech) {
    const character = normalizeCharName(cueFirst.groups.speaker);
    if (isValidCharacterName(character)) {
      context.activeCharacter = character;
      return {
        character,
        consumedLength: line.length - cueFirst.groups.speech.length,
        cue: extractAttributionCue(cueFirst.groups.cue ?? ''),
        speech: cueFirst.groups.speech.trim(),
      };
    }
  }

  const prefix = line.match(
    /^([\p{Lu}][\p{L}'’-]*(?:\s+(?:(?:de|del|la|las|los|y)\s+)?[\p{Lu}][\p{L}'’-]*){0,3})([\s\S]*)$/u,
  );
  if (!prefix) return null;
  const character = normalizeCharName(prefix[1]);
  if (!isValidCharacterName(character)) return null;

  const remainder = prefix[2];
  const attribution = remainder.match(new RegExp(
    `^[\\s,;—–-]*(?<cue>[^:—–-]*?)\\s*(?<verb>${verbs})(?:ía|aban|aba|ían|an|a|ó|ieron|ió|e|en|o)?(?<afterCue>\\s+[^:—–-]+)?\\s*[:,—–-]\\s*(?<speech>[\\s\\S]+)$`,
    'iu',
  ));
  if (!attribution?.groups?.speech) return null;

  const cueText = [attribution.groups.cue, attribution.groups.afterCue].filter(Boolean).join(' ').trim();
  const cue = extractAttributionCue(cueText);

  context.activeCharacter = character;
  return {
    character,
    consumedLength: line.length - attribution.groups.speech.length,
    cue,
    speech: attribution.groups.speech.trim(),
  };
}

interface Attribution {
  character: string;
  consumedLength: number;
  cue: string;
}

function parseAttribution(text: string): Attribution | null {
  const verbs = SPEECH_VERBS.join('|');
  const verbMatch = text.match(new RegExp(
    `^[-\\s,;:—–-―]*(?:(?:se|me|te|le|les)\\s+)?(?:${verbs})(?:ía|aban|aba|ían|an|a|ó|ieron|ió|e|en|o|ieron)?\\s+`,
    'iu',
  ));
  if (!verbMatch) return null;
  const afterVerb = text.slice(verbMatch[0].length);
  const nameMatch = afterVerb.match(
    /^([A-ZÁÉÍÓÚÑÜ][\p{L}'’-]*(?:\s+(?:(?:(?:de|del|la|las|los|y)\s+){0,2})[A-ZÁÉÍÓÚÑÜ][\p{L}'’-]*){0,3})/u
  );
  if (!nameMatch) return null;
  const character = normalizeCharName(nameMatch[1]);
  if (!isValidCharacterName(character)) return null;
  const afterName = afterVerb.slice(nameMatch[0].length);
  const parentheticalCue = afterName.match(/^\s+(\([^)]*\))/u);
  const spokenCuePhrase = parentheticalCue ? '' : findEmotionCuePhrase(afterName);
  const spokenCue = spokenCuePhrase
    ? stripNonSpeechAnnotations(spokenCuePhrase)
    : undefined;
  const cue = parentheticalCue?.[1].replace(/[()]/g, '').trim() ?? spokenCue ?? '';
  const remainder = parentheticalCue
    ? afterName.slice(parentheticalCue[0].length)
    : spokenCuePhrase
      ? afterName.replace(spokenCuePhrase, '')
      : afterName;
  const consumedLength = verbMatch[0].length + nameMatch[0].length +
    (parentheticalCue?.[0].length ?? spokenCuePhrase.length) +
    (remainder.match(/^\s*[.!?…]/u)?.[0].length ?? 0);
  return {
    character,
    consumedLength,
    cue,
  };
}

function parseLeadingQuoteAttribution(
  text: string,
  context: DialogueContext,
): (Attribution & { remainingText: string }) | null {
  const verbs = SPEECH_VERBS.join('|');
  const namedSpeaker = text.match(new RegExp(
    `([A-ZÁÉÍÓÚÑÜ][\\p{L}'’-]*(?:\\s+(?:(?:de|del|la|las|los|y)\\s+)?[A-ZÁÉÍÓÚÑÜ][\\p{L}'’-]*){0,3})\\s+(?:${verbs})\\s*:\\s*$`,
    'iu',
  ));
  const strictName = namedSpeaker ? findTrailingCharacterName(namedSpeaker[1]) : null;
  if (namedSpeaker && namedSpeaker.index !== undefined && strictName) {
    const character = normalizeCharName(strictName);
    const nameStart = namedSpeaker[1].lastIndexOf(strictName);
    return {
      character,
      consumedLength: 0,
      cue: '',
      remainingText: text.slice(0, namedSpeaker.index + nameStart),
    };
  }

  const match = text.match(
    /((?:él|ella|ellos|ellas|he|she|they)\s+)?(?:dijo|dijeron|respondió|respondieron|preguntó|preguntaron|exclamó|exclamaron|said|asked|replied|answered|shouted|whispered)\s*:\s*$/iu,
  );
  if (!match || !context.activeCharacter || !isValidCharacterName(context.activeCharacter)) return null;
  return {
    character: context.activeCharacter,
    consumedLength: 0,
    cue: '',
    remainingText: text.slice(0, match.index),
  };
}

function parseAttributedEmDash(line: string, context: DialogueContext): DialogueNode[] | null {
  const verbs = SPEECH_VERBS.join('|');
  const match = line.match(new RegExp(
    `^(?:-|—|–|―)?\\s*([\\s\\S]+?)\\s*(?:-|—|–|―)\\s*([.!?,;:…]*)\\s*((?:(?:se|me|te|le|les)\\s+)?(?:${verbs})(?:ía|aban|aba|ían|an|a|ó|ieron|ió|e|en|o)?)\\s+([A-ZÁÉÍÓÚÑÜ][\\p{L}'’-]*(?:\\s+(?:(?:(?:de|del|la|las|los|y)\\s+){0,2})[A-ZÁÉÍÓÚÑÜ][\\p{L}'’-]*){0,3})(?:\\s*(?:-|—|–|―))?([\\s\\S]*)$`,
    'iu'
  ));
  if (!match) return null;
  const strictName = extractStrictNamePrefix(match[4]);
  if (!strictName || !isValidCharacterName(strictName)) return null;
  const character = normalizeCharName(strictName);
  const trailingAttributionText = `${match[4].slice(strictName.length)} ${match[5]}`;
  const emotionCuePhrase = findEmotionCuePhrase(trailingAttributionText);
  const trailingCue = extractAttributionCue(trailingAttributionText);
  const dialogueParts = splitDialogueCues(
    `${match[1]}${match[2]}`,
    character,
    context,
    trailingCue,
  );
  const narrationText = stripEmotionAttribution(
    emotionCuePhrase
      ? trailingAttributionText.replace(emotionCuePhrase, '')
      : trailingAttributionText.replace(trailingCue, ''),
  ).replace(/^[\s.,;:!?…—–-―]+|[\s.,;:!?…—–-―]+$/gu, '').trim();
  const nodes: DialogueNode[] = dialogueParts.map(part => ({
    type: 'dialogue',
    text: part.text,
    displayText: part.displayText,
    spokenText: part.spokenText,
    character,
    emotion: part.emotion,
    announcement: part.announcement,
  }));
  const narratorNode = narrationNode(narrationText);
  if (narratorNode) nodes.push(narratorNode);
  context.activeCharacter = character;
  return nodes;
}

function extractStrictNamePrefix(candidate: string): string | null {
  const nameParts: string[] = [];
  for (const part of candidate.trim().split(/\s+/)) {
    if (NAME_PARTICLES.has(part.toLocaleLowerCase('es')) && nameParts.length > 0) {
      nameParts.push(part);
      continue;
    }
    if (!/^[A-ZÁÉÍÓÚÑÜ][\p{L}'’-]*$/u.test(part)) break;
    nameParts.push(part);
  }
  const name = nameParts.join(' ');
  return name && nameParts.some(part => !NAME_PARTICLES.has(part.toLocaleLowerCase('es')))
    ? name
    : null;
}

function findTrailingCharacterName(candidate: string): string | null {
  const parts = candidate.trim().split(/\s+/);
  for (let start = 0; start < parts.length; start++) {
    const name = parts.slice(start).join(' ');
    if (extractStrictNamePrefix(name) === name && isValidCharacterName(name)) return name;
  }
  return null;
}

function buildAnnouncement(character: string, cue: string): string {
  const cleanCue = stripNonSpeechAnnotations(cue).replace(/\s+/g, ' ').trim();
  return cleanCue ? `${character}: ${cleanCue}` : character;
}

function getActiveCharacterEmotion(
  context: DialogueContext,
  character: string,
  detectedEmotion?: string,
): string | undefined {
  const emotions = context.emotionByCharacter ?? (context.emotionByCharacter = {});
  const key = character.toLocaleLowerCase('es');
  if (detectedEmotion) emotions[key] = detectedEmotion;
  return emotions[key];
}

function extractAllParentheticalCues(text: string): string[] {
  return Array.from(text.matchAll(/\(([^)]*)\)/gu), match => match[1].trim()).filter(Boolean);
}

function extractAttributionCue(text: string): string {
  const parentheticalCues = extractAllParentheticalCues(text);
  if (parentheticalCues.length > 0) return parentheticalCues.join(' ');
  return findEmotionCuePhrase(text);
}

function extractSpokenEmotionCue(text: string): string {
  const emotionTerms = Object.keys(EMOTION_MAP)
    .sort((left, right) => right.length - left.length)
    .map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  return text.match(new RegExp(
    `\\b(?:con|en)\\s+(?:(?:un\\s+|una\\s+)?(?:voz|tono)\\s+[^—–-―,;.!?]+|(?:${emotionTerms})\\b)|\\b(?:hablando|habla|habló|hablo|pensando|pensó|penso|reflexionando)\\s+(?:con|en)\\s+(?:${emotionTerms})\\b`,
    'iu',
  ))?.[0]?.trim() ?? '';
}

function findEmotionCuePhrase(text: string): string {
  const cue = extractSpokenEmotionCue(text) || extractBareEmotionCue(text)
  if (!cue) return ''
  const cueIndex = text.toLocaleLowerCase('es').indexOf(cue.toLocaleLowerCase('es'))
  if (cueIndex < 0) return ''
  let start = cueIndex
  const prefix = text.slice(0, cueIndex)
  const whileMatch = prefix.match(/\bmientras\s*$/iu)
  if (whileMatch?.index !== undefined) start = whileMatch.index
  while (start > 0 && /\s/u.test(text[start - 1])) start--
  let end = cueIndex + cue.length
  const qualifier = text.slice(end).match(/^\s+(?:de|con)\s+(?:cansancio|agotamiento|dolor|dificultad para respirar)\b/iu)
  if (qualifier) end += qualifier[0].length
  return text.slice(start, end).trim()
}

function extractBareEmotionCue(text: string): string {
  const terms = Object.keys(EMOTION_MAP)
    .sort((left, right) => right.length - left.length)
    .map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  return text.match(new RegExp(`\\b(?:${terms})\\b`, 'iu'))?.[0] ?? '';
}

function stripWrappingQuotes(text: string): string {
  return text.trim().replace(/^[«“"‘']|[»”"’']$/gu, '').trim();
}

function stripNonSpeechAnnotations(text: string): string {
  return text.replace(/\([^)]*\)|\[[^\]]*\]/gu, ' ').replace(/\s+/g, ' ').trim();
}

function stripEmotionAttribution(text: string): string {
  const emotionWords = Object.keys(EMOTION_MAP)
    .sort((left, right) => right.length - left.length)
    .map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  return text.replace(
    new RegExp(`^\\s*(?:con\\s+(?:(?:voz|tono)\\s+)?)?(?:muy\\s+)?(?:${emotionWords})\\s*(?:[—–-―]\\s*)?[,;:]?\\s*`, 'iu'),
    '',
  );
}

function detectEmotion(text: string): string | undefined {
  const normalized = text.toLocaleLowerCase('es');
  if (/\b(?:llorando|llanto|sollozando|sollozo)\b/u.test(normalized) &&
      /\b(?:felicidad|alegria|emocion|alivio|alegre|feliz)\b/u.test(normalized)) {
    return 'alegre';
  }
  if (/\b(?:riendo|reir(?:se)?|risa(?:s)?|carcajad\w*|risita)\b/u.test(normalized) &&
      /\b(?:nervios|incomod|verg[uü]enz|timid|sarcas|iron)\w*/u.test(normalized)) {
    return 'nervioso';
  }
  if (/(?:con|en)\s+(?:un\s+|una\s+)?(?:tono|voz)\s+(?:bajo|baja|quedo|queda)\b/u.test(normalized)) {
    return 'susurro';
  }
  return Object.entries(EMOTION_MAP)
    .sort(([left], [right]) => right.length - left.length)
    .find(([trigger]) => {
      const escaped = trigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(?:^|[^\\p{L}])${escaped}(?:$|[^\\p{L}])`, 'iu').test(normalized);
    })?.[1];
}

function removeNonSpokenCues(text: string): string {
  return text
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\b(?:con voz|con tono)\s+(?:muy\s+)?(?:triste|alegre|feliz|enojado|furioso|furia|rabia|susurrante|baja|alta|solemne|misterioso|misteriosa|tembloroso|temblorosa)\b/giu, ' ')
    .replace(/^\s*[-—–-―,;:]+\s*/, '')
    .replace(/\s*[—–-―]\s*(?=[,.;!?])/g, '')
    .replace(/([!?…])\s*\.(?=\s|$)/gu, '$1')
    .replace(/(^|\s)\.(?=\s|$)/gu, '$1')
    .replace(/\s+([,.;!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function splitIntoSentences(text: string): string[] {
  const parts = text.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g) ?? [text];
  return parts.map(p => p.trim()).filter(p => p.length > 1);
}

function splitDisplaySentences(text: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let parenthesesDepth = 0;
  let bracketsDepth = 0;

  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '(') parenthesesDepth++;
    else if (character === ')' && parenthesesDepth > 0) parenthesesDepth--;
    else if (character === '[') bracketsDepth++;
    else if (character === ']' && bracketsDepth > 0) bracketsDepth--;

    if (
      /[.!?…]/u.test(character) &&
      parenthesesDepth === 0 &&
      bracketsDepth === 0 &&
      (index === text.length - 1 || /\s/u.test(text[index + 1]))
    ) {
      const part = text.slice(start, index + 1).trim();
      if (part.length > 1) parts.push(part);
      start = index + 1;
    }
  }

  const trailing = text.slice(start).trim();
  if (trailing.length > 1) parts.push(trailing);
  return parts;
}

export function paginateSentences(sentences: ParsedSentence[], charsPerPage = 1800): number[][] {
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
