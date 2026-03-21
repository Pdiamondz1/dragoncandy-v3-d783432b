
import React from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';

interface AvatarUploadProps {
  avatarFile: File | null;
  onAvatarFileChange: (file: File | null) => void;
}

export const AvatarUpload = ({ avatarFile, onAvatarFileChange }: AvatarUploadProps) => {
  return (
    <div>
      <Label>Profile Picture</Label>
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
        <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <div className="text-sm text-gray-600 mb-2">
          {avatarFile ? avatarFile.name : 'Upload your profile picture'}
        </div>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => onAvatarFileChange(e.target.files?.[0] || null)}
          className="hidden"
          id="avatar-upload"
        />
        <Button type="button" variant="outline" asChild>
          <label htmlFor="avatar-upload" className="cursor-pointer">
            Choose File
          </label>
        </Button>
      </div>
    </div>
  );
};
