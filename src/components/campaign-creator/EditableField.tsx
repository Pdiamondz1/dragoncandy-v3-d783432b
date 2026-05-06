import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface EditableFieldProps {
  label: string;
  value: string;
  originalValue: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}

export function EditableField({ label, value, originalValue, onChange, multiline = false }: EditableFieldProps) {
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const isModified = value !== originalValue;

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  if (!isEditing) {
    return (
      <button type="button" className="group cursor-pointer w-full text-left" onClick={() => setIsEditing(true)}>
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</label>
        <p className={`mt-1 text-sm ${isModified ? 'text-gray-900' : 'text-teal-600'}`}>
          {value || <span className="text-gray-400 italic">Click to edit</span>}
        </p>
      </button>
    );
  }

  const handleBlur = () => setIsEditing(false);
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setIsEditing(false);
    if (e.key === 'Enter' && !multiline) setIsEditing(false);
  };

  const commonProps = {
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
    onBlur: handleBlur,
    onKeyDown: handleKeyDown,
    className: 'text-sm',
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</label>
        {isModified && (
          <button
            type="button"
            className="text-xs text-teal-500 hover:text-teal-700"
            onClick={() => { onChange(originalValue); setIsEditing(false); }}
          >
            Reset
          </button>
        )}
      </div>
      {multiline ? (
        <Textarea ref={inputRef as React.RefObject<HTMLTextAreaElement>} rows={3} {...commonProps} />
      ) : (
        <Input ref={inputRef as React.RefObject<HTMLInputElement>} {...commonProps} />
      )}
    </div>
  );
}
