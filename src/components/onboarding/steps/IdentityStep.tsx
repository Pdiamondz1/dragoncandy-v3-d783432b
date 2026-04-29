import { motion } from '@/lib/motion';
import { Input } from '@/components/ui/input';
import { Camera } from 'lucide-react';

interface IdentityStepProps {
  name: string;
  onNameChange: (name: string) => void;
  avatarPreview: string | null;
  onAvatarChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  role: 'business_client' | 'content_creator' | 'brand';
}

const roleConfig = {
  business_client: {
    placeholder: "e.g. Taco Bell, The Grill House",
    photoLabel: "Add your logo",
    photoShape: "rounded-2xl" as const,
  },
  content_creator: {
    placeholder: "e.g. FoodieJess, Alex Chen",
    photoLabel: "Add a photo",
    photoShape: "rounded-full" as const,
  },
  brand: {
    placeholder: "e.g. Nike, Coca-Cola, Local Brew Co",
    photoLabel: "Add your logo",
    photoShape: "rounded-2xl" as const,
  },
};

export function IdentityStep({ name, onNameChange, avatarPreview, onAvatarChange, role }: IdentityStepProps) {
  const config = roleConfig[role];
  const accentColor = role === 'content_creator' ? 'teal' : 'pink';
  const borderClass = accentColor === 'teal' ? 'border-dc-teal' : 'border-dc-pink';
  const textClass = accentColor === 'teal' ? 'text-dc-teal' : 'text-dc-pink-accent';
  const ringClass = accentColor === 'teal' ? 'ring-dc-teal' : 'ring-dc-pink';

  return (
    <div className="flex flex-col items-center">
      <motion.label
        className="cursor-pointer mb-6 group"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onAvatarChange}
        />
        {avatarPreview ? (
          <motion.img
            src={avatarPreview}
            alt="Preview"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={`w-24 h-24 object-cover ring-2 ${ringClass} ${config.photoShape}`}
            loading="lazy"
          />
        ) : (
          <div
            className={`w-24 h-24 border-[3px] border-dashed ${borderClass} ${config.photoShape} flex flex-col items-center justify-center gap-1 transition-colors group-hover:bg-gray-50`}
          >
            <Camera className={`w-6 h-6 ${textClass}`} />
            <span className={`text-[10px] font-medium ${textClass}`}>{config.photoLabel}</span>
          </div>
        )}
      </motion.label>

      <motion.div
        className="w-full"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <Input
          value={name}
          onChange={e => onNameChange(e.target.value)}
          placeholder={config.placeholder}
          className="text-center text-lg font-medium h-14 rounded-2xl border-2 border-gray-200 focus:border-dc-teal placeholder:text-gray-300"
          autoFocus
        />
      </motion.div>
    </div>
  );
}
