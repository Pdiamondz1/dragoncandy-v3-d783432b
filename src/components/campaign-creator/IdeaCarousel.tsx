import type { CampaignIdea } from '@/types/campaignCreator';
import { IdeaCard } from './IdeaCard';
import { useIsMobile } from '@/hooks/use-mobile';

interface IdeaCarouselProps {
  ideas: CampaignIdea[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function IdeaCarousel({ ideas, selectedId, onSelect }: IdeaCarouselProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div className="flex overflow-x-auto snap-x snap-mandatory gap-4 pb-4 -mx-4 px-4">
        {ideas.map((idea) => (
          <div key={idea.id} className="snap-center flex-shrink-0 w-[85vw]">
            <IdeaCard idea={idea} isSelected={selectedId === idea.id} onSelect={onSelect} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {ideas.map((idea) => (
        <IdeaCard key={idea.id} idea={idea} isSelected={selectedId === idea.id} onSelect={onSelect} />
      ))}
    </div>
  );
}
