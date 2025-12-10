import React, { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Video, Upload, Camera, StopCircle, RotateCcw, Check } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface VideoUploaderProps {
  onVideoSelected: (file: File) => void;
  maxDuration?: number;
  maxSizeMB?: number;
}

export const VideoUploader: React.FC<VideoUploaderProps> = ({
  onVideoSelected,
  maxDuration = 30,
  maxSizeMB = 50,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedTime, setRecordedTime] = useState(0);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const startCamera = async () => {
    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        videoRef.current.play();
      }
    } catch (error: any) {
      console.error('Camera error:', error);
      setCameraError('Unable to access camera. Please use the upload option.');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const startRecording = async () => {
    if (!streamRef.current) {
      await startCamera();
      if (!streamRef.current) return;
    }

    chunksRef.current = [];
    const mediaRecorder = new MediaRecorder(streamRef.current, {
      mimeType: 'video/webm;codecs=vp9,opus',
    });

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      const file = new File([blob], `recording-${Date.now()}.webm`, { type: 'video/webm' });
      
      if (file.size > maxSizeMB * 1024 * 1024) {
        toast({
          title: "Video too large",
          description: `Maximum file size is ${maxSizeMB}MB`,
          variant: "destructive",
        });
        return;
      }

      setSelectedFile(file);
      setVideoPreview(URL.createObjectURL(blob));
      stopCamera();
    };

    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.start(1000);
    setIsRecording(true);
    setRecordedTime(0);

    timerRef.current = setInterval(() => {
      setRecordedTime((prev) => {
        if (prev >= maxDuration - 1) {
          stopRecording();
          return maxDuration;
        }
        return prev + 1;
      });
    }, 1000);
  };

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [isRecording]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('video/')) {
      toast({
        title: "Invalid file type",
        description: "Please upload a video file",
        variant: "destructive",
      });
      return;
    }

    if (file.size > maxSizeMB * 1024 * 1024) {
      toast({
        title: "Video too large",
        description: `Maximum file size is ${maxSizeMB}MB`,
        variant: "destructive",
      });
      return;
    }

    setSelectedFile(file);
    setVideoPreview(URL.createObjectURL(file));
  };

  const resetVideo = () => {
    setSelectedFile(null);
    setVideoPreview(null);
    setRecordedTime(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const confirmVideo = () => {
    if (selectedFile) {
      onVideoSelected(selectedFile);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="relative aspect-video bg-muted rounded-lg overflow-hidden">
        {videoPreview ? (
          <video
            src={videoPreview}
            controls
            className="w-full h-full object-cover"
          />
        ) : (
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
          />
        )}
        
        {isRecording && (
          <div className="absolute top-4 left-4 flex items-center gap-2 bg-destructive text-destructive-foreground px-3 py-1 rounded-full text-sm font-medium">
            <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
            {formatTime(recordedTime)} / {formatTime(maxDuration)}
          </div>
        )}

        {!videoPreview && !streamRef.current && !cameraError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
            <Video className="w-16 h-16 mb-2" />
            <p>Camera preview will appear here</p>
          </div>
        )}

        {cameraError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground p-4 text-center">
            <Camera className="w-16 h-16 mb-2 text-destructive" />
            <p>{cameraError}</p>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {!videoPreview ? (
          <>
            {!isRecording ? (
              <div className="grid grid-cols-2 gap-3">
                <Button
                  onClick={startRecording}
                  className="flex items-center gap-2"
                  size="lg"
                >
                  <Camera className="w-5 h-5" />
                  Record Video
                </Button>
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2"
                  size="lg"
                >
                  <Upload className="w-5 h-5" />
                  Upload Video
                </Button>
              </div>
            ) : (
              <Button
                onClick={stopRecording}
                variant="destructive"
                className="flex items-center gap-2"
                size="lg"
              >
                <StopCircle className="w-5 h-5" />
                Stop Recording
              </Button>
            )}
          </>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              onClick={resetVideo}
              className="flex items-center gap-2"
              size="lg"
            >
              <RotateCcw className="w-5 h-5" />
              Retake
            </Button>
            <Button
              onClick={confirmVideo}
              className="flex items-center gap-2"
              size="lg"
            >
              <Check className="w-5 h-5" />
              Use This Video
            </Button>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        onChange={handleFileUpload}
        className="hidden"
      />

      <p className="text-xs text-muted-foreground text-center">
        Max {maxDuration} seconds • Max {maxSizeMB}MB • MP4, MOV, or WebM
      </p>
    </Card>
  );
};
