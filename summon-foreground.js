/** Foreground extraction used by the battlefield renderer.
 * Original artwork stays in the browser: only RGBA pixels enter the worker,
 * and only a one-channel mask returns. There is no persistent image cache.
 */
export const FOREGROUND_INPUT_SIZE = 192;
const STARTUP_TIMEOUT = 120000, EXTRACTION_TIMEOUT = 90000, IDLE_RELEASE_DELAY = 12000;
const MAX_PIXELS = 4096 * 4096;

function unavailable() {
  const error = new Error('Foreground extraction unavailable');
  error.code = 'FOREGROUND_UNAVAILABLE';
  return error;
}

function dimensions(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > MAX_PIXELS) throw unavailable();
  return width * height;
}

function rgbaImage(image) {
  const count = dimensions(image?.width, image?.height);
  if (!image.data || image.data.length !== count * 4) throw unavailable();
  return count;
}

/** Existing transparent artwork is already the authoritative foreground. */
export function hasNativeForegroundAlpha(image) {
  const count = rgbaImage(image);
  let clear = false, visible = false;
  for (let i = 0; i < count; i++) {
    const alpha = image.data[i * 4 + 3];
    if (alpha <= 8) clear = true;
    if (alpha >= 32) visible = true;
    if (clear && visible) return true;
  }
  return false;
}

/** U²-Net-P reference preprocessing: resized RGB / its maximum, then
 * ImageNet mean/std, float32 in NCHW order. No source color is modified. */
export function normalizeForegroundInput(image) {
  const count = rgbaImage(image), input = new Float32Array(count * 3);
  let maximum = 0;
  for (let i = 0; i < count; i++) {
    const p = i * 4;
    maximum = Math.max(maximum, image.data[p], image.data[p + 1], image.data[p + 2]);
  }
  if (!Number.isFinite(maximum)) throw unavailable();
  const divisor = Math.max(maximum, 1e-6), means = [.485, .456, .406], deviations = [.229, .224, .225];
  for (let channel = 0; channel < 3; channel++) {
    for (let i = 0; i < count; i++) {
      const value = (image.data[i * 4 + channel] / divisor - means[channel]) / deviations[channel];
      if (!Number.isFinite(value)) throw unavailable();
      input[channel * count + i] = value;
    }
  }
  return input;
}

/** The network already applies sigmoid. Reject a broken/empty prediction
 * before per-image min/max normalization can turn numerical noise into art.
 * These checks detect gross failures; they do not claim semantic accuracy. */
export function normalizeForegroundMask(values, width, height) {
  const count = dimensions(width, height);
  if (!values || values.length !== count) throw unavailable();
  let low = Infinity, high = -Infinity;
  for (const value of values) {
    if (!Number.isFinite(value) || value < -.001 || value > 1.001) throw unavailable();
    low = Math.min(low, value); high = Math.max(high, value);
  }
  const range = high - low;
  if (range < .005 || high < .05) throw unavailable();
  const alpha = new Uint8ClampedArray(count);
  let clear = 0, visible = 0;
  for (let i = 0; i < count; i++) {
    alpha[i] = Math.round(Math.max(0, Math.min(1, (values[i] - low) / range)) * 255);
    if (alpha[i] <= 8) clear++;
    if (alpha[i] >= 128) visible++;
  }
  // Keep close-up creatures valid. Only virtually full rectangles, empty
  // masks, or isolated numerical specks fail this coarse shape check.
  const minimum = Math.min(4, Math.max(1, Math.floor(count * .0001)));
  if (clear < minimum || visible < minimum || visible / count > .9995) throw unavailable();
  return alpha;
}

/** Bilinear alpha resampling. RGB bytes are copied exactly; any original
 * semitransparency is multiplied by the foreground mask, never replaced. */
export function applyForegroundMask(image, mask) {
  rgbaImage(image);
  const maskCount = dimensions(mask?.width, mask?.height);
  if (!mask.data || mask.data.length !== maskCount) throw unavailable();
  const {width, height} = image, output = new Uint8ClampedArray(image.data);
  const mw = mask.width, mh = mask.height;
  for (let y = 0; y < height; y++) {
    const sy = Math.max(0, Math.min(mh - 1, (y + .5) * mh / height - .5));
    const y0 = Math.floor(sy), y1 = Math.min(mh - 1, y0 + 1), fy = sy - y0;
    for (let x = 0; x < width; x++) {
      const sx = Math.max(0, Math.min(mw - 1, (x + .5) * mw / width - .5));
      const x0 = Math.floor(sx), x1 = Math.min(mw - 1, x0 + 1), fx = sx - x0;
      const top = mask.data[y0 * mw + x0] * (1 - fx) + mask.data[y0 * mw + x1] * fx;
      const bottom = mask.data[y1 * mw + x0] * (1 - fx) + mask.data[y1 * mw + x1] * fx;
      const alpha = top * (1 - fy) + bottom * fy, p = (y * width + x) * 4 + 3;
      if (!Number.isFinite(alpha)) throw unavailable();
      output[p] = Math.round(image.data[p] * Math.max(0, Math.min(255, alpha)) / 255);
    }
  }
  return {data: output, width, height};
}

/** Lazy, single-worker FIFO. `cacheKey`/`persistent` are accepted for caller
 * compatibility only: no artwork, source URL, mask, or key is persisted here.
 * A failed extraction rejects; callers must retain the flat card instead of
 * substituting the old upright illustration with its background.
 */
export function createForegroundExtractor(options = {}) {
  const win = options.window ?? globalThis.window, doc = options.document ?? win?.document ?? globalThis.document;
  const setTimer = win?.setTimeout ? win.setTimeout.bind(win) : globalThis.setTimeout.bind(globalThis);
  const clearTimer = win?.clearTimeout ? win.clearTimeout.bind(win) : globalThis.clearTimeout.bind(globalThis);
  let worker = null, ready = false, destroyed = false, startupTimer = null, idleTimer = null, active = null, serial = 0;
  const queue = [], preparation = [];

  function cancelIdleRelease() {
    if (idleTimer !== null) clearTimer(idleTimer);
    idleTimer = null;
  }

  function stopWorker() {
    if (startupTimer !== null) clearTimer(startupTimer);
    cancelIdleRelease();
    startupTimer = null; ready = false;
    const previous = worker; worker = null;
    try { previous?.terminate(); } catch {}
  }

  function releaseWhenIdle() {
    if (destroyed || !worker || !ready || active || queue.length || preparation.length || idleTimer !== null) return;
    const current = worker;
    const timer = setTimer(() => {
      if (idleTimer !== timer) return;
      idleTimer = null;
      if (worker === current && !active && !queue.length && !preparation.length) stopWorker();
    }, IDLE_RELEASE_DELAY);
    idleTimer = timer;
  }

  function failAll() {
    const jobs = active ? [active, ...queue] : [...queue];
    active = null; queue.length = 0;
    for (const job of jobs) {
      if (job.timer !== null) clearTimer(job.timer);
      job.reject(unavailable());
    }
    for (const waiter of preparation.splice(0)) waiter.reject(unavailable());
    stopWorker();
  }

  function pump() {
    if (destroyed || !worker || !ready || active) return;
    if (!queue.length) { releaseWhenIdle(); return; }
    cancelIdleRelease();
    active = queue.shift();
    const job = active;
    // Queue time is deliberately excluded: only the running item times out.
    job.timer = setTimer(() => { if (active === job) failAll(); }, EXTRACTION_TIMEOUT);
    try {
      worker.postMessage({type: 'extract', id: job.id, width: FOREGROUND_INPUT_SIZE, height: FOREGROUND_INPUT_SIZE, pixels: job.pixels.buffer}, [job.pixels.buffer]);
      job.pixels = null;
    } catch { failAll(); }
  }

  function startWorker() {
    if (worker || destroyed) return;
    try {
      if (!win?.Worker) throw unavailable();
      const url = new URL('./summon-foreground-worker.js', import.meta.url);
      url.search = new URL(import.meta.url).search;
      const current = new win.Worker(url, {type: 'module', name: 'beast-king-foreground'});
      worker = current;
      startupTimer = setTimer(() => { if (worker === current && !ready) failAll(); }, STARTUP_TIMEOUT);
      current.addEventListener('message', event => {
        if (destroyed || worker !== current) return;
        const message = event.data;
        if (message?.type === 'ready') {
          if (startupTimer !== null) clearTimer(startupTimer);
          startupTimer = null; ready = true;
          for (const waiter of preparation.splice(0)) waiter.resolve();
          pump(); return;
        }
        if (message?.type === 'fatal') { failAll(); return; }
        if (!active || message?.id !== active.id) return;
        const job = active;
        if (message.type !== 'result' && message.type !== 'error') return;
        clearTimer(job.timer); active = null;
        try {
          if (message.type !== 'result' || message.width !== FOREGROUND_INPUT_SIZE || message.height !== FOREGROUND_INPUT_SIZE || !(message.mask instanceof ArrayBuffer)) throw unavailable();
          const result = applyForegroundMask(job.original, {data: new Uint8ClampedArray(message.mask), width: message.width, height: message.height});
          job.resolve(result);
        } catch { job.reject(unavailable()); }
        pump();
      });
      current.addEventListener('error', event => {
        event.preventDefault?.();
        if (worker === current) failAll();
      });
      current.addEventListener('messageerror', () => { if (worker === current) failAll(); });
    } catch { failAll(); }
  }

  function extract(sourceCanvas, _settings = {}) {
    if (destroyed) return Promise.reject(unavailable());
    let original, pixels;
    try {
      const width = sourceCanvas?.width, height = sourceCanvas?.height;
      dimensions(width, height);
      const context = sourceCanvas.getContext('2d');
      if (!context) throw unavailable();
      const source = context.getImageData(0, 0, width, height);
      rgbaImage(source);
      original = {data: new Uint8ClampedArray(source.data), width, height};
      if (hasNativeForegroundAlpha(original)) return Promise.resolve(original);
      let visible = false;
      for (let i = 3; i < original.data.length; i += 4) if (original.data[i] >= 32) { visible = true; break; }
      if (!visible || !doc?.createElement) throw unavailable();
      const scaled = doc.createElement('canvas');
      scaled.width = FOREGROUND_INPUT_SIZE; scaled.height = FOREGROUND_INPUT_SIZE;
      const ctx = scaled.getContext('2d', {willReadFrequently: true});
      if (!ctx) throw unavailable();
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(sourceCanvas, 0, 0, scaled.width, scaled.height);
      pixels = new Uint8ClampedArray(ctx.getImageData(0, 0, scaled.width, scaled.height).data);
      if (pixels.length !== FOREGROUND_INPUT_SIZE ** 2 * 4) throw unavailable();
      scaled.width = 0; scaled.height = 0;
    } catch { return Promise.reject(unavailable()); }
    return new Promise((resolve, reject) => {
      queue.push({id: ++serial, original, pixels, resolve, reject, timer: null});
      startWorker(); pump();
    });
  }

  /** Start the shared runtime while entering battle, without sending artwork
   * or starting any per-image inference timeout. */
  function prepare() {
    if (destroyed) return Promise.reject(unavailable());
    if (ready) {
      cancelIdleRelease(); releaseWhenIdle();
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      preparation.push({resolve, reject});
      startWorker();
    });
  }

  return {extract, prepare, warmup: prepare, destroy() { if (destroyed) return; destroyed = true; failAll(); }};
}
