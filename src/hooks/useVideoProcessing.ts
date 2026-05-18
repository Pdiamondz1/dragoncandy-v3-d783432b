import { useState, useCallback } from 'react';
import {
  needsTranscoding,
  transcodeToMp4,
  extractThumbnail,
} from '@/lib/videoProcessing';

type ProcessingStatus =
  | 'idle'
  | 'loading-ffmpeg'
  | 'transcoding'
  | 'extracting-thumbnail'
  | 'complete'
  | 'error';

export interface VideoProcessingState {
  status: ProcessingStatus;
  progress: number;
  statusMessage: string;
}

interface ProcessVideoResult {
  videoFile: File;
  thumbnail: Blob | null;
  wasTranscoded: boolean;
}

export function useVideoProcessing() {
  const [state, setState] = useState<VideoProcessingState>({
    status: 'idle',
    progress: 0,
    statusMessage: '',
  });

  const processVideo = useCallback(async (file: File): Promise<ProcessVideoResult> => {
    const shouldTranscode = needsTranscoding(file.type);
    let videoFile = file;
    let wasTranscoded = false;

    if (shouldTranscode) {
      setState({ status: 'loading-ffmpeg', progress: 5, statusMessage: 'Loading video processor…' });

      videoFile = await transcodeToMp4(file, (pct) => {
        setState({
          status: 'transcoding',
          progress: 10 + Math.round(pct * 0.6),
          statusMessage: `Converting video for browser playback… ${pct}%`,
        });
      });
      wasTranscoded = true;
    }

    setState({ status: 'extracting-thumbnail', progress: 75, statusMessage: 'Generating thumbnail…' });
    const thumbnail = await extractThumbnail(videoFile);

    setState({ status: 'complete', progress: 100, statusMessage: 'Processing complete' });
    return { videoFile, thumbnail, wasTranscoded };
  }, []);

  const reset = useCallback(() => {
    setState({ status: 'idle', progress: 0, statusMessage: '' });
  }, []);

  return { state, processVideo, reset };
}
