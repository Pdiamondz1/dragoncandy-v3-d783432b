import { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Link, Image, PenLine, X, Sparkles } from 'lucide-react';

interface SmartInputProps {
  onSubmit: (value: string, mode: 'url' | 'photo' | 'text') => void;
  isExtracting: boolean;
  externalValue?: string;
}

interface Attachment {
  type: 'url' | 'photo';
  value: string;
  name?: string;
}

const PLACEHOLDERS = [
  'Paste your Google Business link…',
  'Paste your Instagram profile…',
  'Or just describe your restaurant…',
];

export function SmartInput({ onSubmit, isExtracting, externalValue }: SmartInputProps) {
  const [value, setValue] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex((i) => (i + 1) % PLACEHOLDERS.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (externalValue !== undefined) {
      setValue(externalValue);
    }
  }, [externalValue]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(56, el.scrollHeight)}px`;
  }, [value]);

  const handleSubmit = useCallback(() => {
    const text = value.trim();
    if (!text && attachments.length === 0) return;
    const hasUrl = attachments.some((a) => a.type === 'url') ||
      text.startsWith('http://') || text.startsWith('https://');
    const hasPhoto = attachments.some((a) => a.type === 'photo');
    const mode = hasPhoto ? 'photo' : hasUrl ? 'url' : 'text';
    const parts = [text, ...attachments.map((a) => a.value)].filter(Boolean);
    onSubmit(parts.join('\n'), mode);
  }, [value, attachments, onSubmit]);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = e.clipboardData.getData('text');
    if (pasted && (pasted.startsWith('http://') || pasted.startsWith('https://'))) {
      e.preventDefault();
      setAttachments((prev) => [...prev, { type: 'url', value: pasted }]);
    }
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  const handlePhotoUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    setAttachments((prev) => [...prev, { type: 'photo', value: objectUrl, name: file.name }]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleUrlButtonClick = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && (text.startsWith('http://') || text.startsWith('https://'))) {
        setAttachments((prev) => [...prev, { type: 'url', value: text }]);
      } else {
        textareaRef.current?.focus();
      }
    } catch {
      textareaRef.current?.focus();
    }
  }, []);

  const handleTextButtonClick = useCallback(() => {
    textareaRef.current?.focus();
  }, []);

  return (
    <div className="w-full space-y-4">
      <div className="rounded-2xl border-2 border-teal-300 bg-white focus-within:border-teal-400 focus-within:ring-2 focus-within:ring-teal-400/20 overflow-hidden">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          placeholder={PLACEHOLDERS[placeholderIndex]}
          disabled={isExtracting}
          rows={1}
          className="w-full min-h-[56px] max-h-[200px] text-lg px-6 py-4 bg-transparent border-none outline-none resize-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
        />
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 px-4 pb-3">
            {attachments.map((att, i) => (
              <div key={i} className="flex items-center gap-2 bg-teal-50 border border-teal-200 rounded-full px-3 py-1.5 text-xs max-w-[280px]">
                {att.type === 'url' ? (
                  <>
                    <Link className="w-3 h-3 text-teal-600 flex-shrink-0" />
                    <span className="truncate text-gray-700">{att.value}</span>
                  </>
                ) : (
                  <>
                    <Image className="w-3 h-3 text-teal-600 flex-shrink-0" />
                    <span className="truncate text-gray-700">{att.name || 'Photo'}</span>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => removeAttachment(i)}
                  className="flex-shrink-0 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      {attachments.some((a) => a.type === 'url') && !value.trim() && (
        <p className="text-[11px] text-gray-500 text-center">
          Tip: add a description too — "steak dinner promo" helps Donny even if the link is hard to read
        </p>
      )}
      {(value.trim() || attachments.length > 0) && (
        <Button
          className="w-full rounded-full bg-dc-teal-btn hover:bg-dc-teal-btn-hover text-white font-semibold text-base py-6"
          disabled={isExtracting}
          onClick={handleSubmit}
        >
          <Sparkles className="w-4 h-4 mr-2" />
          {isExtracting ? 'Generating…' : 'Generate Campaign'}
        </Button>
      )}
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
