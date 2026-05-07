import { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';

interface AvatarCropModalProps {
  open: boolean;
  imageSrc: string;
  cropShape?: 'round' | 'rect';
  onComplete: (croppedFile: File) => void;
  onCancel: () => void;
}

async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<Blob> {
  const image = new Image();
  image.src = imageSrc;
  await new Promise<void>((resolve) => {
    image.onload = () => resolve();
  });

  const canvas = document.createElement('canvas');
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  const ctx = canvas.getContext('2d')!;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height,
  );

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.9);
  });
}

export function AvatarCropModal({
  open,
  imageSrc,
  cropShape = 'round',
  onComplete,
  onCancel,
}: AvatarCropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const handleSave = async () => {
    if (!croppedAreaPixels) return;
    const blob = await getCroppedImg(imageSrc, croppedAreaPixels);
    const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
    onComplete(file);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="max-w-sm p-0 overflow-hidden">
        <DialogTitle className="px-6 pt-6 text-center">Adjust Photo</DialogTitle>
        <div className="relative w-full" style={{ height: 300 }}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape={cropShape}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>
        <div className="px-6 pb-2">
          <Slider
            value={[zoom]}
            min={1}
            max={3}
            step={0.1}
            onValueChange={([val]) => setZoom(val)}
          />
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <Button
            variant="outline"
            className="flex-1 rounded-full"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            className="flex-1 rounded-full bg-teal-400 hover:bg-dc-teal-btn-hover text-white"
            onClick={handleSave}
          >
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
