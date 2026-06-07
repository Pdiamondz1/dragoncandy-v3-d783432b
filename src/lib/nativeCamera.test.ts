// src/lib/nativeCamera.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getPhoto = vi.fn();
vi.mock('@capacitor/camera', () => ({
  Camera: { getPhoto: (...args: unknown[]) => getPhoto(...args) },
  CameraResultType: { Uri: 'uri' },
  CameraSource: { Camera: 'CAMERA' },
}));

const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { error: (...a: unknown[]) => toastError(...a) } }));

import { captureCameraPhoto } from './nativeCamera';

describe('captureCameraPhoto', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      blob: async () => new Blob(['x'], { type: 'image/jpeg' }),
    }) as unknown as typeof fetch;
  });

  it('returns a File with a real name + type on success', async () => {
    getPhoto.mockResolvedValue({ webPath: 'capacitor://localhost/x.jpg', format: 'jpeg' });
    const file = await captureCameraPhoto();
    expect(file).toBeInstanceOf(File);
    expect(file?.name).toBe('dragonshare-capture.jpeg');
    expect(file?.type).toBe('image/jpeg');
    expect(toastError).not.toHaveBeenCalled();
  });

  it('returns null with no toast when the user cancels', async () => {
    getPhoto.mockRejectedValue(new Error('User cancelled photos app'));
    const file = await captureCameraPhoto();
    expect(file).toBeNull();
    expect(toastError).not.toHaveBeenCalled();
  });

  it('returns null and toasts on a permission/other error', async () => {
    getPhoto.mockRejectedValue(new Error('User denied access to camera'));
    const file = await captureCameraPhoto();
    expect(file).toBeNull();
    expect(toastError).toHaveBeenCalledTimes(1);
  });

  it('returns null and toasts when reading the captured photo fails', async () => {
    getPhoto.mockResolvedValue({ webPath: 'capacitor://localhost/x.jpg', format: 'jpeg' });
    global.fetch = vi.fn().mockRejectedValue(new Error('network')) as unknown as typeof fetch;
    const file = await captureCameraPhoto();
    expect(file).toBeNull();
    expect(toastError).toHaveBeenCalledTimes(1);
  });
});
