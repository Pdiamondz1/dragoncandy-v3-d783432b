import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFirstRunMissions } from '@/hooks/useFirstRunMissions';
import { BRAND_CONTENT_STYLES } from '@/types/firstRun';

export default function BrandStylePicker() {
  const [selected, setSelected] = useState<string[]>([]);
  const { completeMission } = useFirstRunMissions();
  const navigate = useNavigate();

  const toggle = (style: string) => {
    setSelected((prev) =>
      prev.includes(style) ? prev.filter((s) => s !== style) : [...prev, style]
    );
  };

  const handleContinue = () => {
    completeMission('select_style');
    navigate('/dashboard/brand/creators');
  };

  return (
    <div className="min-h-screen bg-white p-4">
      <div className="mb-6 text-center">
        <div className="text-3xl mb-2">🎨</div>
        <h1 className="text-xl font-bold text-dc-teal-btn">Pick your vibe</h1>
        <p className="text-sm text-dc-text-muted mt-1">What content style fits your brand?</p>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6">
        {BRAND_CONTENT_STYLES.map((style) => (
          <button
            key={style}
            onClick={() => toggle(style)}
            className={`p-4 rounded-2xl text-sm font-semibold transition-all ${
              selected.includes(style)
                ? 'bg-pink-100 border-2 border-pink-400 text-pink-700'
                : 'bg-white border-2 border-transparent text-gray-700'
            }`}
          >
            {style}
          </button>
        ))}
      </div>

      <button
        onClick={handleContinue}
        disabled={selected.length === 0}
        className="w-full bg-pink-500 text-white font-bold py-3 rounded-full disabled:opacity-50"
      >
        Continue →
      </button>
    </div>
  );
}
