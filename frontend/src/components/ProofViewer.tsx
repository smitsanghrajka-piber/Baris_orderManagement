import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronLeft, ChevronRight, Download, Loader2, Maximize2, MousePointerSquareDashed, ZoomIn, ZoomOut } from "lucide-react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import type { Annotation } from "../lib/artwork";
import { errorMessage } from "../lib/api";

export interface ViewerMarker {
  id: string;
  /** Number shown on the marker; matches the comment list. */
  n: number;
  area: Annotation;
  tone: "customer" | "staff" | "draft";
  resolved?: boolean;
}

interface Props {
  /** Resolves the file to a short-lived signed URL (staff and portal use different endpoints). */
  loadUrl: () => Promise<{ url: string; mimeType: string; fileName: string }>;
  /** Changes when a different file is shown, so the viewer reloads. */
  fileKey: string;
  markers: ViewerMarker[];
  activeId?: string | null;
  onSelect?: (id: string) => void;
  /** When true, dragging draws a box and a click drops a pin. */
  drawing?: boolean;
  onDrawingChange?: (on: boolean) => void;
  onDraw?: (area: Annotation) => void;
  /** An area drawn but not yet saved as a comment. */
  pending?: Annotation | null;
  canDraw?: boolean;
}

type Loaded =
  | { kind: "pdf"; doc: PDFDocumentProxy; pages: number; url: string; fileName: string }
  | { kind: "image"; src: string; width: number; height: number; url: string; fileName: string };

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const MIN_BOX = 0.012; // smaller than ~1% of the page counts as a click → pin

/**
 * Proof viewer with area markup. PDFs render through pdf.js (loaded only
 * when needed); PNG/JPEG show directly. Marker coordinates are fractions of
 * the page, so they stay put at every zoom level and screen size.
 */
export function ProofViewer({ loadUrl, fileKey, markers, activeId, onSelect, drawing, onDrawingChange, onDraw, pending, canDraw }: Props) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [fitWidth, setFitWidth] = useState(800);
  const [aspect, setAspect] = useState(1.414);
  const [rendering, setRendering] = useState(false);
  const [draft, setDraft] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTask = useRef<RenderTask | null>(null);
  const loadRef = useRef(loadUrl);
  loadRef.current = loadUrl;

  // Load the file once per fileKey: signed URL → bytes (works cross-origin in dev and keeps the URL short-lived).
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setLoaded(null);
    setError("");
    setPage(1);
    setZoom(1);
    (async () => {
      try {
        const { url, mimeType, fileName } = await loadRef.current();
        const res = await fetch(url);
        if (!res.ok) throw new Error("The proof file could not be downloaded.");
        const bytes = await res.arrayBuffer();
        if (cancelled) return;
        if (mimeType === "application/pdf") {
          const pdfjs = await import("pdfjs-dist");
          const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
          pdfjs.GlobalWorkerOptions.workerSrc = worker;
          // The API serves a strict CSP (no unsafe-eval); tell pdf.js not to try.
          const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise;
          if (cancelled) { void doc.destroy(); return; }
          setLoaded({ kind: "pdf", doc, pages: doc.numPages, url, fileName });
        } else {
          objectUrl = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
          const img = new Image();
          img.src = objectUrl;
          await img.decode();
          if (cancelled) return;
          setAspect(img.naturalHeight / img.naturalWidth);
          setLoaded({ kind: "image", src: objectUrl, width: img.naturalWidth, height: img.naturalHeight, url, fileName });
        }
      } catch (e) {
        if (!cancelled) setError(errorMessage(e));
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileKey]);

  useEffect(() => () => { if (loaded?.kind === "pdf") void loaded.doc.destroy(); }, [loaded]);

  // Fit-to-width follows the frame size.
  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFitWidth(Math.max(240, el.clientWidth - 32)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const width = Math.round(fitWidth * zoom);

  // Render the current PDF page at device resolution.
  useEffect(() => {
    if (loaded?.kind !== "pdf") return;
    let cancelled = false;
    (async () => {
      setRendering(true);
      try {
        const p = await loaded.doc.getPage(page);
        const base = p.getViewport({ scale: 1 });
        if (cancelled) return;
        setAspect(base.height / base.width);
        const dpr = window.devicePixelRatio || 1;
        const viewport = p.getViewport({ scale: (width / base.width) * dpr });
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        renderTask.current?.cancel();
        const task = p.render({ canvasContext: canvas.getContext("2d")!, viewport });
        renderTask.current = task;
        await task.promise;
      } catch (e) {
        if ((e as { name?: string }).name !== "RenderingCancelledException" && !cancelled) setError(errorMessage(e));
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();
    return () => { cancelled = true; };
  }, [loaded, page, width]);

  // Selecting a marker on another page jumps to it and scrolls it into view.
  useEffect(() => {
    const m = markers.find((x) => x.id === activeId);
    if (!m) return;
    if (m.area.page !== page) setPage(m.area.page);
    requestAnimationFrame(() => document.getElementById(`marker-${m.id}`)?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // Escape leaves drawing mode.
  useEffect(() => {
    if (!drawing) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setDraft(null); onDrawingChange?.(false); } };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [drawing, onDrawingChange]);

  const pages = loaded?.kind === "pdf" ? loaded.pages : 1;

  const point = useCallback((e: ReactPointerEvent) => {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) };
  }, []);

  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drawing) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const p = point(e);
    setDraft({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drawing || !draft) return;
    const p = point(e);
    setDraft({ ...draft, x1: p.x, y1: p.y });
  };
  const up = () => {
    if (!drawing || !draft) return;
    const x = Math.min(draft.x0, draft.x1), y = Math.min(draft.y0, draft.y1);
    const w = Math.abs(draft.x1 - draft.x0), h = Math.abs(draft.y1 - draft.y0);
    setDraft(null);
    const box = w > MIN_BOX || h > MIN_BOX;
    onDraw?.({ page, x: round(box ? x : draft.x0), y: round(box ? y : draft.y0), w: box ? round(w) : 0, h: box ? round(h) : 0 });
  };

  const onPage = markers.filter((m) => m.area.page === page);
  const drawn = draft && { x: Math.min(draft.x0, draft.x1), y: Math.min(draft.y0, draft.y1), w: Math.abs(draft.x1 - draft.x0), h: Math.abs(draft.y1 - draft.y0) };

  return (
    <div className="proof-viewer">
      <div className="proof-toolbar">
        <div className="proof-tools">
          {pages > 1 && (
            <>
              <button className="icon-btn" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={17} /></button>
              <span className="proof-page">Page {page} of {pages}</span>
              <button className="icon-btn" aria-label="Next page" disabled={page >= pages} onClick={() => setPage(page + 1)}><ChevronRight size={17} /></button>
              <span className="proof-sep" />
            </>
          )}
          <button className="icon-btn" aria-label="Zoom out" disabled={zoom <= ZOOMS[0]} onClick={() => setZoom(ZOOMS[Math.max(0, ZOOMS.indexOf(zoom) - 1)])}><ZoomOut size={17} /></button>
          <span className="proof-zoom">{Math.round(zoom * 100)}%</span>
          <button className="icon-btn" aria-label="Zoom in" disabled={zoom >= ZOOMS[ZOOMS.length - 1]} onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(zoom) + 1)])}><ZoomIn size={17} /></button>
          <button className="icon-btn" aria-label="Fit to width" title="Fit to width" onClick={() => setZoom(1)}><Maximize2 size={16} /></button>
          {loaded && (
            <a className="icon-btn" href={loaded.url} target="_blank" rel="noreferrer" aria-label="Open the original file" title="Open the original file">
              <Download size={16} />
            </a>
          )}
        </div>
        {canDraw && (
          <button className={drawing ? "btn primary" : "btn"} aria-pressed={!!drawing} onClick={() => onDrawingChange?.(!drawing)}>
            <MousePointerSquareDashed size={16} />
            {drawing ? "Drawing: drag a box or click" : "Mark an area"}
          </button>
        )}
      </div>

      <div className={`proof-frame${drawing ? " is-drawing" : ""}`} ref={frameRef}>
        {error ? (
          <div className="proof-message" role="alert">{error}</div>
        ) : !loaded ? (
          <div className="proof-message"><Loader2 className="spin" size={26} /> Loading proof…</div>
        ) : (
          <div className="proof-stage" ref={stageRef} style={{ width, height: Math.round(width * aspect) }}>
            {loaded.kind === "pdf" ? (
              <canvas ref={canvasRef} className="proof-surface" aria-label={`${loaded.fileName}, page ${page}`} />
            ) : (
              <img src={loaded.src} alt={loaded.fileName} className="proof-surface" draggable={false} />
            )}
            {rendering && <div className="proof-rendering"><Loader2 className="spin" size={20} /></div>}
            <div
              className="proof-overlay"
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={() => setDraft(null)}
            >
              {onPage.map((m) => {
                const pin = m.area.w === 0 && m.area.h === 0;
                return (
                  <button
                    key={m.id}
                    id={`marker-${m.id}`}
                    type="button"
                    className={`proof-marker tone-${m.tone}${pin ? " is-pin" : ""}${m.resolved ? " is-resolved" : ""}${activeId === m.id ? " is-active" : ""}`}
                    style={pin
                      ? { left: pct(m.area.x), top: pct(m.area.y) }
                      : { left: pct(m.area.x), top: pct(m.area.y), width: pct(m.area.w), height: pct(m.area.h) }}
                    aria-label={`Comment ${m.n}${m.resolved ? " (resolved)" : ""}`}
                    onPointerDown={(e) => { if (!drawing) e.stopPropagation(); }}
                    onClick={() => !drawing && onSelect?.(m.id)}
                  >
                    <span className="proof-marker-n">{m.n}</span>
                  </button>
                );
              })}
              {pending && pending.page === page && (
                <div
                  className={`proof-marker tone-pending${pending.w === 0 && pending.h === 0 ? " is-pin" : ""}`}
                  style={pending.w === 0 && pending.h === 0
                    ? { left: pct(pending.x), top: pct(pending.y) }
                    : { left: pct(pending.x), top: pct(pending.y), width: pct(pending.w), height: pct(pending.h) }}
                  aria-hidden
                ><span className="proof-marker-n">+</span></div>
              )}
              {drawn && <div className="proof-drawing" style={{ left: pct(drawn.x), top: pct(drawn.y), width: pct(drawn.w), height: pct(drawn.h) }} />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const clamp = (n: number) => Math.min(1, Math.max(0, n));
const round = (n: number) => Math.round(n * 10000) / 10000;
const pct = (n: number) => `${n * 100}%`;
