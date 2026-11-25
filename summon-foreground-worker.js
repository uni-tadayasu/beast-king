/** Product worker: on-device saliency only. No image upload, URL input,
 * persistent cache, or external service. Model/runtime live on this origin. */
import * as ort from './assets/summon-runtime/ort.wasm.min.mjs';

const helpersURL = new URL('./summon-foreground.js', import.meta.url);
helpersURL.search = new URL(import.meta.url).search;
const {FOREGROUND_INPUT_SIZE, normalizeForegroundInput, normalizeForegroundMask} = await import(helpersURL.href);
let session = null, running = false;
const queue = [];

function fail(id) { self.postMessage({type: 'error', id}); }

async function drain() {
  if (running || !session || !queue.length) return;
  running = true;
  const job = queue.shift();
  let input = null, outputs = null;
  try {
    if (job.width !== FOREGROUND_INPUT_SIZE || job.height !== FOREGROUND_INPUT_SIZE || !(job.pixels instanceof ArrayBuffer)) throw Error();
    const pixels = new Uint8ClampedArray(job.pixels);
    const normalized = normalizeForegroundInput({data: pixels, width: job.width, height: job.height});
    input = new ort.Tensor('float32', normalized, [1, 3, FOREGROUND_INPUT_SIZE, FOREGROUND_INPUT_SIZE]);
    // Only the fused foreground output is needed by the renderer.
    outputs = await session.run({[session.inputNames[0]]: input}, [session.outputNames[0]]);
    const output = outputs[session.outputNames[0]], shape = output?.dims;
    if (!shape || shape.length !== 4 || shape[0] !== 1 || shape[1] !== 1 || shape[2] !== FOREGROUND_INPUT_SIZE || shape[3] !== FOREGROUND_INPUT_SIZE) throw Error();
    const alpha = normalizeForegroundMask(output.data, FOREGROUND_INPUT_SIZE, FOREGROUND_INPUT_SIZE);
    self.postMessage({type: 'result', id: job.id, width: FOREGROUND_INPUT_SIZE, height: FOREGROUND_INPUT_SIZE, mask: alpha.buffer}, [alpha.buffer]);
  } catch { fail(job.id); }
  finally {
    try { input?.dispose(); } catch {}
    if (outputs) for (const output of Object.values(outputs)) { try { output.dispose(); } catch {} }
    running = false; drain();
  }
}

self.addEventListener('message', event => {
  const message = event.data;
  if (message?.type !== 'extract' || !Number.isSafeInteger(message.id)) return;
  // The coordinator sends only one active item; keep this worker safe if a
  // future caller submits a burst while its model is still initializing.
  if (queue.length >= 16) { fail(message.id); return; }
  queue.push(message); drain();
});

async function initialize() {
  const runtime = new URL('./assets/summon-runtime/', import.meta.url);
  if (runtime.origin !== self.location.origin) throw Error();
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  ort.env.wasm.wasmPaths = runtime.href;
  // This production graph has 192px input/output shapes; weights and
  // operators are unchanged. Avoid retaining the larger inference arena.
  session = await ort.InferenceSession.create(new URL('u2netp-192.onnx', runtime).href, {
    executionProviders: ['wasm'], graphOptimizationLevel: 'all',
    enableCpuMemArena: false, enableMemPattern: false,
  });
  self.postMessage({type: 'ready'});
  drain();
}

initialize().catch(() => { queue.length = 0; self.postMessage({type: 'fatal'}); });
