import { createSignal, startTransition } from 'solid-js';
import { decodeQR } from 'qr/decode.js';

const useQRScanner = ({
  videoEl: videoElGetter,
  overlayEl: overlayElGetter,
  onDetected,
}: {
  videoEl: () => HTMLVideoElement | undefined;
  overlayEl?: () => HTMLCanvasElement | undefined;
  onDetected?: (result: string) => void;
}): {
  start: () => void;
  stop: () => void;
  isRunning: () => boolean;
  lastResult: () => string | null;
} => {
  const [isRunning, setIsRunning] = createSignal(false);
  const [lastResult, setLastResult] = createSignal<string | null>(null);

  let mainCanvasEl: OffscreenCanvas | undefined;

  let mediaStream: MediaStream | undefined;
  let animationFrameId: number | undefined;

  const getCanvasContext = <T extends HTMLCanvasElement | OffscreenCanvas>(
    canvas: T
  ) => {
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Cannot get canvas context');
    }
    return context as T extends OffscreenCanvas
      ? OffscreenCanvasRenderingContext2D
      : CanvasRenderingContext2D;
  };

  const clearCanvases = () => {
    const overlayEl = overlayElGetter?.();
    if (overlayEl) {
      const ctx = getCanvasContext(overlayEl);
      ctx.clearRect(0, 0, overlayEl.width, overlayEl.height);
    }
  };

  const stopCamera = () => {
    if (mediaStream) {
      for (const track of mediaStream.getTracks()) {
        track.stop();
      }
      mediaStream = undefined;
    }
  };

  const stopFrameLoop = () => {
    if (animationFrameId !== undefined) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = undefined;
    }
  };

  const stop = () => {
    stopFrameLoop();
    stopCamera();
    clearCanvases();
    setIsRunning(false);
  };

  const drawOverlay = (
    overlayElement: HTMLCanvasElement,
    points: Array<{ x: number; y: number; moduleSize?: number }>
  ) => {
    const ctx = getCanvasContext(overlayElement);
    const height = overlayElement.height;
    const width = overlayElement.width;

    ctx.clearRect(0, 0, width, height);

    // Draw QR detection overlay
    if (points.length >= 4) {
      const [tl, tr, br, bl] = points;

      ctx.fillStyle = 'rgba(0, 255, 0, 0.3)';
      ctx.beginPath();
      ctx.moveTo(tl.x, tl.y);
      ctx.lineTo(tr.x, tr.y);
      ctx.lineTo(br.x, br.y);
      ctx.lineTo(bl.x, bl.y);
      ctx.fill();
      ctx.closePath();

      // Draw finder patterns
      ctx.fillStyle = 'rgba(0, 0, 255, 0.5)';
      for (const p of points) {
        if ('moduleSize' in p && p.moduleSize) {
          const x = p.x - 3 * p.moduleSize;
          const y = p.y - 3 * p.moduleSize;
          const size = 7 * p.moduleSize;
          ctx.fillRect(x, y, size, size);
        }
      }
    }
  };

  const decodeFrame = async () => {
    try {
      const videoEl = videoElGetter();
      const overlayEl = overlayElGetter?.();

      if (!videoEl || !overlayEl) {
        return;
      }

      // Create main canvas if needed
      if (!mainCanvasEl) {
        mainCanvasEl = new OffscreenCanvas(0, 0);
      }

      // Get CSS dimensions of video element for overlay
      const rect = videoEl.getBoundingClientRect();
      const displayWidth = Math.floor(rect.width);
      const displayHeight = Math.floor(rect.height);

      // Set overlay canvas to match display size
      overlayEl.width = displayWidth;
      overlayEl.height = displayHeight;

      // Get video dimensions
      const videoWidth = videoEl.videoWidth;
      const videoHeight = videoEl.videoHeight;

      // Calculate how object-fit: cover crops the video
      // object-cover scales to cover the container while maintaining aspect ratio
      const videoAspect = videoWidth / videoHeight;
      const displayAspect = displayWidth / displayHeight;

      let cropX = 0;
      let cropY = 0;
      let cropWidth = videoWidth;
      let cropHeight = videoHeight;

      if (videoAspect > displayAspect) {
        // Video is wider than display - crop sides
        cropWidth = videoHeight * displayAspect;
        cropX = (videoWidth - cropWidth) / 2;
      } else {
        // Video is taller than display - crop top/bottom
        cropHeight = videoWidth / displayAspect;
        cropY = (videoHeight - cropHeight) / 2;
      }

      // Set main canvas to match the cropped area
      mainCanvasEl.width = displayWidth;
      mainCanvasEl.height = displayHeight;

      // Draw only the visible (cropped) portion of the video
      const ctx = getCanvasContext(mainCanvasEl);
      ctx.drawImage(
        videoEl,
        cropX,
        cropY,
        cropWidth,
        cropHeight, // Source crop
        0,
        0,
        displayWidth,
        displayHeight // Destination
      );

      return decodeQR(ctx.getImageData(0, 0, displayWidth, displayHeight), {
        pointsOnDetect(points) {
          const overlayEl = overlayElGetter?.();
          if (overlayEl) {
            drawOverlay(overlayEl, points);
          }
        },
      });
    } catch {}
  };

  const frameLoop = () => {
    let lastDetectTime = 0;

    const loop = async () => {
      if (!isRunning()) {
        return;
      }

      const videoEl = videoElGetter();
      if (!videoEl) {
        animationFrameId = requestAnimationFrame(loop);
        return;
      }

      const now = Date.now();

      if (250 > now - lastDetectTime) {
        animationFrameId = requestAnimationFrame(loop);
        return;
      }

      const decoded = await decodeFrame();
      if (undefined !== decoded) {
        if (lastResult() !== decoded) {
          onDetected?.(decoded);
        }
        setLastResult(decoded);
      }

      lastDetectTime = now;
      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);
  };

  const start = () => {
    startTransition(async () => {
      const videoEl = videoElGetter();
      const overlayEl = overlayElGetter?.();

      if (isRunning() || !videoEl || !overlayEl) {
        return;
      }

      setLastResult(null);
      setIsRunning(true);

      try {
        if (!mediaStream) {
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: {
              height: { ideal: window.screen.height },
              width: { ideal: window.screen.width },
              facingMode: 'environment',
            },
          });

          videoEl.srcObject = mediaStream;
        }

        try {
          await videoEl.play();
        } catch (e) {
          console.warn('video.play() failed (may require user gesture):', e);
        }

        // Wait for video metadata to load to get correct dimensions
        if (videoEl.videoWidth === 0 || videoEl.videoHeight === 0) {
          await new Promise((resolve) => {
            videoEl!.addEventListener('loadedmetadata', resolve, {
              once: true,
            });
          });
        }

        frameLoop();
      } catch (e) {
        console.error('Failed to start QR scanner:', e);
        stop();
      }
    });
  };

  return {
    start,
    stop,
    isRunning,
    lastResult,
  };
};

export { useQRScanner };
