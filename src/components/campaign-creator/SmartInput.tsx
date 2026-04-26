import { useState, useCallback, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Link, Image, PenLine } from 'lucide-react';

interface SmartInputProps {
  onSubmit: (value: string, mode: 'url' | 'photo' | 'text') => void;
  isExtracting: boolean;
}

const PLACEHOLDERS = [
  'Paste your Google Business link...',
  'Paste your Instagram profile...',
  'Or just describe your restaurant...',
];

export function SmartInput({ onSubmit, isExtracting }: SmartInputProps) {
  const [value, setValue] = useState('');
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex((i) => (i + 1) % PLACEHOLDERS.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text');
    if (pasted && (pasted.startsWith('http://') || pasted.startsWith('https://'))) {
      e.preventDefault();
      setValue(pasted);
      onSubmit(pasted, 'url');
    }
  }, [onSubmit]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && value.trim()) {
      const isUrl = value.startsWith('http://') || value.startsWith('https://');
      onSubmit(value.trim(), isUrl ? 'url' : 'text');
    }
  }, [value, onSubmit]);

  const handlePhotoUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    onSubmit(objectUrl, 'photo');
  }, [onSubmit]);

  const handleUrlButtonClick = useCallback(() => {
    if (value.trim()) {
      const isUrl = value.startsWith('http://') || value.startsWith('https://');
      onSubmit(value.trim(), isUrl ? 'url' : 'text');
    }
  }, [value, onSubmit]);

  const handleTextButtonClick = useCallback(() => {
    if (value.trim()) onSubmit(value.trim(), 'text');
  }, [value, onSubmit]);

  return (
    <div className="w-full space-y-4">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        placeholder={PLACEHOLDERS[placeholderIndex]}
        disabled={isExtracting}
        className="h-14 text-lg rounded-full px-6 bg-white border-teal-300 focus:border-teal-400 focus:ring-teal-400/20"
      />
      <div className="flex justify-center gap-3">
        <Button
          variant="outline"
          size="sm"
          className="rounded-full text-xs"
          disabled={isExtracting}
          onClick={handleUrlButtonClick}
        >
          <Link className="w-3 h-3 mr-1" /> Paste URL
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="rounded-full text-xs"
          disabled={isExtracting}
          onClick={() => fileInputRef.current?.click()}
        >
          <Image className="w-3 h-3 mr-1" /> Upload Photo
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="rounded-full text-xs"
          disabled={isExtracting}
          onClick={handleTextButtonClick}
        >
          <PenLine className="w-3 h-3 mr-1" /> Type it
        </Button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handlePhotoUpload}
      />
    </div>
  );
}
