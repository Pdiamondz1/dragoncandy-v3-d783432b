import { Share2 } from 'lucide-react';
import { Link } from 'react-router-dom';

interface Props {
  href: string;
}

export function SocialMediaManagerTile({ href }: Props) {
  return (
    <Link to={href} className="block rounded-2xl border border-dc-teal/20 bg-dc-teal/5 p-4 hover:bg-dc-teal/10 transition-colors">
      <div className="flex items-center gap-2 mb-1">
        <Share2 className="h-4 w-4 text-dc-teal" />
        <span className="text-xs font-medium text-dc-teal">Social Media Manager</span>
      </div>
      <p className="text-sm text-muted-foreground">Compose, schedule, and engage across social platforms</p>
    </Link>
  );
}
