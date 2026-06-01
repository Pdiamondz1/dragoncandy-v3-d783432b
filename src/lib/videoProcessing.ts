const TRANSCODE_MIME_TYPES = new Set([
  'video/quicktime',
  'video/x-msvideo',
  'video/avi',
]);

export const MAX_TRANSCODE_SIZE = 50 * 1024 * 1024; // 50MB

export function needsTranscoding(mimeType: string): boolean {
  return TRANSCODE_MIME_TYPES.has(mimeType);
}

export function canTranscode(file: File): boolean {
  return needsTranscoding(file.type) && file.size <= MAX_TRANSCODE_SIZE;
}

export async function transcodeToMp4(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<File> {
  if (file.size > MAX_TRANSCODE_SIZE) {
    throw new Error(`Video too large for browser transcoding (${Math.round(file.size / 1024 / 1024)}MB, max ${MAX_TRANSCODE_SIZE / 1024 / 1024}MB)`);
  }

  const { FFmpeg } = await import('@ffmpeg/ffmpeg');
  const { fetchFile } = await import('@ffmpeg/util');

  const ffmpeg = new FFmpeg();

  try {
    ffmpeg.on('progress', ({ progress }) => {
      onProgress?.(Math.round(Math.max(0, Math.min(1, progress)) * 100));
    });

    await ffmpeg.load({
      coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js',
      wasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm',
    });

    const inputName = 'input' + getExtension(file.name);
    const outputName = 'output.mp4';

    await ffmpeg.writeFile(inputName, await fetchFile(file));

    await ffmpeg.exec([
      '-i', inputName,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-c:a', 'aac',
      '-movflags', '+faststart',
      outputName,
    ]);

    const data = await ffmpeg.readFile(outputName);

    await ffmpeg.deleteFile(inputName);
    await ffmpeg.deleteFile(outputName);

    const uint8 = data instanceof Uint8Array ? data : new TextEncoder().encode(data as string);

    const baseName = file.name.replace(/\.[^.]+$/, '');
    return new File([new Blob([uint8 as BlobPart])], `${baseName}.mp4`, { type: 'video/mp4' });
  } finally {
    ffmpeg.terminate();
  }
}

export async function extractThumbnail(file: File): Promise<Blob | null> {
  return new Promise<Blob | null>((resolve) => {
    const video = document.createElement('video');
    const objectUrl = URL.createObjectURL(file);
    let settled = false;

    const cleanup = () => {
      clearTimeout(timeout);
      URL.revokeObjectURL(objectUrl);
      video.removeAttribute('src');
      video.load();
    };

    const fail = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(null);
    };

    const timeout = setTimeout(fail, 10_000);

    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';

    video.addEventListener('error', fail, { once: true });

    video.addEventListener('loadedmetadata', () => {
      const seekTarget = Math.min(1, video.duration * 0.25);
      video.currentTime = seekTarget;
    }, { once: true });

    video.addEventListener('seeked', () => {
      if (settled) return;
      settled = true;
      cleanup();

      try {
        const canvas = document.createElement('canvas');
        const maxWidth = 640;
        const scale = Math.min(1, maxWidth / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);

        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(null); return; }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => { resolve(blob); },
          'image/jpeg',
          0.8,
        );
      } catch {
        resolve(null);
      }
    }, { once: true });

    video.src = objectUrl;
  });
}

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot) : '';
}
