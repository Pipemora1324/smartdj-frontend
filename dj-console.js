// ---------- Consola de DJ del panel del dueño (emisora automática) ----------
// Dos decks con EQ de 3 bandas, crossfader de potencia constante, volumen maestro y por deck, cola y AutoDJ.
// El audio suena en este navegador; el servidor guarda el estado y la cola (ver DECISIONES_DJ.md del backend).
// Usa el(), api(), showView() y stopPanelPoll() de app.js. Todo dato externo se inserta con textContent.
const DJ = window.SmartDJConsole;
const CONSOLE_POLL_MS = 15000;
const STALL_MS = 10000;
const VOLUME_SAVE_MS = 800;
const CATALOG_DEBOUNCE_MS = 500;
const SKIP_FADE_SECONDS = 3;
const WAVE_BARS = 120;
let activeConsole = null;
const STATUS_LABELS = { playing: 'Al aire', paused: 'En pausa', stopped: 'Apagada' };

const artistLine = (track) => (track.genre ? `${track.artist} · ${track.genre}` : track.artist);
function deckBadge(item, isActive, playing) {
  if (!item) return 'VACÍO';
  if (!isActive) return 'SIGUIENTE';
  return playing ? 'AL AIRE' : 'EN PAUSA';
}

// Solo enlaces https en el crédito (evita javascript: u otros esquemas en href).
function safeLink(value) {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.toString() : null; } catch { return null; }
}

// Crédito que exige la licencia: título, artista, enlace a la pista, licencia y proveedor.
function creditLine(track) {
  if (!track?.credit) return el('small', { class: 'credit' });
  const { credit } = track;
  const trackUrl = safeLink(credit.url);
  const licenseUrl = safeLink(credit.licenseUrl);
  return el('small', { class: 'credit' },
    trackUrl ? el('a', { href: trackUrl, target: '_blank', rel: 'noopener', text: `"${credit.title}" de ${credit.artist}` }) : `"${credit.title}" de ${credit.artist}`,
    ' · ',
    licenseUrl ? el('a', { href: licenseUrl, target: '_blank', rel: 'noopener', text: credit.license }) : credit.license || 'Licencia desconocida',
    ` · vía ${credit.source}`,
    credit.nonCommercial ? el('span', { class: 'nc', title: 'Licencia no comercial', text: ' · NC' }) : null);
}

function closeConsole() {
  const c = activeConsole;
  if (!c) return;
  activeConsole = null;
  c.closed = true;
  clearInterval(c.pollTimer);
  clearInterval(c.uiTimer);
  clearTimeout(c.volumeTimer);
  for (const deck of c.decks || []) {
    clearTimeout(deck.stallTimer);
    for (const audio of [deck.routed, deck.plain]) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
  }
  void c.ctx?.close().catch(() => {});
}

// Un deck: dos <audio>. "routed" pasa por Web Audio (EQ y ganancias) y necesita CORS; "plain" es el respaldo
// sin CORS: no se conecta a Web Audio (quedaría en silencio) y su volumen se maneja con audio.volume.
function createDeck(name, ctx, master) {
  const routed = new Audio();
  routed.crossOrigin = 'anonymous';
  routed.preload = 'auto';
  const plain = new Audio();
  plain.preload = 'auto';
  const low = ctx.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 250;
  const mid = ctx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1000; mid.Q.value = 0.9;
  const high = ctx.createBiquadFilter(); high.type = 'highshelf'; high.frequency.value = 4000;
  const gain = ctx.createGain();
  const xfade = ctx.createGain();
  ctx.createMediaElementSource(routed).connect(low).connect(mid).connect(high).connect(gain).connect(xfade).connect(master);
  return {
    name, routed, plain, nodes: { low, mid, high, gain, xfade }, item: null, volume: 100, usingPlain: false, retries: 0,
    eq: { low: 0, mid: 0, high: 0 }, kill: { low: false, mid: false, high: false }, stallTimer: null, pendingSeek: null, view: null,
    audio() { return this.usingPlain ? this.plain : this.routed; },
  };
}

function showConsole(venue, { onBack } = {}) {
  stopPanelPoll();
  closeConsole();
  const P = `/venues/${encodeURIComponent(venue.id)}/player`;
  const c = { venue, consoleId: DJ.newConsoleId(), snapshot: null, ctx: null, master: null, decks: null, active: 0, x: 0, transitioning: false, playing: false, started: false, lost: false, closed: false, pollTimer: null, uiTimer: null, volumeTimer: null, rampUntil: 0 };
  activeConsole = c;

  // ---------- Interfaz ----------
  const notice = el('p', { class: 'console-notice', role: 'status', 'aria-live': 'polite' });
  const say = (text) => { notice.textContent = text || ''; };
  const statusPill = el('span', { class: 'on-air', text: 'Apagada' });
  const modeButtons = { autodj: el('button', { type: 'button', class: 'mode', 'aria-pressed': 'true', text: 'AutoDJ' }), manual: el('button', { type: 'button', class: 'mode', 'aria-pressed': 'false', text: 'Manual' }) };
  const ncToggle = el('input', { type: 'checkbox', id: 'ncToggle' });
  ncToggle.checked = Boolean(venue.exclude_non_commercial);
  const crossfader = el('input', { type: 'range', min: '0', max: '100', value: '0', class: 'crossfader', 'aria-label': 'Crossfader (A ↔ B)' });
  const masterVolume = el('input', { type: 'range', min: '0', max: '100', value: '80', 'aria-label': 'Volumen maestro' });
  const playButton = el('button', { type: 'button', class: 'big', text: '▶ Reproducir', disabled: '' });
  const skipButton = el('button', { type: 'button', class: 'big ghost-dark', text: '⏭ Saltar', disabled: '' });
  const queueList = el('ol', { class: 'console-queue' });
  const queueHint = el('p', { class: 'notice-dark' });
  const startOverlay = el('div', { class: 'console-start' });
  const lostOverlay = el('div', { class: 'console-start', hidden: '' });

  const deckView = (name) => {
    const view = {
      cover: el('div', { class: 'deck-cover cover-empty', text: '♪' }),
      badge: el('span', { class: 'deck-badge', text: 'VACÍO' }),
      title: el('strong', { class: 'deck-title', text: 'Sin pista' }),
      artist: el('span', { class: 'deck-artist' }),
      credit: el('small', { class: 'credit' }),
      time: el('span', { class: 'deck-time', text: '0:00 / 0:00' }),
      wave: el('canvas', { class: 'wave-canvas', height: '56', role: 'img', 'aria-label': `Forma de onda del deck ${name}` }),
      warning: el('small', { class: 'deck-warning' }),
      play: el('button', { type: 'button', class: 'deck-play', text: '▶', 'aria-label': `Reproducir o pausar el deck ${name}` }),
      volume: el('input', { type: 'range', min: '0', max: '100', value: '100', 'aria-label': `Volumen del deck ${name}` }),
      eq: {},
    };
    const eqRow = (band, label) => {
      const input = el('input', { type: 'range', min: String(DJ.EQ_MIN_DB), max: String(DJ.EQ_MAX_DB), step: '1', value: '0', 'aria-label': `${label} del deck ${name}` });
      const kill = el('button', { type: 'button', class: 'kill', 'aria-pressed': 'false', text: 'K', 'aria-label': `Cortar ${label.toLowerCase()} del deck ${name}` });
      view.eq[band] = { input, kill };
      return el('label', { class: 'eq-row' }, el('span', { text: label }), input, kill);
    };
    view.root = el('section', { class: `deck-panel deck-${name.toLowerCase()}`, 'aria-label': `Deck ${name}` },
      el('div', { class: 'deck-top' }, view.cover, el('div', { class: 'deck-meta' }, el('div', { class: 'deck-label' }, el('b', { text: `DECK ${name}` }), view.badge), view.title, view.artist, view.credit)),
      view.wave,
      el('div', { class: 'deck-controls' }, view.play, view.time, el('label', { class: 'deck-volume' }, el('span', { text: 'Vol' }), view.volume)),
      el('div', { class: 'deck-eq' }, eqRow('high', 'Agudos'), eqRow('mid', 'Medios'), eqRow('low', 'Graves')),
      view.warning);
    return view;
  };
  const views = [deckView('A'), deckView('B')];

  const back = () => { closeConsole(); onBack?.(); };
  showView(el('div', { class: 'dj-console' },
    el('div', { class: 'console-bar' },
      el('button', { type: 'button', class: 'ghost-dark', text: '← Volver al panel', onclick: back }),
      el('h1', {}, 'Consola · ', el('span', { text: venue.name })),
      statusPill,
      el('div', { class: 'mode-switch', role: 'group', 'aria-label': 'Modo de la emisora' }, modeButtons.autodj, modeButtons.manual),
      el('label', { class: 'nc-toggle', for: 'ncToggle' }, ncToggle, ' Solo licencias comerciales')),
    notice,
    el('div', { class: 'console-stage' },
      startOverlay, lostOverlay,
      el('div', { class: 'decks' },
        views[0].root,
        el('section', { class: 'mixer-panel', 'aria-label': 'Mezclador' },
          el('label', { class: 'master' }, el('span', { text: 'Maestro' }), masterVolume),
          playButton, skipButton,
          el('div', { class: 'xfade' }, el('span', { text: 'A' }), crossfader, el('span', { text: 'B' }))),
        views[1].root)),
    el('div', { class: 'console-lower' },
      el('section', { class: 'queue-panel' }, el('h2', { text: 'Cola' }), queueHint, queueList),
      catalogPanel())));

  // ---------- Servidor ----------
  const call = async (method, path, body) => {
    try {
      const snap = await api(`${P}${path ?? ''}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
      if (!c.closed) applySnapshot(snap);
      return snap;
    } catch (err) {
      if (err.code === 'console_taken') { loseControl(); return null; }
      if (err.status === 401) { closeConsole(); clearToken(); showLanding(); authForm('login'); dialog.showModal(); return null; }
      throw err;
    }
  };
  const withConsole = (body = {}) => ({ consoleId: c.consoleId, ...body });

  // ---------- Audio ----------
  const deckOf = (i) => c.decks[i];
  const activeDeck = () => deckOf(c.active);
  const idleDeck = () => deckOf(1 - c.active);
  const sideGain = (i, x) => (i === 0 ? DJ.equalPowerGains(x).a : DJ.equalPowerGains(x).b);

  const applyEq = (deck) => {
    for (const band of ['low', 'mid', 'high']) deck.nodes[band].gain.value = deck.usingPlain ? 0 : DJ.eqGain(deck.eq[band], deck.kill[band]);
  };
  const applyGains = () => {
    if (!c.decks) return;
    const master = Number(masterVolume.value);
    c.master.gain.value = master / 100;
    c.decks.forEach((deck, i) => {
      deck.nodes.gain.gain.value = deck.volume / 100;
      if (c.ctx.currentTime >= c.rampUntil) deck.nodes.xfade.gain.value = sideGain(i, c.x);
      deck.plain.volume = DJ.elementVolume(master, deck.volume, sideGain(i, c.x));
    });
  };

  // Rampa del crossfader hacia el otro deck. En Web Audio va en el hilo de audio (no la frenan las pestañas en segundo plano).
  const rampTo = (targetX, seconds) => {
    const from = c.x;
    if (seconds <= 0) { c.x = targetX; c.rampUntil = 0; applyGains(); crossfader.value = String(Math.round(c.x * 100)); return; }
    const now = c.ctx.currentTime;
    c.rampUntil = now + seconds;
    c.decks.forEach((deck, i) => {
      const start = sideGain(i, from);
      const end = sideGain(i, targetX);
      const param = deck.nodes.xfade.gain;
      param.cancelScheduledValues(now);
      param.setValueAtTime(start, now);
      const curve = DJ.fadeCurve(end > start ? 'in' : 'out').map((v) => (end > start ? start + (end - start) * v : end + (start - end) * v));
      param.setValueCurveAtTime(curve, now, seconds);
    });
    const began = performance.now();
    const tick = setInterval(() => {
      const t = Math.min(1, (performance.now() - began) / (seconds * 1000));
      c.x = from + (targetX - from) * t;
      crossfader.value = String(Math.round(c.x * 100));
      c.decks.forEach((deck, i) => { if (deck.usingPlain) deck.plain.volume = DJ.elementVolume(masterVolume.value, deck.volume, sideGain(i, c.x)); });
      if (t >= 1 || c.closed) { clearInterval(tick); c.x = targetX; applyGains(); }
    }, 50);
  };

  const itemFromCurrent = (snap) => (snap?.current ? { queueId: null, track: snap.current.track, transitionAtSeconds: snap.current.transitionAtSeconds, crossfadeSeconds: snap.current.crossfadeSeconds, source: snap.current.source, reason: snap.current.reason } : null);
  const itemFromQueue = (q) => (q ? { queueId: q.id, track: q.track, transitionAtSeconds: q.transitionAtSeconds, crossfadeSeconds: q.crossfadeSeconds, source: q.source, reason: q.reason } : null);

  const loadDeck = (deck, item, { position = 0, autoplay = false } = {}) => {
    clearTimeout(deck.stallTimer);
    for (const audio of [deck.routed, deck.plain]) { audio.pause(); audio.removeAttribute('src'); }
    deck.item = item;
    deck.retries = 0;
    deck.usingPlain = false;
    deck.view.warning.textContent = '';
    applyEq(deck);
    if (item?.track?.audioUrl) {
      deck.pendingSeek = position > 0 ? position : null;
      deck.routed.src = item.track.audioUrl;
      deck.routed.load();
      if (!autoplay) watchLoad(deck);
    }
    // Se dibuja después de cambiar la fuente, para no mostrar el tiempo de la pista anterior.
    renderDeck(deck);
    if (item?.track?.audioUrl && autoplay) playDeck(deck);
  };

  // Vigila que la pista cargue (también la precargada): si no hay datos a tiempo, pasa al siguiente intento.
  const watchLoad = (deck) => {
    clearTimeout(deck.stallTimer);
    const audio = deck.audio();
    deck.stallTimer = setTimeout(() => { if (audio === deck.audio() && audio.readyState < 2) void deckFailed(deck, 'no cargó a tiempo'); }, STALL_MS);
  };

  const playDeck = (deck) => {
    const audio = deck.audio();
    if (!audio.src) return;
    clearTimeout(deck.stallTimer);
    deck.stallTimer = setTimeout(() => { if (audio.paused || audio.readyState < 3) void deckFailed(deck, 'no cargó a tiempo'); }, STALL_MS);
    audio.play().catch((err) => { if (err?.name === 'NotAllowedError') say('El navegador bloqueó el audio: toca "Reproducir".'); });
  };

  // Reintento → respaldo sin CORS (sin EQ) → saltar la pista.
  const deckFailed = async (deck, why) => {
    clearTimeout(deck.stallTimer);
    if (!deck.item || c.closed) return;
    const audio = deck.audio();
    const shouldPlay = c.playing && (deck === activeDeck() || c.transitioning);
    if (deck.retries < 1 && !deck.usingPlain) {
      deck.retries += 1;
      audio.load();
      if (shouldPlay) playDeck(deck); else watchLoad(deck);
      return;
    }
    // Respaldo: el host alterno de Jamendo (o la misma URL) sin CORS, fuera de Web Audio: suena, pero sin EQ.
    if (!deck.usingPlain) {
      deck.usingPlain = true;
      deck.routed.pause();
      deck.routed.removeAttribute('src');
      deck.plain.src = deck.item.track.audioFallbackUrl || deck.item.track.audioUrl;
      deck.plain.load();
      applyEq(deck);
      applyGains();
      deck.view.warning.textContent = 'Sin EQ en esta pista: se usa el servidor de audio de respaldo.';
      if (shouldPlay) playDeck(deck); else watchLoad(deck);
      return;
    }
    say(`"${deck.item.track.title}" no se pudo reproducir (${why}) y se saltó.`);
    if (deck === activeDeck()) {
      await transition({ fade: 0, reason: 'error' });
    } else {
      const { queueId } = deck.item;
      deck.item = null;
      renderDeck(deck);
      if (queueId) await call('DELETE', `/queue/${encodeURIComponent(queueId)}`).catch((err) => say(err.message));
      preloadNext();
    }
  };

  const preloadNext = () => {
    if (!c.decks || c.transitioning) return;
    const next = itemFromQueue(c.snapshot?.queue?.[0]);
    const idle = idleDeck();
    if ((idle.item?.queueId ?? null) === (next?.queueId ?? null) && idle.item) return;
    loadDeck(idle, next);
  };

  // Pasa al otro deck: arranca la siguiente, mueve el crossfader y avisa al servidor (que rellena la cola).
  const transition = async ({ fade, reason = 'ended' }) => {
    if (c.transitioning || !c.decks) return;
    c.transitioning = true;
    const out = activeDeck();
    const incoming = idleDeck();
    const fromTrackId = out.item?.track?.id ?? null;
    const plan = DJ.transitionPlan(out.item, out.audio().duration, c.snapshot?.crossfadeSeconds);
    const seconds = Math.max(0, fade ?? plan.fade);
    if (incoming.item && c.playing) { incoming.audio().currentTime = 0; playDeck(incoming); }
    rampTo(c.active === 0 ? 1 : 0, incoming.item ? seconds : 0);
    let snap = null;
    try {
      snap = reason === 'ended'
        ? await call('POST', '/advance', withConsole({ fromTrackId }))
        : await call('POST', '/skip', withConsole({ fromTrackId: fromTrackId ?? undefined, reason }));
    } catch (err) { say(err.message); }
    // Si el servidor puso otra pista (la cola cambió en otro lado), se carga esa.
    const current = itemFromCurrent(snap ?? c.snapshot);
    if (current && current.track.id !== incoming.item?.track?.id) loadDeck(incoming, current, { autoplay: c.playing });
    if (!current) { loadDeck(incoming, null); say('La cola quedó vacía: busca pistas o activa el AutoDJ.'); }
    setTimeout(() => {
      out.audio().pause();
      c.active = 1 - c.active;
      c.transitioning = false;
      renderDecks();
      preloadNext();
    }, (incoming.item ? seconds : 0) * 1000 + 50);
  };

  const onTime = (deck) => {
    if (deck !== activeDeck() || c.transitioning || !c.playing) return;
    const audio = deck.audio();
    if (c.snapshot?.mode === 'autodj' && DJ.shouldTransition(audio.currentTime, DJ.transitionPlan(deck.item, audio.duration, c.snapshot?.crossfadeSeconds))) void transition({});
  };

  const wireDeck = (deck) => {
    for (const audio of [deck.routed, deck.plain]) {
      const mine = () => audio === deck.audio();
      audio.addEventListener('loadedmetadata', () => { if (mine() && deck.pendingSeek) { audio.currentTime = Math.min(deck.pendingSeek, Math.max(0, audio.duration - 1)); deck.pendingSeek = null; } });
      audio.addEventListener('playing', () => { if (mine()) { clearTimeout(deck.stallTimer); renderDeck(deck); } });
      audio.addEventListener('pause', () => { if (mine()) renderDeck(deck); });
      audio.addEventListener('timeupdate', () => { if (mine()) { drawDeck(deck); onTime(deck); } });
      audio.addEventListener('ended', () => { if (mine() && deck === activeDeck() && !c.transitioning) void transition({ fade: 0 }); });
      audio.addEventListener('error', () => { if (mine() && audio.getAttribute('src')) void deckFailed(deck, 'error de carga'); });
    }
    const { view } = deck;
    view.play.addEventListener('click', () => {
      const audio = deck.audio();
      if (audio.paused) playDeck(deck); else audio.pause();
    });
    view.volume.addEventListener('input', () => { deck.volume = Number(view.volume.value); applyGains(); });
    for (const band of ['low', 'mid', 'high']) {
      view.eq[band].input.addEventListener('input', () => { deck.eq[band] = Number(view.eq[band].input.value); applyEq(deck); });
      view.eq[band].kill.addEventListener('click', () => {
        deck.kill[band] = !deck.kill[band];
        view.eq[band].kill.setAttribute('aria-pressed', String(deck.kill[band]));
        applyEq(deck);
      });
    }
  };

  // ---------- Dibujo ----------
  const renderDeck = (deck) => {
    const { view, item } = deck;
    const isActive = c.decks && deck === activeDeck();
    view.root.classList.toggle('live', Boolean(isActive && item));
    view.badge.textContent = deckBadge(item, isActive, c.playing);
    view.title.textContent = item?.track?.title ?? 'Sin pista';
    view.artist.textContent = item?.track ? artistLine(item.track) : '';
    const credit = creditLine(item?.track);
    view.credit.replaceWith(credit);
    view.credit = credit;
    const art = item?.track?.artworkUrl && safeLink(item.track.artworkUrl);
    const cover = art ? el('img', { class: 'deck-cover', src: art, alt: '', width: '96', height: '96' }) : el('div', { class: 'deck-cover cover-empty', text: '♪' });
    view.cover.replaceWith(cover);
    view.cover = cover;
    view.play.textContent = deck.audio().paused ? '▶' : '❚❚';
    view.play.disabled = !item || c.snapshot?.mode !== 'manual';
    drawDeck(deck);
  };
  const renderDecks = () => { c.decks?.forEach(renderDeck); };

  const drawDeck = (deck) => {
    const { wave, time } = deck.view;
    const audio = deck.audio();
    const duration = Number.isFinite(audio.duration) ? audio.duration : deck.item?.track?.durationSeconds || 0;
    const now = audio.currentTime || 0;
    time.textContent = `${DJ.formatTime(now)} / ${DJ.formatTime(duration)} · -${DJ.formatTime(duration - now)}`;
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(120, Math.floor(wave.clientWidth * ratio));
    const height = Math.floor(56 * ratio);
    if (wave.width !== width) { wave.width = width; wave.height = height; }
    const g = wave.getContext('2d');
    g.clearRect(0, 0, width, height);
    const bars = DJ.waveformBars(deck.item?.track?.waveform, WAVE_BARS);
    const step = width / bars.length;
    const progress = duration ? now / duration : 0;
    bars.forEach((v, i) => {
      g.fillStyle = i / bars.length < progress ? '#c6ff00' : '#3b3b36';
      const h = Math.max(2, v * height);
      g.fillRect(i * step, (height - h) / 2, Math.max(1, step - 1), h);
    });
  };

  const renderQueue = () => {
    const queue = c.snapshot?.queue ?? [];
    let hint = '';
    if (!queue.length) hint = c.snapshot?.mode === 'autodj' ? 'El AutoDJ está buscando pistas…' : 'La cola está vacía. Agrega pistas desde el catálogo.';
    queueHint.textContent = hint;
    const ids = queue.map((q) => q.id);
    const reorder = async (order) => {
      try { await call('PATCH', '/queue', { order }); preloadNext(); } catch (err) { say(err.message); }
    };
    queueList.replaceChildren(...queue.map((q, index) => {
      const art = q.track.artworkUrl && safeLink(q.track.artworkUrl);
      const li = el('li', { class: `queue-item source-${q.source}`, draggable: 'true' },
        art ? el('img', { class: 'cover', src: art, alt: '', width: '44', height: '44', loading: 'lazy' }) : el('div', { class: 'cover cover-empty', text: '♪' }),
        el('div', { class: 'queue-info' },
          el('strong', { text: q.track.title }),
          el('small', { text: `${q.track.artist} · ${DJ.formatTime(q.track.durationSeconds)}` }),
          q.reason ? el('small', { class: 'reason', text: q.reason }) : null),
        el('span', { class: 'source', text: DJ.SOURCE_LABELS[q.source] ?? q.source }),
        el('div', { class: 'queue-actions' },
          el('button', { type: 'button', text: '↑', 'aria-label': `Subir ${q.track.title}`, ...(index === 0 ? { disabled: '' } : {}), onclick: () => reorder(DJ.moveItem(ids, index, -1)) }),
          el('button', { type: 'button', text: '↓', 'aria-label': `Bajar ${q.track.title}`, ...(index === queue.length - 1 ? { disabled: '' } : {}), onclick: () => reorder(DJ.moveItem(ids, index, 1)) }),
          el('button', { type: 'button', class: 'remove', text: '✕', 'aria-label': `Quitar ${q.track.title} de la cola`, onclick: async () => {
            try { await call('DELETE', `/queue/${encodeURIComponent(q.id)}`); preloadNext(); } catch (err) { say(err.message); }
          } })));
      li.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', String(index)); li.classList.add('dragging'); });
      li.addEventListener('dragend', () => li.classList.remove('dragging'));
      li.addEventListener('dragover', (e) => e.preventDefault());
      li.addEventListener('drop', (e) => { e.preventDefault(); const from = Number(e.dataTransfer.getData('text/plain')); if (Number.isInteger(from)) void reorder(DJ.moveTo(ids, from, index)); });
      return li;
    }));
  };

  function applySnapshot(snap) {
    if (!snap) return;
    c.snapshot = snap;
    statusPill.textContent = STATUS_LABELS[snap.status] ?? 'Apagada';
    statusPill.className = `on-air ${snap.status}`;
    for (const [mode, button] of Object.entries(modeButtons)) button.setAttribute('aria-pressed', String(snap.mode === mode));
    if (c.started && snap.consoleId && snap.consoleId !== c.consoleId) loseControl();
    renderQueue();
    renderDecks();
  }

  // ---------- Controles ----------
  function catalogPanel() {
    const input = el('input', { type: 'search', placeholder: 'Buscar en el catálogo libre (Jamendo)', maxlength: '100', 'aria-label': 'Buscar pistas en el catálogo', autocomplete: 'off' });
    const hint = el('p', { class: 'notice-dark', text: 'Busca por título, artista o género para agregar a la cola.' });
    const list = el('ul', { class: 'catalog-results' });
    let timer = null;
    let latest = '';
    const search = async (q) => {
      hint.textContent = 'Buscando…';
      try {
        const data = await api(`/venues/${encodeURIComponent(venue.id)}/tracks/search?q=${encodeURIComponent(q)}`);
        if (q !== latest) return;
        const stale = data.source === 'stale-cache' ? ' (del caché: el catálogo no responde)' : '';
        hint.textContent = data.tracks.length ? `${data.tracks.length} pistas${stale}.` : 'Sin resultados.';
        list.replaceChildren(...data.tracks.map((t) => el('li', {},
          el('div', { class: 'queue-info' }, el('strong', { text: t.title }), el('small', { text: `${artistLine(t)} · ${DJ.formatTime(t.durationSeconds)}` }), creditLine(t)),
          el('button', { type: 'button', class: 'add', text: '+ Cola', 'aria-label': `Agregar ${t.title} a la cola`, onclick: async (e) => {
            e.currentTarget.disabled = true;
            try { await call('POST', '/queue', { provider: t.provider, externalId: t.externalId }); say(`"${t.title}" se agregó a la cola.`); preloadNext(); } catch (err) { say(err.message); e.currentTarget.disabled = false; }
          } }))));
      } catch (err) { if (q === latest) { hint.textContent = err.message; list.replaceChildren(); } }
    };
    input.addEventListener('input', () => {
      clearTimeout(timer);
      latest = input.value.trim();
      if (latest.length < 2) { list.replaceChildren(); hint.textContent = 'Escribe al menos 2 letras.'; return; }
      timer = setTimeout(() => { void search(latest); }, CATALOG_DEBOUNCE_MS);
    });
    return el('section', { class: 'catalog-panel' }, el('h2', { text: 'Catálogo' }), input, hint, list);
  }

  const setPlaying = (value) => {
    c.playing = value;
    playButton.textContent = value ? '❚❚ Pausar' : '▶ Reproducir';
    renderDecks();
  };

  playButton.addEventListener('click', async () => {
    const deck = activeDeck();
    if (c.playing) {
      for (const d of c.decks) d.audio().pause();
      setPlaying(false);
      await call('POST', '/pause', withConsole({ positionSeconds: deck.audio().currentTime || 0 })).catch((err) => say(err.message));
      return;
    }
    await c.ctx.resume();
    if (!deck.item) {
      try { await call('POST', '/play', withConsole()); } catch (err) { say(err.message); return; }
      loadDeck(deck, itemFromCurrent(c.snapshot));
      preloadNext();
    }
    setPlaying(true);
    playDeck(deck);
    await call('POST', '/play', withConsole({ positionSeconds: deck.audio().currentTime || 0 })).catch((err) => say(err.message));
  });
  skipButton.addEventListener('click', () => { void transition({ fade: SKIP_FADE_SECONDS, reason: 'user' }); });
  crossfader.addEventListener('input', () => {
    if (c.transitioning) return;
    c.x = Number(crossfader.value) / 100;
    c.rampUntil = 0;
    applyGains();
    // En manual, llevar el crossfader del todo al otro deck (que suena) lo deja al aire.
    const other = idleDeck();
    if (c.snapshot?.mode === 'manual' && other.item && !other.audio().paused && (c.active === 0 ? c.x >= 0.98 : c.x <= 0.02)) void transition({ fade: 0 });
  });
  masterVolume.addEventListener('input', () => {
    applyGains();
    clearTimeout(c.volumeTimer);
    c.volumeTimer = setTimeout(() => { void call('PATCH', '', { volume: Number(masterVolume.value) }).catch((err) => say(err.message)); }, VOLUME_SAVE_MS);
  });
  for (const [mode, button] of Object.entries(modeButtons)) {
    button.addEventListener('click', async () => {
      try { await call('PATCH', '', { mode }); say(mode === 'autodj' ? 'AutoDJ activo: la emisora elige y mezcla sola.' : 'Modo manual: tú decides cuándo pasar a la siguiente.'); preloadNext(); } catch (err) { say(err.message); }
    });
  }
  ncToggle.addEventListener('change', async () => {
    try {
      const saved = await api(`/venues/${encodeURIComponent(venue.id)}`, { method: 'PATCH', body: JSON.stringify({ exclude_non_commercial: ncToggle.checked }) });
      Object.assign(venue, saved);
      say(ncToggle.checked ? 'Desde ahora solo se programan pistas con licencia comercial.' : 'Se permiten pistas con licencia no comercial.');
    } catch (err) { ncToggle.checked = !ncToggle.checked; say(err.message); }
  });

  // ---------- Control de la emisora entre dispositivos ----------
  function loseControl() {
    if (c.lost) return;
    c.lost = true;
    for (const d of c.decks || []) d.audio().pause();
    setPlaying(false);
    lostOverlay.hidden = false;
    lostOverlay.replaceChildren(el('div', {},
      el('h2', { text: 'La emisora sigue en otro dispositivo' }),
      el('p', { text: 'Otra pestaña o equipo tomó el control. Aquí se pausó para que no suenen dos a la vez.' }),
      el('button', { type: 'button', class: 'big', text: 'Tomar control', onclick: () => { void takeControl(); } })));
  }
  async function takeControl() {
    c.lost = false;
    lostOverlay.hidden = true;
    await begin();
  }

  // Arranque (tras el clic: los navegadores bloquean el audio sin un gesto del usuario).
  async function begin() {
    try {
      if (!c.ctx) {
        c.ctx = new (window.AudioContext || window.webkitAudioContext)();
        c.master = c.ctx.createGain();
        c.master.connect(c.ctx.destination);
        c.decks = [createDeck('A', c.ctx, c.master), createDeck('B', c.ctx, c.master)];
        c.decks.forEach((deck, i) => { deck.view = views[i]; wireDeck(deck); applyEq(deck); });
      }
      await c.ctx.resume();
      let snap = await call('POST', '/claim', { consoleId: c.consoleId });
      if (!snap) return;
      masterVolume.value = String(snap.volume ?? 80);
      c.started = true;
      if (!snap.current) {
        try { snap = await call('POST', '/play', withConsole()); } catch (err) { say(err.message); }
      }
      c.active = 0;
      c.x = 0;
      crossfader.value = '0';
      applyGains();
      const current = itemFromCurrent(snap ?? c.snapshot);
      if (current) {
        loadDeck(activeDeck(), current, { position: snap?.status === 'playing' || snap?.status === 'paused' ? snap.positionSeconds : 0 });
        setPlaying(true);
        playDeck(activeDeck());
        await call('POST', '/play', withConsole({ positionSeconds: snap?.positionSeconds || 0 }));
      }
      preloadNext();
      playButton.removeAttribute('disabled');
      skipButton.removeAttribute('disabled');
      startOverlay.hidden = true;
      say(current ? 'Emisora al aire.' : 'No hay pistas todavía. Busca en el catálogo o espera al AutoDJ.');
    } catch (err) {
      say(err.message);
    }
  }

  startOverlay.replaceChildren(el('div', {},
    el('h2', { text: 'Emisora lista' }),
    el('p', { text: 'Los navegadores no reproducen audio sin un clic. Inicia la emisora en el equipo conectado al sonido del local.' }),
    el('button', { type: 'button', class: 'big', text: '▶ Iniciar emisora', onclick: () => { void begin(); } })));

  // Estado inicial (sin audio) y sondeo cada 15 s: cola actualizada y aviso si otro dispositivo toma el control.
  void call('GET').catch((err) => say(err.message));
  c.pollTimer = setInterval(() => { if (!document.hidden && !c.transitioning) void call('GET').then(() => preloadNext()).catch(() => {}); }, CONSOLE_POLL_MS);
  c.uiTimer = setInterval(() => { if (!document.hidden && c.decks) c.decks.forEach(drawDeck); }, 1000);
}
