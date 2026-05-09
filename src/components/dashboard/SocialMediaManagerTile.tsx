import { Share2 } from 'lucide-react';
import { Link } from 'react-router-dom';

interface Props {
  href: string;
}

export function SocialMediaManagerTile({ href }: Props) {
  return (
    <Link to={href} className="block rounded-2xl border border-teal-200 bg-teal-50/50 p-4 hover:bg-teal-50 transition-colors">
      <div className="flex items-center gap-2 mb-1">
        <Share2 className="h-4 w-4 text-teal-500" />
        <span className="text-xs font-medium text-teal-700">Social Media Manager</span>
      </div>
      <p className="text-sm text-muted-foreground">Compose, schedule, and engage across social platforms</p>
    </Link>
  );
}
