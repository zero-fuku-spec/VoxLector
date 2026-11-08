/* ==========================================================================
   VoxLector AI - Robust Document & Dialogue Parser Engine
   ========================================================================== */

class VoxDocumentParser {
  constructor() {
    this.characters = new Set();
  }

  // Parses TXT, PDF, EPUB or MD files into structured book object
  async parseFile(file) {
    const filename = file.name;
    const ext = filename.split('.').pop().toLowerCase();

    let title = filename.replace(/\.[^/.]+$/, "");
    let pages = [];

    if (ext === 'txt' || ext === 'md') {
      const text = await file.text();
      pages = this.splitTextIntoPages(text);
    } else if (ext === 'pdf') {
      pages = await this.parsePDFFile(file);
    } else if (ext === 'epub') {
      pages = await this.parseEPUBFile(file);
    } else {
      const text = await file.text();
      pages = this.splitTextIntoPages(text);
    }

    const detectedChars = this.extractCharactersFromPages(pages);

    return {
      id: 'doc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      title: title,
      type: ext.toUpperCase(),
      fileSize: (file.size / 1024 / 1024).toFixed(2) + ' MB',
      pages: pages,
      totalPages: pages.length,
      detectedCharacters: detectedChars,
      characterVoiceMap: {},
      lastReadPage: 1,
      progress: 0
    };
  }

  splitTextIntoPages(fullText, wordsPerPage = 250) {
    const paragraphs = fullText.split(/\n+/);
    const pages = [];
    let currentPageText = [];
    let currentWordCount = 0;

    for (let para of paragraphs) {
      const trimmed = para.trim();
      if (!trimmed) continue;
      
      const wordCount = trimmed.split(/\s+/).length;
      if (currentWordCount + wordCount > wordsPerPage && currentPageText.length > 0) {
        pages.push(currentPageText.join('\n\n'));
        currentPageText = [trimmed];
        currentWordCount = wordCount;
      } else {
        currentPageText.push(trimmed);
        currentWordCount += wordCount;
      }
    }

    if (currentPageText.length > 0) {
      pages.push(currentPageText.join('\n\n'));
    }

    return pages.length > 0 ? pages : ["Documento sin texto readable."];
  }

  async parsePDFFile(file) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const pages = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        if (pageText.trim()) {
          pages.push(pageText.trim());
        }
      }

      return pages.length > 0 ? pages : ["PDF sin contenido extraíble."];
    } catch (e) {
      console.warn("PDF parsing error:", e);
      return ["Error al procesar el archivo PDF."];
    }
  }

  async parseEPUBFile(file) {
    try {
      if (window.JSZip) {
        const zip = await JSZip.loadAsync(file);
        let extractedText = "";

        for (let relativePath in zip.files) {
          if (relativePath.endsWith('.xhtml') || relativePath.endsWith('.html') || relativePath.endsWith('.htm')) {
            const htmlContent = await zip.files[relativePath].async("string");
            const cleanText = htmlContent.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
            if (cleanText) {
              extractedText += cleanText + "\n\n";
            }
          }
        }

        if (extractedText) {
          return this.splitTextIntoPages(extractedText, 300);
        }
      }

      // Fallback
      const text = await file.text();
      const cleanText = text.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
      return this.splitTextIntoPages(cleanText, 300);
    } catch (e) {
      console.warn("EPUB parsing error:", e);
      const text = await file.text();
      return this.splitTextIntoPages(text.replace(/<[^>]*>?/gm, ' '), 300);
    }
  }

  // Scan text for characters like "Fer:", "Elena:", "[Juan]", "—dijo María"
  extractCharactersFromPages(pages) {
    const fullText = pages.join(' ');
    const characterSet = new Set();

    // Regex 1: "Fer:", "Elena:" speaker prefixes
    const speakerPattern = /(?:^|\n)\s*([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?)\s*:/g;
    let match;
    while ((match = speakerPattern.exec(fullText)) !== null) {
      const name = match[1].trim();
      if (name.length > 2 && !['Capítulo', 'Página', 'Parte', 'Escena', 'Nota', 'Fin', 'Escena 1', 'Escena 2'].includes(name)) {
        characterSet.add(name);
      }
    }

    // Regex 2: Bracketed characters like "[Carlos]"
    const bracketPattern = /\[([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)\]/g;
    while ((match = bracketPattern.exec(fullText)) !== null) {
      characterSet.add(match[1].trim());
    }

    // Regex 3: Dialogue quotes with attributions like "—dijo Sancho"
    const attributionPattern = /—\s*(?:dijo|exclamó|preguntó|respondió|gritó|susurró)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)/gi;
    while ((match = attributionPattern.exec(fullText)) !== null) {
      characterSet.add(match[1].trim());
    }

    return Array.from(characterSet);
  }

  /* ==========================================================================
     Dialogue Parser & Emotion Instruction Stripper
     Example input: "Fer: (Con voz triste) Está lloviendo."
     Returns:
     {
       speaker: "Fer",
       emotion: "triste",
       spokenText: "Está lloviendo.",
       rawLine: "Fer: (Con voz triste) Está lloviendo."
     }
     ========================================================================== */
  parseLineDialogue(line) {
    let raw = line.trim();
    if (!raw) return null;

    let speaker = null;
    let emotion = 'normal';
    let spokenText = raw;

    // 1. Check speaker prefix like "Fer: (Con voz triste) Está lloviendo."
    const prefixMatch = /^([A-ZÁÉÍÓÚÑa-záéíóúñ\s]+):\s*(.*)/.exec(raw);
    if (prefixMatch) {
      speaker = prefixMatch[1].trim();
      spokenText = prefixMatch[2].trim();
    }

    // 2. Check parenthetical emotion/stage direction like "(Con voz triste)" or "(enojado)"
    const emotionMatch = /\((?:[Cc]on voz|[Vv]oz)?\s*([a-zA-ZáéíóúñÁÉÍÓÚÑ\s]+)\)/.exec(spokenText);
    if (emotionMatch) {
      const extractedEmotion = emotionMatch[1].trim().toLowerCase();
      
      if (extractedEmotion.includes('triste')) emotion = 'triste';
      else if (extractedEmotion.includes('alegre') || extractedEmotion.includes('feliz')) emotion = 'alegre';
      else if (extractedEmotion.includes('susurr')) emotion = 'susurro';
      else if (extractedEmotion.includes('enojad') || extractedEmotion.includes('furia')) emotion = 'enojado';
      else emotion = extractedEmotion;

      // Strip the stage direction from spoken text
      spokenText = spokenText.replace(/\([^\)]+\)/g, '').replace(/\s+/g, ' ').trim();
    }

    // Clean quotes
    spokenText = spokenText.replace(/^["'«“]|["'»”]$/g, '').trim();

    return {
      speaker,
      emotion,
      spokenText,
      rawLine: raw
    };
  }

  // Split text page into sentences for synced reading highlighting
  splitPageIntoSentences(pageText) {
    const rawSentences = pageText.match(/[^.!?]+[.!?]+/g) || [pageText];
    return rawSentences.map(s => s.trim()).filter(Boolean);
  }
}

window.voxDocumentParser = new VoxDocumentParser();
