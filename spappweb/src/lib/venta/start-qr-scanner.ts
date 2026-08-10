import QrScanner from "qr-scanner";

export type QrScannerStop = () => void;

export type QrScannerHandle = {
  stop: QrScannerStop;
  scanOnce: () => Promise<string | null>;
};

type NativeDetector = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
};

export type StartQrScannerOptions = {
  /** En móvil/iOS: solo escanea al pulsar Escanear (no en bucle). */
  manualScan?: boolean;
};

function isCoarsePointer(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(pointer: coarse)").matches
  );
}

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function isMobileTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(pointer: coarse)").matches ||
    window.matchMedia("(max-width: 639px)").matches
  );
}

export function cameraErrorMessage(err: unknown): string {
  const name =
    err instanceof DOMException
      ? err.name
      : err instanceof Error
        ? err.name
        : "";
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : String(err);
  if (
    name === "NotAllowedError" ||
    /not allowed|permission denied/i.test(msg)
  ) {
    return "Permite el acceso a la cámara cuando el navegador lo pida.";
  }
  if (!window.isSecureContext) {
    return "La cámara solo funciona con HTTPS (o localhost).";
  }
  if (
    name === "NotFoundError" ||
    /not found|no camera|camera not found/i.test(msg)
  ) {
    return "No se encontró cámara en este dispositivo.";
  }
  return "No se pudo acceder a la cámara. Toca Cámara e intenta de nuevo.";
}

function prepareScannerMount(container: HTMLElement): void {
  Object.assign(container.style, {
    width: "100%",
    height: "100%",
    minHeight: "0",
    position: "relative",
    overflow: "hidden",
    background: "#000",
  });
}

function createPreviewVideo(): HTMLVideoElement {
  const video = document.createElement("video");
  video.playsInline = true;
  video.setAttribute("playsinline", "true");
  video.setAttribute("webkit-playsinline", "true");
  video.muted = true;
  video.autoplay = true;
  Object.assign(video.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    objectFit: "contain",
    display: "block",
    zIndex: "1",
  });
  return video;
}

function fullFrameRegion(video: HTMLVideoElement): QrScanner.ScanRegion {
  const { videoWidth: w, videoHeight: h } = video;
  if (w < 2 || h < 2) return {};
  return { x: 0, y: 0, width: w, height: h };
}

function addScanOverlay(container: HTMLElement): void {
  container.querySelector("[data-qr-guide]")?.remove();
  const overlay = document.createElement("div");
  overlay.setAttribute("data-qr-guide", "true");
  Object.assign(overlay.style, {
    position: "absolute",
    inset: "0",
    pointerEvents: "none",
    zIndex: "2",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  });
  const hole = document.createElement("div");
  Object.assign(hole.style, {
    width: "42%",
    maxWidth: "220px",
    aspectRatio: "1",
    boxShadow: "0 0 0 9999px rgba(0,0,0,0.4)",
    border: "2px solid rgba(255,255,255,0.85)",
    borderRadius: "10px",
  });
  overlay.appendChild(hole);
  container.appendChild(overlay);
}

function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
}

async function acquireCamera(mobile: boolean): Promise<MediaStream> {
  const ios = isIOS();
  const tuned = {
    facingMode: { ideal: "environment" },
    width: { ideal: ios ? 1280 : mobile ? 1920 : 2560 },
    height: { ideal: ios ? 720 : mobile ? 1080 : 1440 },
    ...(ios
      ? {}
      : {
          focusMode: { ideal: "continuous" },
          exposureMode: { ideal: "continuous" },
          whiteBalanceMode: { ideal: "continuous" },
        }),
  } as MediaTrackConstraints;

  for (const video of [
    tuned,
    { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
    { facingMode: "environment" },
    true,
  ]) {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: false, video });
    } catch {
      /* siguiente intento */
    }
  }
  throw new Error("Camera not found.");
}

async function tuneTrack(stream: MediaStream): Promise<void> {
  if (isIOS()) return;
  const track = stream.getVideoTracks()[0];
  if (!track) return;
  try {
    await track.applyConstraints({
      advanced: [
        { focusMode: "continuous" },
        { exposureMode: "continuous" },
        { whiteBalanceMode: "continuous" },
      ],
    } as unknown as MediaTrackConstraints);
  } catch {
    /* no soportado */
  }
}

type ScanEngine = Awaited<ReturnType<typeof QrScanner.createQrEngine>>;

function readScanEngine(scanner: QrScanner): Promise<ScanEngine> {
  type Internal = { _qrEnginePromise: Promise<ScanEngine> };
  return (scanner as unknown as Internal)._qrEnginePromise;
}

async function createWorkerBackup(video: HTMLVideoElement): Promise<{
  engine: ScanEngine;
  canvas: HTMLCanvasElement;
  release: () => void;
}> {
  const holder = new QrScanner(video, () => {}, {
    returnDetailedScanResult: true,
  });
  holder.setInversionMode("both");
  const engine = await readScanEngine(holder);
  return { engine, canvas: holder.$canvas, release: () => holder.destroy() };
}

function captureVideoFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
): boolean {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (w < 2 || h < 2) return false;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return false;
  ctx.drawImage(video, 0, 0, w, h);
  return true;
}

async function decodeFrame(
  video: HTMLVideoElement,
  detector: NativeDetector | null,
  worker: { engine: ScanEngine; canvas: HTMLCanvasElement } | null,
  iosSnapshot = false,
): Promise<string | null> {
  const source: ImageBitmapSource = iosSnapshot
    ? (() => {
        const snap = document.createElement("canvas");
        if (!captureVideoFrame(video, snap)) return video;
        return snap;
      })()
    : video;

  if (detector) {
    try {
      const hits = await detector.detect(source);
      const raw = hits[0]?.rawValue?.trim();
      if (raw) return raw;
    } catch {
      /* native falló; prueba worker */
    }
  }
  if (!worker) return null;
  try {
    const scanSource = iosSnapshot && source instanceof HTMLCanvasElement
      ? source
      : video;
    const result = await QrScanner.scanImage(scanSource, {
      scanRegion:
        scanSource instanceof HTMLVideoElement
          ? fullFrameRegion(scanSource)
          : undefined,
      qrEngine: worker.engine,
      canvas: worker.canvas,
      alsoTryWithoutScanRegion: true,
      returnDetailedScanResult: true,
    });
    return result.data?.trim() ?? null;
  } catch {
    return null;
  }
}

/** Chrome/Samsung Android + Safari iOS: detección nativa del SO, frame completo. */
async function nativeDetector(): Promise<NativeDetector | null> {
  type BD = (new (opts: { formats: string[] }) => NativeDetector) & {
    getSupportedFormats: () => Promise<string[]>;
  };
  const BD = (globalThis as { BarcodeDetector?: BD }).BarcodeDetector;
  if (!BD) return null;
  try {
    const formats = await BD.getSupportedFormats();
    if (!formats.includes("qr_code")) return null;
    return new BD({ formats: ["qr_code"] });
  } catch {
    return null;
  }
}

function scanLoop(
  video: HTMLVideoElement,
  locked: () => boolean,
  onCode: (code: string) => void,
  decode: () => Promise<string | null>,
): () => void {
  let active = true;
  let busy = false;
  const SCAN_INTERVAL_MS = 100;

  const id = window.setInterval(() => {
    if (!active || busy || video.readyState < 2 || locked()) return;
    busy = true;
    void decode()
      .then((raw) => {
        if (raw && !locked()) onCode(raw);
      })
      .finally(() => {
        busy = false;
      });
  }, SCAN_INTERVAL_MS);

  return () => {
    active = false;
    window.clearInterval(id);
  };
}

async function startQrScannerImpl(
  container: HTMLElement,
  onCode: (code: string) => void,
  locked: () => boolean,
  options: StartQrScannerOptions = {},
): Promise<QrScannerHandle> {
  if (!window.isSecureContext) {
    throw new DOMException("Secure context required", "SecurityError");
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera not found.");
  }

  const mobile = isCoarsePointer();
  const ios = isIOS();
  const manualScan = options.manualScan ?? ios;

  prepareScannerMount(container);
  const video = createPreviewVideo();
  container.replaceChildren(video);

  const stream = await acquireCamera(mobile);
  video.srcObject = stream;
  try {
    await video.play();
    await tuneTrack(stream);
  } catch (err) {
    stopStream(stream);
    throw err;
  }

  const detector = await nativeDetector();
  const workerBackup =
    ios || mobile || !detector ? await createWorkerBackup(video) : null;

  let stopLoop: (() => void) | undefined;
  let releaseScanner: (() => void) | undefined;
  let decodeBusy = false;

  const runDecode = (): Promise<string | null> =>
    decodeFrame(
      video,
      detector,
      workerBackup
        ? { engine: workerBackup.engine, canvas: workerBackup.canvas }
        : null,
      ios,
    );

  const scanOnce = async (): Promise<string | null> => {
    if (decodeBusy || video.readyState < 2 || locked()) return null;
    decodeBusy = true;
    try {
      return await runDecode();
    } finally {
      decodeBusy = false;
    }
  };

  if (!manualScan) {
    if (detector || workerBackup) {
      stopLoop = scanLoop(video, locked, onCode, runDecode);
      releaseScanner = workerBackup?.release;
    } else {
      const scanner = new QrScanner(
        video,
        (result) => {
          if (locked()) return;
          const raw = result.data?.trim();
          if (raw) onCode(raw);
        },
        {
          returnDetailedScanResult: true,
          maxScansPerSecond: 10,
          calculateScanRegion: fullFrameRegion,
          onDecodeError: (e) => {
            if (e === QrScanner.NO_QR_CODE_FOUND) return;
          },
        },
      );
      scanner.setInversionMode("both");
      await scanner.start();
      stopLoop = () => scanner.stop();
      releaseScanner = () => scanner.destroy();
    }
  } else {
    releaseScanner = workerBackup?.release;
  }

  video.addEventListener("loadeddata", () => addScanOverlay(container), {
    once: true,
  });
  window.setTimeout(() => addScanOverlay(container), 400);

  return {
    stop: () => {
      stopLoop?.();
      releaseScanner?.();
      stopStream(video.srcObject instanceof MediaStream ? video.srcObject : null);
      container.replaceChildren();
    },
    scanOnce,
  };
}

export async function startQrScanner(
  container: HTMLElement,
  onCode: (code: string) => void,
  locked: () => boolean,
  options?: StartQrScannerOptions,
): Promise<QrScannerHandle> {
  return startQrScannerImpl(container, onCode, locked, options);
}
