import { useEffect, useRef, useState } from 'react';
import { CameraOff, X } from 'lucide-react';
import jsQR from 'jsqr';
import { useTranslation } from 'react-i18next';
import { joinCodeFromScan } from '../join-url';
import { Button } from './Button';

type BarcodeDetectorLike = {
  detect: (
    source: ImageBitmapSource,
  ) => Promise<Array<{ rawValue: string }>>;
};

function createBarcodeDetector(): BarcodeDetectorLike | null {
  const Detector = (
    window as Window & {
      BarcodeDetector?: new (options: {
        formats: string[];
      }) => BarcodeDetectorLike;
    }
  ).BarcodeDetector;
  if (!Detector) {
    return null;
  }
  try {
    return new Detector({ formats: ['qr_code'] });
  } catch {
    return null;
  }
}

/**
 * Opens the rear camera and reads a join QR. BarcodeDetector is preferred when
 * the browser has it; otherwise each frame is decoded with jsQR so iPhones
 * still work.
 */
export function QrScannerDialog({
  onDetect,
  onClose,
}: {
  onDetect: (joinCode: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onDetectRef = useRef(onDetect);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    onDetectRef.current = onDetect;
  }, [onDetect]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    let frame = 0;
    const detector = createBarcodeDetector();

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(t('scanner.noCamera'));
        setStarting(false);
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
      } catch {
        if (!cancelled) {
          setError(t('scanner.permissionDenied'));
          setStarting(false);
        }
        return;
      }
      if (cancelled) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
        return;
      }
      const video = videoRef.current;
      if (!video) {
        return;
      }
      video.srcObject = stream;
      await video.play();
      setStarting(false);

      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d', { willReadFrequently: true });
      const tick = async () => {
        if (cancelled || !video || video.readyState < 2) {
          frame = window.requestAnimationFrame(() => void tick());
          return;
        }
        let raw: string | null = null;
        if (detector) {
          try {
            const codes = await detector.detect(video);
            raw = codes[0]?.rawValue ?? null;
          } catch {
            raw = null;
          }
        } else if (canvas && context) {
          const width = video.videoWidth;
          const height = video.videoHeight;
          if (width > 0 && height > 0) {
            canvas.width = width;
            canvas.height = height;
            context.drawImage(video, 0, 0, width, height);
            const image = context.getImageData(0, 0, width, height);
            raw = jsQR(image.data, width, height)?.data ?? null;
          }
        }
        const code = raw ? joinCodeFromScan(raw) : null;
        if (code) {
          onDetectRef.current(code);
          return;
        }
        frame = window.requestAnimationFrame(() => void tick());
      };
      frame = window.requestAnimationFrame(() => void tick());
    }

    void start();
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      if (stream) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
      }
    };
  }, [t]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('scanner.ariaLabel')}
      className="bg-void/95 fixed inset-0 z-[80] flex flex-col p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-md"
    >
      <header className="mb-3 flex shrink-0 items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold">{t('scanner.title')}</h2>
          <p className="text-muted text-xs">{t('scanner.hint')}</p>
        </div>
        <button
          type="button"
          aria-label={t('scanner.closeScanner')}
          onClick={onClose}
          className="border-muted/25 text-muted hover:text-ink flex size-9 items-center justify-center rounded-full border"
        >
          <X size={18} aria-hidden />
        </button>
      </header>
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-muted/25 bg-void">
        <video
          ref={videoRef}
          playsInline
          muted
          className="absolute inset-0 size-full object-cover"
        />
        <canvas ref={canvasRef} className="hidden" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-[18%] rounded-2xl border-2 border-neon/70 shadow-[0_0_0_9999px_color-mix(in_oklab,var(--color-void)_55%,transparent)]"
        />
        {starting && !error ? (
          <p className="text-muted absolute inset-0 flex items-center justify-center text-sm">
            {t('scanner.openingCamera')}
          </p>
        ) : null}
        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-void/90 p-6 text-center">
            <CameraOff size={28} aria-hidden className="text-danger" />
            <p className="text-sm">{error}</p>
            <Button variant="glass" onClick={onClose}>
              {t('common.close')}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
