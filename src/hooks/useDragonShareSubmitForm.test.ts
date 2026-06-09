// @vitest-environment jsdom
// src/hooks/useDragonShareSubmitForm.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const uploadMock = vi.fn();
vi.mock('@/hooks/useDragonShareUpload', () => ({
  useDragonShareUpload: () => ({ upload: uploadMock, uploading: false }),
}));
vi.mock('@/hooks/useDragonShare', () => ({
  useSubmitDragonSharePost: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
const captureMock = vi.fn();
vi.mock('@/lib/nativeCamera', () => ({ captureCameraPhoto: () => captureMock() }));

import { useDragonShareSubmitForm } from './useDragonShareSubmitForm';

describe('useDragonShareSubmitForm camera + file paths', () => {
  // The hook persists an in-progress draft to sessionStorage; clear it between
  // cases so a prior test's upload doesn't restore into the next hook instance.
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('captureFromCamera uploads the captured file and sets uploaded state', async () => {
    const file = new File(['x'], 'dragonshare-capture.jpeg', { type: 'image/jpeg' });
    captureMock.mockResolvedValue(file);
    uploadMock.mockResolvedValue('https://cdn/x.jpeg');

    const { result } = renderHook(() => useDragonShareSubmitForm());
    await act(async () => { await result.current.captureFromCamera(); });

    expect(uploadMock).toHaveBeenCalledWith(file);
    expect(result.current.uploadedUrl).toBe('https://cdn/x.jpeg');
    expect(result.current.uploadedFileType).toBe('image/jpeg');
  });

  it('captureFromCamera does nothing when capture returns null', async () => {
    captureMock.mockResolvedValue(null);
    const { result } = renderHook(() => useDragonShareSubmitForm());
    await act(async () => { await result.current.captureFromCamera(); });
    expect(uploadMock).not.toHaveBeenCalled();
    expect(result.current.uploadedUrl).toBeNull();
  });

  it('handleFileSelect still uploads via the shared ingest path', async () => {
    const file = new File(['x'], 'pic.png', { type: 'image/png' });
    uploadMock.mockResolvedValue('https://cdn/pic.png');
    const { result } = renderHook(() => useDragonShareSubmitForm());
    await act(async () => {
      await result.current.handleFileSelect({
        target: { files: [file], value: 'pic.png' },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });
    expect(uploadMock).toHaveBeenCalledWith(file);
    expect(result.current.uploadedUrl).toBe('https://cdn/pic.png');
  });
});
