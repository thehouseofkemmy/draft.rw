import { useRef, useState, useEffect } from "react";

type Props = {
  file: File;
  onSave: (blob: Blob) => void;
  onClose: () => void;
};

const SIZE    = 280;
const MIN_MUL = 1;    // 1× fit
const MAX_MUL = 4;    // 4× fit

/** Map slider 0-100 → scale multiplier (relative to fitScale) */
function sliderToMul(v: number) {
  return MIN_MUL + (v / 100) * (MAX_MUL - MIN_MUL);
}
/** Map scale → slider 0-100 */
function mulToSlider(mul: number) {
  return Math.round(Math.max(0, Math.min(100, ((mul - MIN_MUL) / (MAX_MUL - MIN_MUL)) * 100)));
}

export default function AvatarCropModal({ file, onSave, onClose }: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const imgRef     = useRef<HTMLImageElement | null>(null);
  const fitScale   = useRef(1); // scale that makes image fill the circle
  const [offset,    setOffset]    = useState({ x: 0, y: 0 });
  const [scale,     setScale]     = useState(1);
  const [sliderVal, setSliderVal] = useState(0); // 0-100
  const [loaded,    setLoaded]    = useState(false);

  // Drag state
  const dragging       = useRef(false);
  const lastPos        = useRef({ x: 0, y: 0 });
  const lastTouchDist  = useRef<number | null>(null);

  /** Update both scale and slider in sync */
  const applyScale = (newScale: number) => {
    const fit  = fitScale.current;
    const mul  = newScale / fit;
    const clamped = Math.max(fit * MIN_MUL, Math.min(fit * MAX_MUL, newScale));
    setScale(clamped);
    setSliderVal(mulToSlider(clamped / fit));
  };

  // ── Load image ─────────────────────────────────────────
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      // "cover" scale — image fills the entire crop square
      const fit = Math.max(SIZE / img.width, SIZE / img.height);
      fitScale.current = fit;
      setScale(fit);
      setSliderVal(0); // start at minimum zoom
      setOffset({ x: (SIZE - img.width * fit) / 2, y: (SIZE - img.height * fit) / 2 });
      setLoaded(true);
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // ── Redraw ─────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const img    = imgRef.current;
    if (!canvas || !img || !loaded) return;
    const ctx = canvas.getContext("2d")!;

    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.drawImage(img, offset.x, offset.y, img.width * scale, img.height * scale);

    // Dim area outside circle (evenodd donut trick)
    ctx.beginPath();
    ctx.rect(0, 0, SIZE, SIZE);
    ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 2, 0, Math.PI * 2, true); // counter-clockwise = hole
    ctx.fillStyle = "rgba(0,0,0,0.52)";
    ctx.fill("evenodd");

    // Circle guide ring
    ctx.beginPath();
    ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 2, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.40)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }, [offset, scale, loaded]);

  // ── Mouse ──────────────────────────────────────────────
  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    lastPos.current = { x: e.clientX, y: e.clientY };
    setOffset((o) => ({ x: o.x + dx, y: o.y + dy }));
  };
  const onMouseUp = () => { dragging.current = false; };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.08 : 0.93;
    applyScale(scale * factor);
  };

  // ── Touch ──────────────────────────────────────────────
  const onTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 1) {
      dragging.current = true;
      lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2) {
      dragging.current = false;
      lastTouchDist.current = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
    }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 1 && dragging.current) {
      const dx = e.touches[0].clientX - lastPos.current.x;
      const dy = e.touches[0].clientY - lastPos.current.y;
      lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      setOffset((o) => ({ x: o.x + dx, y: o.y + dy }));
    } else if (e.touches.length === 2 && lastTouchDist.current !== null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      const factor = dist / lastTouchDist.current;
      lastTouchDist.current = dist;
      applyScale(scale * factor);
    }
  };
  const onTouchEnd = () => {
    dragging.current = false;
    lastTouchDist.current = null;
  };

  // ── Save — export the visible 280×280 square as JPEG ──
  const handleSave = () => {
    const img = imgRef.current;
    if (!img) return;
    const out = document.createElement("canvas");
    out.width  = SIZE;
    out.height = SIZE;
    const ctx = out.getContext("2d")!;
    ctx.drawImage(img, offset.x, offset.y, img.width * scale, img.height * scale);
    out.toBlob((blob) => { if (blob) onSave(blob); }, "image/jpeg", 0.92);
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-background border border-rule/60 p-6 w-full max-w-[360px]">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted mb-4">
          crop photo
        </p>

        {/* Canvas — CSS border-radius hides the dimmed corners */}
        <div className="flex justify-center mb-3">
          <canvas
            ref={canvasRef}
            width={SIZE}
            height={SIZE}
            className="cursor-grab active:cursor-grabbing block select-none"
            style={{ width: SIZE, height: SIZE, borderRadius: "50%", touchAction: "none" }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onWheel={onWheel}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          />
        </div>

        {/* Zoom slider */}
        <div className="flex items-center gap-3 mb-5 mt-1">
          <button
            className="bg-transparent border-none cursor-pointer text-ink-muted hover:text-ink transition-colors p-0.5 flex-shrink-0"
            onClick={() => applyScale(fitScale.current * sliderToMul(Math.max(0, sliderVal - 10)))}
          >
            <i className="ti ti-zoom-out text-[16px]" />
          </button>
          <input
            type="range"
            min={0}
            max={100}
            value={sliderVal}
            onChange={(e) => {
              const v = Number(e.target.value);
              setSliderVal(v);
              setScale(fitScale.current * sliderToMul(v));
            }}
            className="flex-1 accent-terra cursor-pointer"
          />
          <button
            className="bg-transparent border-none cursor-pointer text-ink-muted hover:text-ink transition-colors p-0.5 flex-shrink-0"
            onClick={() => applyScale(fitScale.current * sliderToMul(Math.min(100, sliderVal + 10)))}
          >
            <i className="ti ti-zoom-in text-[16px]" />
          </button>
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="border border-rule/60 bg-transparent text-ink-muted px-4 py-1.5 font-mono text-[10px] tracking-[0.1em] uppercase cursor-pointer hover:text-ink hover:border-ink transition-colors"
          >
            cancel
          </button>
          <button
            onClick={handleSave}
            className="bg-terra text-[hsl(38_35%_96%)] border-none px-4 py-1.5 font-mono text-[10px] tracking-[0.12em] uppercase cursor-pointer hover:opacity-90 transition-opacity"
          >
            save photo
          </button>
        </div>
      </div>
    </div>
  );
}
