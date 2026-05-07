import { Camera, Film, Layers } from 'lucide-react';
import type { ContentSource } from '@/types/campaignMedia';

interface ContentSourceSelectorProps {
  value: ContentSource;
  onChange: (value: ContentSource) => void;
}

const options: {
  value: ContentSource;
  icon: React.ElementType;
  title: string;
  subtitle: string;
}[] = [
  {
    value: 'creator_shoots',
    icon: Camera,
    title: 'Creator shoots new content',
    subtitle: 'A creator will visit your restaurant and create fresh content',
  },
  {
    value: 'business_footage',
    icon: Film,
    title: 'I have footage — creator edits it',
    subtitle: 'Upload your own photos or video and a creator will produce polished content',
  },
  {
    value: 'hybrid',
    icon: Layers,
    title: 'Mix of both',
    subtitle: 'Some new content + some using your footage',
  },
];

export const ContentSourceSelector = ({ value, onChange }: ContentSourceSelectorProps) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
      {options.map((option) => {
        const isSelected = value === option.value;
        const Icon = option.icon;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={[
              'flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-colors',
              isSelected
                ? 'border-dc-teal bg-teal-50'
                : 'border-gray-200 bg-white hover:border-gray-300',
            ].join(' ')}
          >
            <span
              className={[
                'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full',
                isSelected ? 'bg-dc-teal-btn text-white' : 'bg-gray-100 text-gray-500',
              ].join(' ')}
            >
              <Icon className="h-5 w-5" />
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold text-gray-900">{option.title}</span>
              <span className="text-xs text-gray-500">{option.subtitle}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
};

