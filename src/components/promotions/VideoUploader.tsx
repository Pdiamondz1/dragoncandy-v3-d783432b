import React, { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Video, Upload, Camera, StopCircle, RotateCcw, Check, SwitchCamera, Smartphone, ImagePlus } from 'lucide-react';
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
  const [cameraActive, setCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nativeCaptureRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const nativePhotoRef = useRef<HTMLInputElement>(null);

  const startCamera = async (mode: 'user' | 'environment' = facingMode) => {
    try {
      setCameraError(null);
      // Stop any existing stream first
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        videoRef.current.play();
      }
      setCameraActive(true);
    } catch (error: any) {
      console.error('Camera error:', error);
      setCameraError('Unable to access camera. Please use the upload option or camera app.');
      setCameraActive(false);
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
    setCameraActive(false);
  };

  const switchCamera = async () => {
    if (isRecording) return; // Don't allow switching during recording
    
    const newMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newMode);
    
    if (cameraActive) {
      await startCamera(newMode);
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

    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');

    if (!isVideo && !isImage) {
      toast({
        title: "Invalid file type",
        description: "Please upload a video or photo file",
        variant: "destructive",
      });
      return;
    }

    if (file.size > maxSizeMB * 1024 * 1024) {
      toast({
        title: "File too large",
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
    if (nativeCaptureRef.current) {
      nativeCaptureRef.current.value = '';
    }
    if (photoInputRef.current) {
      photoInputRef.current.value = '';
    }
    if (nativePhotoRef.current) {
      nativePhotoRef.current.value = '';
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
          selectedFile?.type.startsWith('image/') ? (
            <img src={videoPreview} alt="Preview" className="w-full h-full object-contain" />
          ) : (
            <video src={videoPreview} controls className="w-full h-full object-cover" />
          )
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

        {/* Camera switch button - only show when camera is active and not recording */}
        {cameraActive && !isRecording && !videoPreview && (
          <Button
            variant="secondary"
            size="icon"
            onClick={switchCamera}
            className="absolute top-4 right-4 bg-background/80 backdrop-blur-sm hover:bg-background/90"
          >
            <SwitchCamera className="w-5 h-5" />
          </Button>
        )}

        {!videoPreview && !cameraActive && !cameraError && (
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
              <div className="grid grid-cols-1 gap-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Video</p>
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
                    onClick={() => nativeCaptureRef.current?.click()}
                    className="flex items-center gap-2"
                    size="lg"
                  >
                    <Smartphone className="w-5 h-5" />
                    Camera App
                  </Button>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 w-full"
                  size="lg"
                >
                  <Upload className="w-5 h-5" />
                  Upload Existing Video
                </Button>

                <div className="border-t border-muted my-1" />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Photo</p>
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant="outline"
                    onClick={() => nativePhotoRef.current?.click()}
                    className="flex items-center gap-2"
                    size="lg"
                  >
                    <Camera className="w-5 h-5" />
                    Take Photo
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => photoInputRef.current?.click()}
                    className="flex items-center gap-2"
                    size="lg"
                  >
                    <ImagePlus className="w-5 h-5" />
                    Upload Photo
                  </Button>
                </div>
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
              {selectedFile?.type.startsWith('image/') ? 'Use This Photo' : 'Use This Video'}
            </Button>
          </div>
        )}
      </div>

      {/* Hidden file input for upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* Native camera capture input - opens device camera app */}
      <input
        ref={nativeCaptureRef}
        type="file"
        accept="video/*"
        capture="environment"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* Hidden file input for photo upload */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* Native photo capture input - opens device camera */}
      <input
        ref={nativePhotoRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileUpload}
        className="hidden"
      />

      <p className="text-xs text-muted-foreground text-center">
        Video: Max {maxDuration}s • MP4, MOV, WebM | Photo: JPG, PNG, HEIC • Max {maxSizeMB}MB
      </p>
    </Card>
  );
};
