/* ═══════════════════════════════════════════════
   VoxLector AI — Demo Books Database
   Pre-tagged dialogues with character emotions
   ═══════════════════════════════════════════════ */

const DEMO_BOOKS = [
  {
    id: 'principito',
    title: 'El Principito y el Zorro',
    author: 'Adaptación libre',
    emoji: '🦊',
    color1: '#f59e0b',
    color2: '#d97706',
    characters: [
      { name: 'Narrador', color: '#8888a8', emoji: '📖' },
      { name: 'Principito', color: '#60a5fa', emoji: '👦' },
      { name: 'Zorro', color: '#f59e0b', emoji: '🦊' }
    ],
    pages: [
      [
        { char: 'Narrador', text: 'En un planeta diminuto, apenas más grande que una casa, vivía un pequeño príncipe de cabellos dorados que cuidaba una rosa y tres volcanes.' },
        { char: 'Narrador', text: 'Un día decidió explorar otros mundos, y tras visitar seis planetas habitados por adultos muy extraños, llegó a la Tierra.' },
        { char: 'Narrador', text: 'Caminó por el desierto durante mucho tiempo, hasta que encontró un jardín lleno de rosas.' },
        { char: 'Principito', emotion: 'triste', text: 'Todas son iguales a mi rosa... Yo creía que tenía una flor única en el universo, y solo tengo una rosa común.' },
        { char: 'Narrador', text: 'Se tumbó sobre la hierba y lloró en silencio. Fue entonces cuando apareció el zorro.' },
        { char: 'Zorro', emotion: 'alegre', text: '¡Buenos días! Estoy aquí, debajo del manzano.' },
        { char: 'Principito', text: '¿Quién eres? Eres muy bonito.' },
        { char: 'Zorro', text: 'Soy un zorro.' },
        { char: 'Principito', emotion: 'alegre', text: 'Ven a jugar conmigo. Estoy tan triste...' },
        { char: 'Zorro', text: 'No puedo jugar contigo. No estoy domesticado.' }
      ],
      [
        { char: 'Principito', text: '¿Qué significa domesticar?' },
        { char: 'Zorro', text: 'Es algo demasiado olvidado. Significa crear lazos.' },
        { char: 'Principito', text: '¿Crear lazos?' },
        { char: 'Zorro', text: 'Claro. Para mí no eres todavía más que un niño parecido a cien mil niños. Y no te necesito. Y tú tampoco me necesitas.' },
        { char: 'Zorro', text: 'Pero si me domesticas, tendremos necesidad el uno del otro. Serás para mí único en el mundo. Seré para ti único en el mundo.' },
        { char: 'Principito', text: 'Empiezo a comprender. Hay una flor... Creo que ella me ha domesticado.' },
        { char: 'Narrador', text: 'El zorro miró al principito con una ternura infinita y le reveló su secreto.' },
        { char: 'Zorro', emotion: 'susurro', text: 'He aquí mi secreto. Es muy simple: solo se ve bien con el corazón. Lo esencial es invisible a los ojos.' },
        { char: 'Principito', emotion: 'alegre', text: 'Lo esencial es invisible a los ojos... Lo recordaré siempre.' },
        { char: 'Narrador', text: 'Y así, el principito comprendió que su rosa era única, no por ser diferente, sino porque era su rosa, la que él había cuidado y amado.' }
      ]
    ]
  },
  {
    id: 'castillo',
    title: 'Misterio en el Castillo de Sombras',
    author: 'VoxLector AI',
    emoji: '🏰',
    color1: '#8b5cf6',
    color2: '#6d28d9',
    characters: [
      { name: 'Narrador', color: '#8888a8', emoji: '📖' },
      { name: 'Elena', color: '#f472b6', emoji: '🔍' },
      { name: 'Marcos', color: '#34d399', emoji: '🗡️' },
      { name: 'Sombra', color: '#6d28d9', emoji: '👤' }
    ],
    pages: [
      [
        { char: 'Narrador', text: 'La tormenta azotaba las murallas del Castillo de Sombras cuando Elena y Marcos cruzaron el puente levadizo.' },
        { char: 'Elena', text: 'Este lugar lleva abandonado más de cien años. ¿Estás seguro de que el manuscrito está aquí?' },
        { char: 'Marcos', emotion: 'alegre', text: 'El mapa del profesor Vidal no miente. La biblioteca secreta está bajo la torre norte.' },
        { char: 'Narrador', text: 'Un relámpago iluminó el gran salón, revelando frescos deteriorados y armaduras cubiertas de telarañas.' },
        { char: 'Elena', emotion: 'susurro', text: 'Marcos... ¿Has oído eso? Juraría que alguien camina en el piso de arriba.' },
        { char: 'Marcos', text: 'Son solo ratas. Vamos, la escalera debe estar por aquí.' },
        { char: 'Narrador', text: 'Pero no eran ratas. Una figura oscura los observaba desde el balcón interior, sus ojos brillando en la penumbra.' },
        { char: 'Sombra', emotion: 'susurro', text: 'Visitantes... Hacía tanto tiempo que nadie venía al castillo.' }
      ],
      [
        { char: 'Narrador', text: 'Descendieron por una escalera de caracol hasta llegar a una puerta de roble reforzada con hierro.' },
        { char: 'Elena', emotion: 'alegre', text: '¡La encontré! La cerradura tiene el mismo símbolo que el medallón del profesor.' },
        { char: 'Narrador', text: 'La puerta se abrió con un chirrido que resonó por todo el castillo.' },
        { char: 'Marcos', text: 'Increíble... Mira todos estos libros. Deben ser miles.' },
        { char: 'Sombra', emotion: 'enojado', text: '¡No deberían estar aquí! Estos libros están bajo mi protección.' },
        { char: 'Elena', text: '¿Quién eres? ¿Qué haces en este castillo abandonado?' },
        { char: 'Sombra', text: 'Yo soy el guardián. Llevo siglos cuidando esta biblioteca. Y nadie se llevará ni una sola página.' },
        { char: 'Marcos', emotion: 'triste', text: 'No venimos a robar. Solo buscamos el manuscrito de Alejandría. El mundo necesita ese conocimiento.' },
        { char: 'Sombra', emotion: 'susurro', text: 'El manuscrito de Alejandría... Hace doscientos años que nadie pronuncia ese nombre.' },
        { char: 'Narrador', text: 'El guardián los miró en silencio durante un largo momento, como si pudiera leer sus almas.' }
      ]
    ]
  },
  {
    id: 'quijote',
    title: 'Don Quijote y los Molinos',
    author: 'Adaptación libre de Cervantes',
    emoji: '⚔️',
    color1: '#ef4444',
    color2: '#b91c1c',
    characters: [
      { name: 'Narrador', color: '#8888a8', emoji: '📖' },
      { name: 'Quijote', color: '#ef4444', emoji: '⚔️' },
      { name: 'Sancho', color: '#22c55e', emoji: '🫏' }
    ],
    pages: [
      [
        { char: 'Narrador', text: 'En un lugar de la Mancha, de cuyo nombre no quiero acordarme, cabalgaban por los campos polvorientos un caballero alto y flaco montado en un caballo huesudo, y su fiel escudero sobre un burro panzudo.' },
        { char: 'Quijote', emotion: 'épico', text: '¡Mira, Sancho! ¡Allí, en aquella llanura! ¡Treinta gigantes desaforados con quienes pienso hacer batalla!' },
        { char: 'Sancho', text: '¿Qué gigantes, señor mío? Yo solo veo molinos de viento.' },
        { char: 'Quijote', emotion: 'enojado', text: '¡Se nota que no estás versado en aventuras! Son gigantes, y si tienes miedo, apártate y ponte en oración mientras yo entro en fiera y desigual batalla.' },
        { char: 'Sancho', emotion: 'triste', text: 'Pero, mi señor, mire vuestra merced que aquellos son molinos de viento, y lo que parecen brazos son las aspas que, movidas por el viento, hacen andar la piedra del molino.' },
        { char: 'Quijote', text: '¡No huyas, cobardes criaturas! ¡Que un solo caballero es el que os acomete!' },
        { char: 'Narrador', text: 'Y diciendo esto, espoleó a Rocinante sin atender a las voces de Sancho, y embistió con el primer molino que encontró.' }
      ],
      [
        { char: 'Narrador', text: 'El viento movió las aspas con tanta furia que la lanza se hizo pedazos, y caballo y caballero rodaron por el campo malparados.' },
        { char: 'Sancho', emotion: 'triste', text: '¡Válgame Dios! ¿No le dije a vuestra merced que mirase bien lo que hacía, que eran molinos de viento?' },
        { char: 'Quijote', text: 'Calla, amigo Sancho. Las cosas de la guerra están sujetas a continua mudanza. El sabio Frestón, aquel que me robó el aposento y los libros, ha convertido estos gigantes en molinos para quitarme la gloria de vencerlos.' },
        { char: 'Sancho', text: 'Dios lo remedie. Sea como fuere, ayúdeme vuestra merced a subir sobre Rocinante, que también va maltrecho.' },
        { char: 'Narrador', text: 'Y así continuaron su camino, el uno convencido de su gloria, el otro meneando la cabeza, pero siempre fiel a su señor.' },
        { char: 'Quijote', emotion: 'épico', text: 'No desmayes, Sancho, que la aventura nos guía. Y donde hay caballeros, siempre hay esperanza.' },
        { char: 'Sancho', emotion: 'alegre', text: 'Lo que yo espero es que la próxima aventura tenga una venta con buen vino y jamón, que el estómago también pide justicia.' },
        { char: 'Narrador', text: 'Y cabalgaron hacia el horizonte, buscando nuevas aventuras bajo el sol implacable de la Mancha.' }
      ]
    ]
  }
];
