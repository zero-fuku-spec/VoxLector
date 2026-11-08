/* ==========================================================================
   VoxLector AI - Main Application Controller & ReadEra UI Engine
   ========================================================================== */

class VoxLectorApp {
  constructor() {
    this.books = [];
    this.currentBook = null;
    this.currentPageIndex = 0; // 0-indexed internally
    this.currentSentenceIndex = 0;
    this.sentencesOfPage = [];
    
    this.isPlaying = false;
    this.isMultiCharacterMode = true;
    this.isAutoPageJump = true;
    this.sleepTimerInterval = null;
    this.sleepTimeRemaining = 0;

    this.currentLanguage = localStorage.getItem('vox_lang') || 'es';
    this.currentTheme = localStorage.getItem('vox_theme') || 'dark';

    // Tone Mesh canvas drag state
    this.draggedNodeIndex = -1;

    this.init();
  }

  init() {
    this.loadStorageData();
    this.setupTranslations();
    this.applyTheme(this.currentTheme);
    this.bindEvents();
    this.initToneMeshCanvas();
    this.renderLibrary();
    this.populateVoiceSelects();
    this.setupMediaSession();
  }

  loadStorageData() {
    const savedCustomBooks = JSON.parse(localStorage.getItem('vox_custom_books') || '[]');
    this.books = [...window.VOX_DEMO_BOOKS, ...savedCustomBooks];
  }

  saveCustomBooks() {
    const customOnly = this.books.filter(b => !b.id.startsWith('demo_'));
    localStorage.setItem('vox_custom_books', JSON.stringify(customOnly));
  }

  /* ==========================================================================
     UI Translations & Language Pack Engine
     ========================================================================== */
  setupTranslations() {
    this.i18n = {
      es: {
        subtitle: 'Lector Inteligente & Escultor de Voz',
        navLibrary: 'Biblioteca',
        navReader: 'Lectura',
        navStudio: 'Estudio Voz',
        heroTitle: 'Tus Documentos e Historias Interactivas',
        heroDesc: 'Carga tus libros PDF, EPUB o TXT. VoxLector AI detectará los personajes y asignará voces únicas con matices emocionales.',
        dropText: 'Arrastra tus archivos aquí o Explorar',
        filterAll: 'Todos',
        filterDemo: 'Demos con Diálogos',
        searchPlaceholder: 'Buscar libro o personaje...',
        btnChars: 'Personajes',
        dispTitle: 'Ajustes Visuales de Lectura',
        screenBrightness: 'Brillo de Pantalla',
        imgBrightness: 'Brillo Imagen de Fondo',
        imgOpacity: 'Opacidad Imagen de Fondo',
        fontSize: 'Tamaño de Fuente',
        speakingNow: 'Hablando ahora:',
        autoPage: 'Salto Aut.',
        pageWord: 'Página',
        charBoardTitle: 'Matriz de Voces de Personajes',
        charBoardSub: 'Personajes detectados automáticamente en el documento activo.',
        narratorTitle: 'Narrador Principal',
        narratorDesc: 'Voz base utilizada para descripciones y personajes sin voz propia.',
        detectedChars: 'Personajes Detectados',
        addChar: 'Añadir Personaje',
        closeBtn: 'Cerrar',
        saveVoiceConfig: 'Guardar Configuración de Voces',
        newCharFound: '¡Nuevo Personaje Detectado!',
        askVoiceAssign: '¿Qué voz deseas asignarle para la lectura?',
        tone: 'Tono',
        assignAndSave: 'Asignar Voz y Guardar',
        useNarratorVoice: 'Usar Voz del Narrador Principal',
        studioTitle: 'Ecualizador de Voz & Escultor Multimodal',
        studioSub: 'Transformación detallada de timbre, tono, formantes y respuesta de 7 bandas.',
        baseVoice: 'Voz Base & Matices',
        synthVoice: 'Sintetizador de Voz Muestra Base',
        pitch: 'Tono / Pitch Shift',
        speed: 'Velocidad / Tempo',
        depth: 'Formante / Timbre Vocal',
        depthRes: 'Resonancia del Tracto Vocal',
        eq5Band: 'Ecualizador Paramétrico de 7 Bandas',
        meshTitle: 'Malla Paramétrica de 7 Nodos en Canvas',
        meshSub: 'Arrastra los 7 nodos para deformar los armónicos y timbre de voz en tiempo real.',
        graveGrave: 'Grave & Pectoral',
        agudoBrillante: 'Cristalino & Aire',
        presetPacks: 'Presets de Transformación Vocal',
        testText: 'Frase de Prueba de Clonación',
        listen: 'Escuchar',
        saveNewVoice: 'Guardar Voz Creada',
        settingsTitle: 'Configuración General',
        settingsSub: 'Idioma, tema visual, fondos personalizados y API de voces premium.',
        langTitle: 'Paquete de Idioma',
        langDesc: 'Selecciona el idioma de la interfaz.',
        themeTitle: 'Modo de Color',
        themeDesc: 'Apariencia visual de VoxLector AI.',
        bgAppTitle: 'Fondo de Pantalla Principal',
        bgAppDesc: 'Importa una foto para personalizar el fondo de la aplicación.',
        importPhoto: 'Importar Foto',
        removePhoto: 'Quitar Foto',
        mainBgBrightness: 'Brillo del Fondo Principal',
        mainBgOpacity: 'Opacidad del Fondo Principal',
        cloudApiTitle: 'Integración de API de Voces Premium',
        cloudApiDesc: 'Conecta cualquier modelo de voz externo (OpenAI TTS, ElevenLabs, REST API).',
        provider: 'Proveedor de API',
        saveClose: 'Guardar y Cerrar',
        sleepTitle: 'Temporizador de Sueño',
        sleepSub: 'Detiene la lectura automáticamente al finalizar el tiempo.',
        customMins: 'Minutos Personalizados',
        timeRem: 'Tiempo restante:'
      },
      en: {
        subtitle: 'Intelligent Reader & Voice Sculptor',
        navLibrary: 'Library',
        navReader: 'Reader',
        navStudio: 'Voice Studio',
        heroTitle: 'Your Documents & Interactive Stories',
        heroDesc: 'Upload your PDF, EPUB, or TXT books. VoxLector AI will detect characters and assign unique voices with emotional nuances.',
        dropText: 'Drag your files here or Browse',
        filterAll: 'All',
        filterDemo: 'Dialogue Demos',
        searchPlaceholder: 'Search book or character...',
        btnChars: 'Characters',
        dispTitle: 'Visual Reader Settings',
        screenBrightness: 'Screen Brightness',
        imgBrightness: 'Background Image Brightness',
        imgOpacity: 'Background Image Opacity',
        fontSize: 'Font Size',
        speakingNow: 'Speaking now:',
        autoPage: 'Auto Jump',
        pageWord: 'Page',
        charBoardTitle: 'Character Voice Matrix',
        charBoardSub: 'Characters automatically detected in the active document.',
        narratorTitle: 'Main Narrator',
        narratorDesc: 'Base voice used for descriptions and unassigned characters.',
        detectedChars: 'Detected Characters',
        addChar: 'Add Character',
        closeBtn: 'Close',
        saveVoiceConfig: 'Save Voice Configuration',
        newCharFound: 'New Character Found!',
        askVoiceAssign: 'Which voice do you want to assign for reading?',
        tone: 'Pitch',
        assignAndSave: 'Assign Voice & Save',
        useNarratorVoice: 'Use Main Narrator Voice',
        studioTitle: 'Voice Equalizer & Multimodal Sculptor',
        studioSub: 'Detailed transformation of timbre, pitch, formants, and 7-band EQ response.',
        baseVoice: 'Base Voice & Nuances',
        synthVoice: 'Base Sample Speech Synthesizer',
        pitch: 'Pitch / Pitch Shift',
        speed: 'Speed / Tempo',
        depth: 'Formant / Vocal Timbre',
        depthRes: 'Vocal Tract Resonance',
        eq5Band: '7-Band Parametric Equalizer',
        meshTitle: '7-Node Parametric Canvas Mesh',
        meshSub: 'Drag the 7 nodes to deform voice harmonics and timbre in real time.',
        graveGrave: 'Deep & Chest',
        agudoBrillante: 'Crystalline & Air',
        presetPacks: 'Vocal Morphing Presets',
        testText: 'Voice Cloning Test Phrase',
        listen: 'Listen',
        saveNewVoice: 'Save Created Voice',
        settingsTitle: 'General Settings',
        settingsSub: 'Language, color theme, custom backgrounds, and premium voice API.',
        langTitle: 'Language Pack',
        langDesc: 'Select interface language.',
        themeTitle: 'Color Mode',
        themeDesc: 'Visual appearance of VoxLector AI.',
        bgAppTitle: 'Main Background Photo',
        bgAppDesc: 'Import a photo to customize application background.',
        importPhoto: 'Import Photo',
        removePhoto: 'Remove Photo',
        mainBgBrightness: 'Main Background Brightness',
        mainBgOpacity: 'Main Background Opacity',
        cloudApiTitle: 'Premium Voice API Integration',
        cloudApiDesc: 'Connect external TTS models (OpenAI TTS, ElevenLabs, REST API).',
        provider: 'API Provider',
        saveClose: 'Save & Close',
        sleepTitle: 'Sleep Timer',
        sleepSub: 'Automatically stops reading when countdown ends.',
        customMins: 'Custom Minutes',
        timeRem: 'Time remaining:'
      }
    };

    this.applyTranslations();
  }

  applyTranslations() {
    const langPack = this.i18n[this.currentLanguage] || this.i18n['es'];

    document.querySelectorAll('[data-i18n]').forEach(elem => {
      const key = elem.getAttribute('data-i18n');
      if (langPack[key]) elem.textContent = langPack[key];
    });

    document.querySelectorAll('[data-i18n-ph]').forEach(elem => {
      const key = elem.getAttribute('data-i18n-ph');
      if (langPack[key]) elem.placeholder = langPack[key];
    });
  }

  setLanguage(lang) {
    this.currentLanguage = lang;
    localStorage.setItem('vox_lang', lang);
    this.applyTranslations();
  }

  applyTheme(theme) {
    this.currentTheme = theme;
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('vox_theme', theme);

    document.querySelectorAll('.theme-option-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-theme') === theme);
    });
  }

  /* ==========================================================================
     Library Rendering & Upload
     ========================================================================== */
  renderLibrary(filterType = 'all', searchQuery = '') {
    const container = document.getElementById('booksGrid');
    if (!container) return;

    let filtered = this.books;

    if (filterType !== 'all') {
      filtered = filtered.filter(b => b.type.toLowerCase() === filterType.toLowerCase());
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(b => b.title.toLowerCase().includes(q) || (b.detectedCharacters && b.detectedCharacters.some(c => c.toLowerCase().includes(q))));
    }

    container.innerHTML = '';

    filtered.forEach(book => {
      const card = document.createElement('div');
      card.className = 'book-card glass-card';
      
      const charCount = book.detectedCharacters ? book.detectedCharacters.length : 0;
      
      card.innerHTML = `
        <div class="book-card-top">
          <span class="book-badge-type ${book.type.toLowerCase()}">${book.type}</span>
          <span class="text-sub" style="font-size:12px;">${book.fileSize || 'TXT'}</span>
        </div>
        <div class="book-card-body">
          <h3>${book.title}</h3>
          <p>${book.pages[0] ? book.pages[0].substring(0, 100) + '...' : ''}</p>
        </div>
        <div class="book-card-footer">
          <div class="char-badge">
            <i class="fa-solid fa-users"></i>
            <span>${charCount} personajes</span>
          </div>
          <button class="btn-read-now" data-id="${book.id}">
            <i class="fa-solid fa-play"></i> Leer
          </button>
        </div>
      `;

      card.addEventListener('click', (e) => {
        if (!e.target.closest('.btn-read-now')) {
          this.openBook(book.id, true);
        }
      });

      card.querySelector('.btn-read-now').addEventListener('click', (e) => {
        e.stopPropagation();
        this.openBook(book.id, true);
      });

      container.appendChild(card);
    });
  }

  async handleFileUpload(files) {
    for (let file of files) {
      const parsedBook = await window.voxDocumentParser.parseFile(file);
      this.books.unshift(parsedBook);
    }
    this.saveCustomBooks();
    this.renderLibrary();
  }

  /* ==========================================================================
     Reader Engine & Synced Sentence Playback
     ========================================================================== */
  async openBook(bookId, autoPlay = true) {
    const book = this.books.find(b => b.id === bookId);
    if (!book) return;

    // Unlock Web Speech & Web Audio on user gesture
    await window.voxVoiceEngine.unlockAudio();

    this.currentBook = book;
    this.currentPageIndex = (book.lastReadPage || 1) - 1;
    this.currentSentenceIndex = 0;

    document.getElementById('readerBookTitle').textContent = book.title;
    document.getElementById('readerBookIcon').textContent = book.type;
    document.getElementById('badgeCharCount').textContent = book.detectedCharacters ? book.detectedCharacters.length : 0;

    // Enable reader tab button & switch view
    document.getElementById('btnTabReader').classList.remove('disabled');
    this.switchView('viewReader');

    this.renderReaderPage();
    this.renderCharacterBoardList();

    if (autoPlay) {
      this.startSpeech();
    }
  }

  renderReaderPage() {
    if (!this.currentBook) return;

    const totalPages = this.currentBook.totalPages || this.currentBook.pages.length;
    document.getElementById('lblCurrentPage').textContent = this.currentPageIndex + 1;
    document.getElementById('lblTotalPages').textContent = totalPages;

    const slider = document.getElementById('pageProgressSlider');
    slider.max = totalPages;
    slider.value = this.currentPageIndex + 1;

    const pageText = this.currentBook.pages[this.currentPageIndex] || '';
    this.sentencesOfPage = window.voxDocumentParser.splitPageIntoSentences(pageText);

    const container = document.getElementById('readerTextContainer');
    container.innerHTML = '';

    // Render sentences wrapped in spans for synced reading highlight
    this.sentencesOfPage.forEach((sent, idx) => {
      const span = document.createElement('span');
      span.className = 'sentence-span';
      span.id = `sent_${idx}`;
      span.textContent = sent + ' ';
      span.addEventListener('click', async () => {
        await window.voxVoiceEngine.unlockAudio();
        this.currentSentenceIndex = idx;
        this.highlightSentence(idx);
        if (this.isPlaying) {
          this.playCurrentSentence();
        } else {
          this.startSpeech();
        }
      });
      container.appendChild(span);
    });

    this.highlightSentence(this.currentSentenceIndex);
    this.currentBook.lastReadPage = this.currentPageIndex + 1;
    this.saveCustomBooks();
  }

  highlightSentence(sentenceIdx) {
    document.querySelectorAll('.sentence-span').forEach((el, idx) => {
      el.classList.toggle('highlight-sentence', idx === sentenceIdx);
    });

    const activeElem = document.getElementById(`sent_${sentenceIdx}`);
    if (activeElem) {
      activeElem.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  async togglePlayPause() {
    await window.voxVoiceEngine.unlockAudio();
    if (this.isPlaying) {
      this.pauseSpeech();
    } else {
      this.startSpeech();
    }
  }

  startSpeech() {
    this.isPlaying = true;
    document.getElementById('iconPlayPause').className = 'fa-solid fa-pause';
    document.getElementById('audioWaveAnim').style.display = 'flex';
    this.playCurrentSentence();
  }

  pauseSpeech() {
    this.isPlaying = false;
    document.getElementById('iconPlayPause').className = 'fa-solid fa-play';
    document.getElementById('audioWaveAnim').style.display = 'none';
    window.voxVoiceEngine.stop();
  }

  playCurrentSentence() {
    if (!this.isPlaying || !this.currentBook) return;

    if (this.currentSentenceIndex >= this.sentencesOfPage.length) {
      // Reached end of page
      if (this.isAutoPageJump && this.currentPageIndex < this.currentBook.pages.length - 1) {
        this.currentPageIndex++;
        this.currentSentenceIndex = 0;
        this.renderReaderPage();
        this.playCurrentSentence();
      } else {
        this.pauseSpeech();
      }
      return;
    }

    const rawSentence = this.sentencesOfPage[this.currentSentenceIndex];
    this.highlightSentence(this.currentSentenceIndex);

    // Parse sentence for dialogue tags like "Fer: (Con voz triste) Está lloviendo."
    const parsedLine = window.voxDocumentParser.parseLineDialogue(rawSentence);

    let speakerName = 'Narrador Principal';
    let emotionTag = parsedLine ? parsedLine.emotion : 'normal';
    let spokenText = parsedLine ? parsedLine.spokenText : rawSentence;

    if (this.isMultiCharacterMode && parsedLine && parsedLine.speaker) {
      speakerName = parsedLine.speaker;

      // Check if character voice is configured
      const voiceMap = this.currentBook.characterVoiceMap || {};
      if (!voiceMap[speakerName]) {
        // Trigger Unconfigured Character Prompt Modal!
        this.pauseSpeech();
        this.promptUnconfiguredCharacter(speakerName);
        return;
      }
    } else if (!this.isMultiCharacterMode) {
      // Forced Single Master Narrator Mode!
      speakerName = 'Narrador Principal';
      if (parsedLine) {
        spokenText = parsedLine.spokenText; // Still strip (Con voz triste) and Fer: tags!
      }
    }

    // Update bottom speaker indicator bar
    document.getElementById('speakerName').textContent = speakerName;
    const emotionElem = document.getElementById('speakerEmotionTag');
    if (emotionTag !== 'normal') {
      emotionElem.textContent = 'Voz ' + emotionTag;
      emotionElem.classList.remove('hidden');
    } else {
      emotionElem.classList.add('hidden');
    }

    // Get voice profile for speaker
    let voiceConfig = { voiceName: '', pitch: 1.0, rate: 1.0, emotion: emotionTag };
    
    if (speakerName === 'Narrador Principal') {
      const narratorVoice = document.getElementById('selNarratorVoice') ? document.getElementById('selNarratorVoice').value : '';
      voiceConfig.voiceName = narratorVoice;
    } else if (this.currentBook.characterVoiceMap && this.currentBook.characterVoiceMap[speakerName]) {
      voiceConfig = { ...this.currentBook.characterVoiceMap[speakerName], emotion: emotionTag };
    }

    // Apply master speed multiplier from UI selector
    const masterSpeed = parseFloat(document.getElementById('readerMasterSpeed').value || 1.0);
    voiceConfig.rate *= masterSpeed;

    // Apply Mesh 7-band EQ gains
    const meshParams = window.voxVoiceEngine.calculateMeshParameters();
    voiceConfig.eqGains = [
      meshParams.subGain,
      meshParams.bassGain,
      meshParams.timbreGain,
      meshParams.midGain,
      meshParams.clarityGain,
      meshParams.trebleGain,
      meshParams.airGain
    ];

    // Speak audio line
    window.voxVoiceEngine.speakLine(
      spokenText,
      voiceConfig,
      null,
      () => {
        if (this.isPlaying) {
          this.currentSentenceIndex++;
          this.playCurrentSentence();
        }
      }
    );
  }

  promptUnconfiguredCharacter(charName) {
    document.getElementById('lblUnconfiguredName').textContent = `"${charName}"`;
    this.unconfiguredCharTarget = charName;
    this.openModal('modalUnconfiguredChar');
  }

  assignUnconfiguredVoice(voiceName, pitch) {
    if (!this.currentBook) return;

    if (!this.currentBook.characterVoiceMap) {
      this.currentBook.characterVoiceMap = {};
    }

    this.currentBook.characterVoiceMap[this.unconfiguredCharTarget] = {
      voiceName: voiceName,
      pitch: parseFloat(pitch),
      rate: 1.0,
      emotion: 'normal'
    };

    if (!this.currentBook.detectedCharacters.includes(this.unconfiguredCharTarget)) {
      this.currentBook.detectedCharacters.push(this.unconfiguredCharTarget);
    }

    this.saveCustomBooks();
    this.renderCharacterBoardList();
    this.closeModal('modalUnconfiguredChar');

    // Resume reading automatically!
    this.startSpeech();
  }

  /* ==========================================================================
     Character Board Matrix
     ========================================================================== */
  renderCharacterBoardList() {
    const container = document.getElementById('characterListContainer');
    if (!container || !this.currentBook) return;

    container.innerHTML = '';
    const chars = this.currentBook.detectedCharacters || [];
    const voiceMap = this.currentBook.characterVoiceMap || {};

    const availableVoices = window.voxVoiceEngine.getVoices();

    chars.forEach(char => {
      const charConfig = voiceMap[char] || { voiceName: '', pitch: 1.0, rate: 1.0 };
      const card = document.createElement('div');
      card.className = 'character-voice-card glass-panel';

      let voiceOptionsHtml = availableVoices.map(v => 
        `<option value="${v.name}" ${v.name === charConfig.voiceName ? 'selected' : ''}>${v.name} (${v.lang})</option>`
      ).join('');

      card.innerHTML = `
        <div class="card-left">
          <div class="char-avatar">${char.charAt(0)}</div>
          <div>
            <h4>${char}</h4>
            <span class="text-sub" style="font-size:12px;">Personaje Principal</span>
          </div>
        </div>
        <div class="card-controls" style="display:flex; gap:10px; align-items:center;">
          <select class="glass-select sel-char-voice" data-char="${char}">
            ${voiceOptionsHtml}
          </select>
          <div class="pitch-control" style="display:flex; align-items:center; gap:6px;">
            <span style="font-size:12px;">Tono:</span>
            <input type="range" class="rng-char-pitch" data-char="${char}" min="0.5" max="1.8" step="0.1" value="${charConfig.pitch}">
          </div>
        </div>
      `;

      container.appendChild(card);
    });
  }

  /* ==========================================================================
     Voice Studio 7-Node 2D Multimodal Tone Mesh Canvas
     ========================================================================== */
  initToneMeshCanvas() {
    const canvas = document.getElementById('toneMeshCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    this.meshCanvas = canvas;
    this.meshCtx = ctx;

    const drawMesh = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Grid Lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      for (let x = 0; x < canvas.width; x += 40) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += 40) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
      }

      // Bezier Curve across 7 nodes
      ctx.beginPath();
      const nodes = window.voxVoiceEngine.meshNodes;
      ctx.moveTo(nodes[0].x * canvas.width, nodes[0].y * canvas.height);

      for (let i = 1; i < nodes.length - 1; i++) {
        const xc = (nodes[i].x + nodes[i + 1].x) / 2 * canvas.width;
        const yc = (nodes[i].y + nodes[i + 1].y) / 2 * canvas.height;
        ctx.quadraticCurveTo(nodes[i].x * canvas.width, nodes[i].y * canvas.height, xc, yc);
      }
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 4;
      ctx.stroke();

      // Nodes
      nodes.forEach((node, idx) => {
        const nx = node.x * canvas.width;
        const ny = node.y * canvas.height;

        ctx.beginPath();
        ctx.arc(nx, ny, 9, 0, Math.PI * 2);
        ctx.fillStyle = idx === this.draggedNodeIndex ? '#ec4899' : '#8b5cf6';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#94a3b8';
        ctx.font = '11px JetBrains Mono';
        ctx.fillText(node.label, nx - 20, ny - 14);
      });
    };

    drawMesh();

    canvas.addEventListener('mousedown', (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) / canvas.width;
      const my = (e.clientY - rect.top) / canvas.height;

      const nodes = window.voxVoiceEngine.meshNodes;
      this.draggedNodeIndex = nodes.findIndex(n => Math.hypot(n.x - mx, n.y - my) < 0.09);
    });

    canvas.addEventListener('mousemove', (e) => {
      if (this.draggedNodeIndex !== -1) {
        const rect = canvas.getBoundingClientRect();
        const my = Math.max(0.08, Math.min(0.92, (e.clientY - rect.top) / canvas.height));
        window.voxVoiceEngine.meshNodes[this.draggedNodeIndex].y = my;
        drawMesh();
      }
    });

    window.addEventListener('mouseup', () => {
      this.draggedNodeIndex = -1;
    });
  }

  /* ==========================================================================
     MediaSession API & Background Playback
     ========================================================================== */
  setupMediaSession() {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: 'VoxLector AI Reader',
        artist: 'Lectura en Segundo Plano',
        album: 'VoxLector AI'
      });

      navigator.mediaSession.setActionHandler('play', () => this.startSpeech());
      navigator.mediaSession.setActionHandler('pause', () => this.pauseSpeech());
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        this.currentPageIndex++;
        this.renderReaderPage();
        this.playCurrentSentence();
      });
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        this.currentPageIndex = Math.max(0, this.currentPageIndex - 1);
        this.renderReaderPage();
        this.playCurrentSentence();
      });
    }
  }

  /* ==========================================================================
     Sleep Timer Engine
     ========================================================================== */
  startSleepTimer(minutes) {
    clearInterval(this.sleepTimerInterval);
    this.sleepTimeRemaining = minutes * 60;

    const badge = document.getElementById('sleepTimerBadge');
    badge.classList.remove('hidden');
    document.getElementById('activeTimerStatus').classList.remove('hidden');

    this.sleepTimerInterval = setInterval(() => {
      this.sleepTimeRemaining--;
      const mins = Math.floor(this.sleepTimeRemaining / 60);
      const secs = this.sleepTimeRemaining % 60;

      document.getElementById('lblSleepCountdown').textContent = 
        `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

      if (this.sleepTimeRemaining <= 0) {
        clearInterval(this.sleepTimerInterval);
        this.pauseSpeech();
        badge.classList.add('hidden');
        document.getElementById('activeTimerStatus').classList.add('hidden');
      }
    }, 1000);
  }

  cancelSleepTimer() {
    clearInterval(this.sleepTimerInterval);
    document.getElementById('sleepTimerBadge').classList.add('hidden');
    document.getElementById('activeTimerStatus').classList.add('hidden');
  }

  /* ==========================================================================
     Event Listeners
     ========================================================================== */
  bindEvents() {
    // Navigation Tabs
    document.getElementById('btnTabLibrary').addEventListener('click', () => this.switchView('viewLibrary'));
    document.getElementById('btnTabReader').addEventListener('click', () => this.switchView('viewReader'));
    document.getElementById('btnOpenVoicesStudio').addEventListener('click', () => this.openModal('modalVoiceStudio'));
    document.getElementById('btnOpenSettings').addEventListener('click', () => this.openModal('modalSettings'));
    document.getElementById('btnReaderSettings').addEventListener('click', () => this.openModal('modalSettings'));
    document.getElementById('btnBackToLibrary').addEventListener('click', () => this.switchView('viewLibrary'));

    // Toggle Character Voice Mode vs Single Narrator Mode
    document.getElementById('btnToggleCharacterVoices').addEventListener('click', () => {
      this.isMultiCharacterMode = !this.isMultiCharacterMode;
      const btn = document.getElementById('btnToggleCharacterVoices');
      const lbl = document.getElementById('lblVoiceMode');

      btn.classList.toggle('active', this.isMultiCharacterMode);
      if (this.isMultiCharacterMode) {
        lbl.textContent = 'Modo Multi-Personaje';
      } else {
        lbl.textContent = 'Modo Narrador Único';
      }

      if (this.isPlaying) {
        this.playCurrentSentence();
      }
    });

    // Modals Close
    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => {
        const modalId = btn.getAttribute('data-close');
        this.closeModal(modalId);
      });
    });

    // Dropzone File Upload
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');

    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => this.handleFileUpload(e.target.files));

    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      if (e.dataTransfer.files.length) this.handleFileUpload(e.dataTransfer.files);
    });

    // Library Filter Tabs & Search
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const filter = btn.getAttribute('data-filter');
        this.renderLibrary(filter, document.getElementById('librarySearch').value);
      });
    });

    document.getElementById('librarySearch').addEventListener('input', (e) => {
      const activeFilter = document.querySelector('.filter-btn.active').getAttribute('data-filter');
      this.renderLibrary(activeFilter, e.target.value);
    });

    // Player Play / Pause & Page Scrub
    document.getElementById('btnPlayPause').addEventListener('click', () => this.togglePlayPause());
    
    document.getElementById('btnNextPage').addEventListener('click', () => {
      if (this.currentBook && this.currentPageIndex < this.currentBook.pages.length - 1) {
        this.currentPageIndex++;
        this.currentSentenceIndex = 0;
        this.renderReaderPage();
        if (this.isPlaying) this.playCurrentSentence();
      }
    });

    document.getElementById('btnPrevPage').addEventListener('click', () => {
      if (this.currentPageIndex > 0) {
        this.currentPageIndex--;
        this.currentSentenceIndex = 0;
        this.renderReaderPage();
        if (this.isPlaying) this.playCurrentSentence();
      }
    });

    document.getElementById('btnNextSentence').addEventListener('click', () => {
      if (this.currentSentenceIndex < this.sentencesOfPage.length - 1) {
        this.currentSentenceIndex++;
        this.highlightSentence(this.currentSentenceIndex);
        if (this.isPlaying) this.playCurrentSentence();
      }
    });

    document.getElementById('btnPrevSentence').addEventListener('click', () => {
      if (this.currentSentenceIndex > 0) {
        this.currentSentenceIndex--;
        this.highlightSentence(this.currentSentenceIndex);
        if (this.isPlaying) this.playCurrentSentence();
      }
    });

    document.getElementById('pageProgressSlider').addEventListener('input', (e) => {
      this.currentPageIndex = parseInt(e.target.value) - 1;
      this.currentSentenceIndex = 0;
      this.renderReaderPage();
    });

    // Reader Display Settings Dropdown Toggle
    document.getElementById('btnReaderDisplayMenu').addEventListener('click', () => {
      document.getElementById('readerDisplayDropdown').classList.toggle('show');
    });

    // Brightness Sliders
    document.getElementById('readerBrightnessSlider').addEventListener('input', (e) => {
      const val = e.target.value;
      document.getElementById('valReaderBrightness').textContent = val + '%';
      document.getElementById('readerContentCard').style.filter = `brightness(${val / 100})`;
    });

    document.getElementById('readerBgBrightnessSlider').addEventListener('input', (e) => {
      const val = e.target.value;
      document.getElementById('valBgBrightness').textContent = val + '%';
      document.documentElement.style.setProperty('--reader-bg-brightness', val / 100);
    });

    document.getElementById('readerBgOpacitySlider').addEventListener('input', (e) => {
      const val = e.target.value;
      document.getElementById('valBgOpacity').textContent = val + '%';
      document.documentElement.style.setProperty('--reader-bg-opacity', val / 100);
    });

    // Main App Background Sliders
    document.getElementById('mainBgBrightnessSlider').addEventListener('input', (e) => {
      const val = e.target.value;
      document.getElementById('valMainBgBrightness').textContent = val + '%';
      document.documentElement.style.setProperty('--main-bg-brightness', val / 100);
    });

    document.getElementById('mainBgOpacitySlider').addEventListener('input', (e) => {
      const val = e.target.value;
      document.getElementById('valMainBgOpacity').textContent = val + '%';
      document.documentElement.style.setProperty('--main-bg-opacity', val / 100);
    });

    // Custom Photo Uploaders
    document.getElementById('btnUploadAppBg').addEventListener('click', () => document.getElementById('appBgFileInput').click());
    document.getElementById('appBgFileInput').addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          document.documentElement.style.setProperty('--main-bg-image', `url(${evt.target.result})`);
        };
        reader.readAsDataURL(e.target.files[0]);
      }
    });

    document.getElementById('btnUploadReaderBg').addEventListener('click', () => document.getElementById('readerBgFileInput').click());
    document.getElementById('readerBgFileInput').addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          document.documentElement.style.setProperty('--reader-bg-image', `url(${evt.target.result})`);
        };
        reader.readAsDataURL(e.target.files[0]);
      }
    });

    // Character Board Modal & Prompt
    document.getElementById('btnOpenCharacterBoard').addEventListener('click', () => {
      this.renderCharacterBoardList();
      this.openModal('modalCharacterBoard');
    });

    document.getElementById('btnSaveCharacterBoard').addEventListener('click', () => {
      if (!this.currentBook) return;

      document.querySelectorAll('.sel-char-voice').forEach(sel => {
        const char = sel.getAttribute('data-char');
        const pitchElem = document.querySelector(`.rng-char-pitch[data-char="${char}"]`);
        
        if (!this.currentBook.characterVoiceMap) this.currentBook.characterVoiceMap = {};
        this.currentBook.characterVoiceMap[char] = {
          voiceName: sel.value,
          pitch: parseFloat(pitchElem ? pitchElem.value : 1.0),
          rate: 1.0,
          emotion: 'normal'
        };
      });

      this.saveCustomBooks();
      this.closeModal('modalCharacterBoard');
    });

    document.getElementById('btnAssignNewVoice').addEventListener('click', () => {
      const v = document.getElementById('selUnconfiguredVoice').value;
      const p = document.getElementById('rngUnconfigPitch').value;
      this.assignUnconfiguredVoice(v, p);
    });

    document.getElementById('btnUseNarratorVoice').addEventListener('click', () => {
      const narratorVoice = document.getElementById('selNarratorVoice').value || '';
      this.assignUnconfiguredVoice(narratorVoice, 1.0);
    });

    // Language Selector & Themes
    document.getElementById('selAppLanguage').addEventListener('change', (e) => {
      this.setLanguage(e.target.value);
    });

    document.querySelectorAll('.theme-option-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const t = btn.getAttribute('data-theme');
        this.applyTheme(t);
      });
    });

    // Sleep Timer Buttons
    document.getElementById('btnOpenSleepTimer').addEventListener('click', () => this.openModal('modalSleepTimer'));
    document.querySelectorAll('.timer-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const mins = parseInt(chip.getAttribute('data-mins'));
        this.startSleepTimer(mins);
      });
    });
    document.getElementById('btnStartCustomTimer').addEventListener('click', () => {
      const mins = parseInt(document.getElementById('numCustomSleepMins').value || 20);
      this.startSleepTimer(mins);
    });
    document.getElementById('btnCancelSleepTimer').addEventListener('click', () => this.cancelSleepTimer());

    // Voice Studio Presets & Testing
    document.querySelectorAll('.preset-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const presetKey = chip.getAttribute('data-preset');
        const presets = window.voxVoiceEngine.getPresets();
        const found = presets.find(p => p.name.toLowerCase().includes(presetKey));
        if (found) {
          document.getElementById('eqPitch').value = found.pitch;
          document.getElementById('valPitch').textContent = found.pitch;
          document.getElementById('eqRate').value = found.rate;
          document.getElementById('valRate').textContent = found.rate;
        }
      });
    });

    document.getElementById('btnTestVoiceAudio').addEventListener('click', async () => {
      await window.voxVoiceEngine.unlockAudio();
      const text = document.getElementById('studioTestText').value || 'Probando sintetizador de voz.';
      const voice = document.getElementById('studioBaseVoice').value;
      const pitch = parseFloat(document.getElementById('eqPitch').value);
      const rate = parseFloat(document.getElementById('eqRate').value);

      const meshParams = window.voxVoiceEngine.calculateMeshParameters();
      const eqGains = [
        meshParams.subGain,
        meshParams.bassGain,
        meshParams.timbreGain,
        meshParams.midGain,
        meshParams.clarityGain,
        meshParams.trebleGain,
        meshParams.airGain
      ];

      window.voxVoiceEngine.speakLine(text, { voiceName: voice, pitch, rate, eqGains });
    });

    document.getElementById('btnSaveCustomVoicePreset').addEventListener('click', () => {
      const name = document.getElementById('txtCustomVoiceName').value.trim();
      if (!name) return;

      const newPreset = {
        name: name,
        pitch: parseFloat(document.getElementById('eqPitch').value),
        rate: parseFloat(document.getElementById('eqRate').value)
      };

      window.voxVoiceEngine.saveCustomPreset(newPreset);
      alert('¡Nueva voz clonada guardada con éxito!');
      document.getElementById('txtCustomVoiceName').value = '';
    });
  }

  populateVoiceSelects() {
    const voices = window.voxVoiceEngine.getVoices();
    const optionsHtml = voices.map(v => `<option value="${v.name}">${v.name} (${v.lang})</option>`).join('');

    const selects = ['selNarratorVoice', 'selUnconfiguredVoice', 'studioBaseVoice'];
    selects.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = optionsHtml;
    });
  }

  switchView(viewId) {
    document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
    const target = document.getElementById(viewId);
    if (target) target.classList.add('active');

    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    if (viewId === 'viewLibrary') document.getElementById('btnTabLibrary').classList.add('active');
    if (viewId === 'viewReader') document.getElementById('btnTabReader').classList.add('active');
  }

  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('show');
  }

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('show');
  }
}

// Instantiate App on DOMReady
window.addEventListener('DOMContentLoaded', () => {
  window.voxApp = new VoxLectorApp();
});
