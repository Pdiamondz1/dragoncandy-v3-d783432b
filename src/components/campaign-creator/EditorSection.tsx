import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface EditorSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  id?: string;
}

export function EditorSection({ title, defaultOpen = true, children, id }: EditorSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div id={id} className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-teal-50 px-4 py-3 flex items-center justify-between"
      >
        <span className="font-semibold text-sm text-gray-900">{title}</span>
        {isOpen ? (
          <ChevronDown className="w-4 h-4 text-teal-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400" />
        )}
      </button>
      {isOpen && (
        <div className="px-4 py-3 border-t border-gray-200 space-y-3">
          {children}
        </div>
      )}
    </div>
  );
}
