import { motion } from '@/lib/motion';

export interface TapGridItem {
  value: string;
  label: string;
  icon: string;
}

interface TapGridProps {
  items: TapGridItem[];
  selected: string[];
  onToggle: (value: string) => void;
  mode: 'single' | 'multi';
  accentColor: 'teal' | 'pink';
  columns?: 3 | 4;
}

export function TapGrid({ items, selected, onToggle, mode: _mode, accentColor, columns = 3 }: TapGridProps) {
  const gridClass = columns === 4 ? 'grid-cols-4' : 'grid-cols-3';

  const activeClasses = accentColor === 'teal'
    ? 'bg-dc-teal/15 border-dc-teal ring-1 ring-dc-teal/30 shadow-glow-teal'
    : 'bg-dc-pink/15 border-dc-pink ring-1 ring-dc-pink/30 shadow-glow-pink';

  const inactiveClasses = 'bg-white border-gray-200 hover:border-gray-300';

  return (
    <div className={`grid ${gridClass} gap-2.5`}>
      {items.map((item, index) => {
        const isSelected = selected.includes(item.value);

        return (
          <motion.button
            key={item.value}
            type="button"
            onClick={() => onToggle(item.value)}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.04, duration: 0.25, ease: 'easeOut' }}
            whileTap={{ scale: 0.92 }}
            className={`relative flex flex-col items-center justify-center gap-1 p-3 rounded-2xl border-2 transition-all duration-200 cursor-pointer min-h-[72px] ${
              isSelected ? activeClasses : inactiveClasses
            }`}
          >
            <span className="text-xl leading-none">{item.icon}</span>
            <span className={`text-xs font-medium leading-tight text-center ${
              isSelected
                ? accentColor === 'teal' ? 'text-teal-700' : 'text-pink-700'
                : 'text-gray-600'
            }`}>
              {item.label}
            </span>

            {isSelected && (
              <motion.div
                layoutId={`check-${item.value}`}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className={`absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] ${
                  accentColor === 'teal' ? 'bg-dc-teal' : 'bg-dc-pink'
                }`}
              >
                ✓
              </motion.div>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
