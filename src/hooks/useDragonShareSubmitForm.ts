// src/hooks/useDragonShareSubmitForm.ts
import { useState, useRef, useEffect } from 'react';
import { useSubmitDragonSharePost } from '@/hooks/useDragonShare';
import { useDragonShareUpload } from '@/hooks/useDragonShareUpload';
import { detectPlatformFromUrl } from '@/lib/detectPlatform';
import { captureCameraPhoto } from '@/lib/nativeCamera';
import { toast } from 'sonner';
import type { ContentType } from '@/types/dragonshare';
import type { RestaurantSearchResult } from '@/hooks/useRestaurantSearch';

// Persist the in-progress draft so the uploaded content survives navigation/remount
// (e.g. opening "Browse all restaurants" and coming back). uploadedUrl is a durable
// Supabase public storage URL — not a blob — so it's safe to restore from storage.
const DRAFT_KEY = 'dragonshare-draft';

interface DragonShareDraft {
  uploadedUrl: string | null;
  uploadedFileName: string | null;
  uploadedFileType: string | null;
  postUrl: string;
}

const EMPTY_DRAFT: DragonShareDraft = {
  uploadedUrl: null,
  uploadedFileName: null,
  uploadedFileType: null,
  postUrl: '',
};

function loadDraft(): DragonShareDraft {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return EMPTY_DRAFT;
    const parsed = JSON.parse(raw) as Partial<DragonShareDraft>;
    return {
      uploadedUrl: parsed.uploadedUrl ?? null,
      uploadedFileName: parsed.uploadedFileName ?? null,
      uploadedFileType: parsed.uploadedFileType ?? null,
      postUrl: parsed.postUrl ?? '',
    };
  } catch {
    return EMPTY_DRAFT;
  }
}

function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    /* sessionStorage unavailable — ignore */
  }
}

export function useDragonShareSubmitForm(sourceBriefId?: string | null) {
  const submitMutation = useSubmitDragonSharePost();
  const { upload, uploading } = useDragonShareUpload();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const initialDraft = loadDraft();
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(initialDraft.uploadedUrl);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(initialDraft.uploadedFileName);
  const [uploadedFileType, setUploadedFileType] = useState<string | null>(initialDraft.uploadedFileType);
  const [postUrl, setPostUrl] = useState(initialDraft.postUrl);
  const [selectedOrg, setSelectedOrg] = useState<RestaurantSearchResult | null>(null);
  const [submittedOrgName, setSubmittedOrgName] = useState<string | null>(null);

  // Capture the originating brief id when it first arrives — it must survive the
  // page clearing the ?brief= URL param (same reason selectedOrg is captured).
  const [capturedBriefId, setCapturedBriefId] = useState<string | null>(null);
  useEffect(() => {
    if (sourceBriefId) setCapturedBriefId(sourceBriefId);
  }, [sourceBriefId]);

  // Keep the persisted draft in sync with the upload/link fields.
  useEffect(() => {
    if (!uploadedUrl && !postUrl.trim()) {
      clearDraft();
      return;
    }
    try {
      sessionStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ uploadedUrl, uploadedFileName, uploadedFileType, postUrl }),
      );
    } catch {
      /* sessionStorage unavailable — ignore */
    }
  }, [uploadedUrl, uploadedFileName, uploadedFileType, postUrl]);

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
    setCapturedBriefId(null);
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
        source_brief_id: capturedBriefId,
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
