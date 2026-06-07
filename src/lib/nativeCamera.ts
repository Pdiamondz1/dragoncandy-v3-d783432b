// src/lib/nativeCamera.ts
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { toast } from 'sonner';

/**
 * Capture a single photo with the native camera and return it as a File ready
 * for the DragonShare upload pipeline. Returns null on cancel or error.
 * Plain async function (no React state) so it can be called from event handlers.
 */
export async function captureCameraPhoto(): Promise<File | null> {
  let photo;
  try {
    photo = await Camera.getPhoto({
      source: CameraSource.Camera,
      resultType: CameraResultType.Uri,
      quality: 80,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/cancel/i.test(message)) return null; // user dismissed the camera
    toast.error('Camera access is off — enable it in Settings, or choose from your library');
    return null;
  }

  try {
    if (!photo.webPath) return null;
    const blob = await fetch(photo.webPath).then((r) => r.blob());
    const fmt = photo.format ?? 'jpeg';
    return new File([blob], `dragonshare-capture.${fmt}`, {
      type: blob.type || `image/${fmt}`,
    });
  } catch {
    toast.error("Couldn't read the photo — try again");
    return null;
  }
}
