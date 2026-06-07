// @vitest-environment jsdom
// src/components/dragonshare/DragonShareUploadArea.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

let mockPlatform = { isNative: false, isIOS: false };
vi.mock('@/hooks/use-native-platform', () => ({
  useNativePlatform: () => mockPlatform,
}));

import { DragonShareUploadArea } from './DragonShareUploadArea';

const baseForm = {
  fileInputRef: { current: null },
  handleFileSelect: vi.fn(),
  captureFromCamera: vi.fn(),
  removeUpload: vi.fn(),
  uploadedUrl: null,
  uploadedFileName: null,
  uploadedFileType: null,
  uploading: false,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

describe('DragonShareUploadArea', () => {
  it('shows a single upload button on web', () => {
    mockPlatform = { isNative: false, isIOS: false };
    render(<DragonShareUploadArea form={baseForm} />);
    expect(screen.getByText(/Tap to upload/i)).toBeTruthy(); // getByText throws if absent
    expect(screen.queryByText(/Take photo/i)).toBeNull();
  });

  it('shows Take photo + Choose buttons on iOS', () => {
    mockPlatform = { isNative: true, isIOS: true };
    render(<DragonShareUploadArea form={baseForm} />);
    expect(screen.getByText(/Take photo/i)).toBeTruthy();
    expect(screen.getByText(/Choose photo or video/i)).toBeTruthy();
  });
});
