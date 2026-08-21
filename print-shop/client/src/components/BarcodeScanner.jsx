import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';

const FORMATS = [
  BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.EAN_13, BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.ITF, BarcodeFormat.QR_CODE,
  BarcodeFormat.DATA_MATRIX,
];

const hints = new Map([
  [DecodeHintType.POSSIBLE_FORMATS, FORMATS],
  [DecodeHintType.TRY_HARDER, true],
]);

/** Short confirmation tone — useful when the iPad is propped up out of reach. */
function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    setTimeout(() => { osc.stop(); ctx.close(); }, 110);
  } catch { /* audio is a nicety, never a blocker */ }
}

/**
 * Camera scanner for the iPad, with a always-focused text box so a USB or
 * Bluetooth wedge scanner (and plain typing) works on the desktop too.
 */
export default function BarcodeScanner({ open, onClose, onScan, title = 'Scan', hint }) {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const lastScanRef = useRef({ code: null, at: 0 });
  const inputRef = useRef(null);

  const [cameraOn, setCameraOn] = useState(true);
  const [error, setError] = useState('');
  const [manual, setManual] = useState('');

  function submit(code) {
    const value = String(code || '').trim();
    if (!value) return;
    const now = Date.now();
    // Continuous decoding fires many times a second on the same label.
    if (lastScanRef.current.code === value && now - lastScanRef.current.at < 2500) return;
    lastScanRef.current = { code: value, at: now };
    beep();
    if (navigator.vibrate) navigator.vibrate(40);
    onScan(value);
  }

  useEffect(() => {
    if (!open) return undefined;
    setManual('');
    lastScanRef.current = { code: null, at: 0 };
    const timer = setTimeout(() => inputRef.current?.focus(), 150);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open || !cameraOn) return undefined;
    let cancelled = false;
    setError('');

    if (!window.isSecureContext) {
      setError('The camera needs an https:// address. Use the deployed site, or type/scan the code below.');
      return undefined;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser will not share a camera. Type or wedge-scan the code below.');
      return undefined;
    }

    const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 120 });
    reader
      .decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } } },
        videoRef.current,
        (result) => { if (result) submit(result.getText()); }
      )
      .then((controls) => {
        if (cancelled) controls.stop();
        else controlsRef.current = controls;
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err?.name === 'NotAllowedError'
            ? 'Camera access was blocked. Allow it in Safari settings, or type the code below.'
            : 'No camera available here. Type or wedge-scan the code below.'
        );
      });

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cameraOn]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-linen">
          <div>
            <h2 className="text-lg font-bold text-primary">{title}</h2>
            {hint && <p className="text-xs text-gray-500">{hint}</p>}
          </div>
          <button onClick={onClose} className="text-silver hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="relative bg-black aspect-[4/3]">
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline autoPlay />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="w-[78%] h-[42%] border-2 border-white/80 rounded-xl shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          </div>
          {(error || !cameraOn) && (
            <div className="absolute inset-0 bg-primary/95 text-white flex items-center justify-center p-6 text-center text-sm">
              {error || 'Camera paused'}
            </div>
          )}
        </div>

        <div className="p-5 space-y-3">
          <form
            onSubmit={(e) => { e.preventDefault(); submit(manual); setManual(''); }}
          >
            <label className="label">Or scan with a handheld / type it in</label>
            <div className="flex gap-2">
              <input
                ref={inputRef}
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                className="input font-mono"
                placeholder="HM-FIL-0001"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="characters"
              />
              <button type="submit" className="btn-primary shrink-0">Go</button>
            </div>
          </form>

          <div className="flex items-center justify-between">
            <button onClick={() => setCameraOn((v) => !v)} className="btn-ghost text-xs">
              {cameraOn ? 'Turn camera off' : 'Turn camera on'}
            </button>
            <button onClick={onClose} className="btn-secondary text-xs">Done</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
