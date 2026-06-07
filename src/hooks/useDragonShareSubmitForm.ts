// src/hooks/useDragonShareSubmitForm.ts
import { useState, useRef } from 'react';
import { useSubmitDragonSharePost } from '@/hooks/useDragonShare';
import { useDragonShareUpload } from '@/hooks/useDragonShareUpload';
import { detectPlatformFromUrl } from '@/lib/detectPlatform';
import { captureCameraPhoto } from '@/lib/nativeCamera';
import { toast } from 'sonner';
import type { ContentType } from '@/types/dragonshare';
import type { RestaurantSearchResult } from '@/hooks/useRestaurantSearch';

export function useDragonShareSubmitForm() {
  const submitMutation = useSubmitDragonSharePost();
  const { upload, uploading } = useDragonShareUpload();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploadedFileType, setUploadedFileType] = useState<string | null>(null);
  const [postUrl, setPostUrl] = useState('');
  const [selectedOrg, setSelectedOrg] = useState<RestaurantSearchResult | null>(null);
  const [submittedOrgName, setSubmittedOrgName] = useState<string | null>(null);

  const detectedPlatform = postUrl ? detectPlatformFromUrl(postUrl) : null;

  const contentType: ContentType | null = uploadedFileType
    ? (uploadedFileType.startsWith('video/') ? 'video' : 'photo')
    : null;

  const canSubmit = (!!uploadedUrl || !!postUrl.trim()) && !!selectedOrg && !submitMutation.isPending && !uploading;

  function reset() {
    setUploadedUrl(null);
    setUploadedFileName(null);
    setUploadedFileType(null);
    setPostUrl('');
    setSelectedOrg(null);
  }

  async function ingestFile(file: File) {
    const url = await upload(file);
    if (url) {
      setUploadedUrl(url);
      setUploadedFileName(file.name);
      setUploadedFileType(file.type);
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await ingestFile(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function captureFromCamera() {
    const file = await captureCameraPhoto();
    if (file) await ingestFile(file);
  }

  function removeUpload() {
    setUploadedUrl(null);
    setUploadedFileName(null);
    setUploadedFileType(null);
  }

  async function handleSubmit() {
    if (!selectedOrg) return;
    if (!uploadedUrl && !postUrl.trim()) return;

    const orgName = selectedOrg.name;
    try {
      await submitMutation.mutateAsync({
        target_org_id: selectedOrg.id,
        content_type: contentType ?? 'photo',
        post_url: postUrl.trim() || null,
        platform: detectedPlatform,
        content_file_path: uploadedUrl,
      });
      reset();
      setSubmittedOrgName(orgName);
    } catch {
      toast.error('Submission failed. Please try again.');
    }
  }

  function clearSubmitted() {
    setSubmittedOrgName(null);
  }

  return {
    // State
    uploadedUrl,
    uploadedFileName,
    uploadedFileType,
    postUrl,
    setPostUrl,
    selectedOrg,
    setSelectedOrg,
    submittedOrgName,
    detectedPlatform,
    contentType,
    canSubmit,
    submitting: submitMutation.isPending,
    uploading,
    fileInputRef,
    // Actions
    handleFileSelect,
    captureFromCamera,
    removeUpload,
    handleSubmit,
    reset,
    clearSubmitted,
  };
}
