import { Input } from '@/components/ui/input';

interface TimelinePickerProps {
  deadline: string;
  onChange: (deadline: string) => void;
}

export function TimelinePicker({ deadline, onChange }: TimelinePickerProps) {
  const today = new Date().toISOString().split('T')[0];

  return (
    <div>
      <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Deadline</label>
      <Input type="date" value={deadline} min={today} onChange={(e) => onChange(e.target.value)} className="mt-2 text-sm w-48" />
    </div>
  );
}
