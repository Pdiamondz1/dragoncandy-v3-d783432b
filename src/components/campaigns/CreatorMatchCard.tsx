
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useResolvedAvatarUrl } from '@/hooks/useSignedUrl';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  UserPlus,
  ChevronDown,
  ChevronUp,
  MapPin,
  DollarSign,
  Palette,
  Monitor,
  Clock,
  Sparkles,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { CreatorMatch, ScoreBreakdown } from '@/hooks/useCampaignMatches';
import { WhyExpander } from '@/components/guidance/WhyExpander';
import { formatSkillLabel } from '@/lib/skillUtils';

interface CreatorMatchCardProps {
  match: CreatorMatch;
  isInvited?: boolean;
  onInvite?: (creatorId: string) => void;
}

const SCORE_LABELS: Record<keyof ScoreBreakdown, { label: string; icon: React.ElementType }> = {
  platform_overlap: { label: 'Platform Fit', icon: Monitor },
  budget_fit: { label: 'Budget Fit', icon: DollarSign },
  skills_match: { label: 'Skills Match', icon: Palette },
  geographic: { label: 'Location', icon: MapPin },
  availability: { label: 'Availability', icon: Clock },
  ai_quality: { label: 'Content Quality', icon: Sparkles },
};

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-green-600 dark:text-green-400';
  if (score >= 60) return 'text-teal-600 dark:text-teal-400';
  if (score >= 40) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-500 dark:text-red-400';
}

function getScoreBg(score: number): string {
  if (score >= 80) return 'bg-green-500';
  if (score >= 60) return 'bg-teal-500';
  if (score >= 40) return 'bg-yellow-500';
  return 'bg-red-400';
}

function getScoreBadgeVariant(score: number): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (score >= 75) return 'default';
  if (score >= 50) return 'secondary';
  return 'outline';
}

function getScoreLabel(score: number): string {
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Great';
  if (score >= 55) return 'Good';
  if (score >= 40) return 'Fair';
  return 'Low';
}

const ScoreBar: React.FC<{ label: string; score: number; icon: React.ElementType }> = ({
  label,
  score,
  icon: Icon,
}) => (
  <div className="flex items-center gap-2">
    <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${getScoreColor(score)}`} />
    <span className="text-xs text-muted-foreground w-24 flex-shrink-0">{label}</span>
    <div className="flex-1 h-2 bg-dc-teal/10 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${getScoreBg(score)}`}
        style={{ width: `${score}%` }}
      />
    </div>
    <span className={`text-xs font-medium w-8 text-right ${getScoreColor(score)}`}>
      {score}
    </span>
  </div>
);

export const CreatorMatchCard: React.FC<CreatorMatchCardProps> = ({ match, isInvited, onInvite }) => {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const resolvedAvatarUrl = useResolvedAvatarUrl(match.creator_profile.avatar_url);

  const breakdown = match.match_reasons.score_breakdown;
  const hasBreakdown = breakdown && Object.keys(breakdown).length > 0;

  const creatorPlatforms = [
    match.creator_profile.instagram_url ? 'Instagram' : null,
    match.creator_profile.tiktok_url ? 'TikTok' : null,
    match.creator_profile.youtube_url ? 'YouTube' : null,
  ].filter(Boolean);

  return (
    <Card className="h-full border dark:border-border hover:border-teal-300 dark:hover:border-teal-600 transition-colors">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar className="h-12 w-12 ring-2 ring-teal-400 flex-shrink-0">
              <AvatarImage src={resolvedAvatarUrl} alt={match.creator_profile.creator_name} />
              <AvatarFallback className="bg-teal-100 text-teal-700 font-semibold">
                {match.creator_profile.creator_name.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <CardTitle className="text-base truncate">{match.creator_profile.creator_name}</CardTitle>
              <div className="flex items-center gap-2 mt-0.5">
                {match.creator_profile.location && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {match.creator_profile.location}
                    {typeof match.match_reasons.distance_miles === 'number' && (
                      <span className="text-teal-600 dark:text-teal-400">
                        {' · '}
                        {match.match_reasons.distance_miles < 1
                          ? 'nearby'
                          : `${match.match_reasons.distance_miles} mi away`}
                      </span>
                    )}
                  </span>
                )}
                {match.creator_profile.base_rate_per_hour && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <DollarSign className="h-3 w-3" />
                    ${match.creator_profile.base_rate_per_hour}/hr
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Overall score badge */}
          <div className="flex flex-col items-center gap-1 flex-shrink-0">
            <div className="flex items-center">
              <div className={`text-2xl font-bold ${getScoreColor(match.match_score)}`}>
                {match.match_score}
              </div>
              <WhyExpander expanderKey="match_score" title="What is match score?" body="Donny scores creators 0–100 based on content fit, audience overlap, and past performance." />
            </div>
            <Badge variant={getScoreBadgeVariant(match.match_score)} className="text-[10px] px-1.5">
              {getScoreLabel(match.match_score)}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pt-0">
        {/* Bio */}
        {match.creator_profile.bio && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {match.creator_profile.bio}
          </p>
        )}

        {/* Skills + Platforms */}
        <div className="flex flex-wrap gap-1.5">
          {match.creator_profile.skills.slice(0, 4).map((skill, index) => (
            <Badge key={index} variant="secondary" className="text-xs">
              {formatSkillLabel(skill)}
            </Badge>
          ))}
          {match.creator_profile.skills.length > 4 && (
            <Badge variant="outline" className="text-xs">
              +{match.creator_profile.skills.length - 4}
            </Badge>
          )}
          {creatorPlatforms.map((platform) => (
            <Badge key={platform} variant="outline" className="text-xs border-teal-300 text-teal-700 dark:text-teal-400 dark:border-teal-700">
              {platform}
            </Badge>
          ))}
        </div>

        {/* Match reasons */}
        {match.match_reasons.reasons.length > 0 && (
          <div className="space-y-1">
            {match.match_reasons.reasons.slice(0, 2).map((reason, i) => (
              <div key={i} className="flex items-start gap-1.5 text-xs text-green-700 dark:text-green-400">
                <CheckCircle2 className="h-3 w-3 mt-0.5 flex-shrink-0" />
                <span>{reason}</span>
              </div>
            ))}
            {match.match_reasons.concerns.length > 0 && match.match_reasons.concerns.slice(0, 1).map((concern, i) => (
              <div key={i} className="flex items-start gap-1.5 text-xs text-yellow-700 dark:text-yellow-400">
                <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                <span>{concern}</span>
              </div>
            ))}
          </div>
        )}

        {/* Score breakdown toggle */}
        {hasBreakdown && (
          <div>
            <button
              onClick={() => setShowBreakdown(!showBreakdown)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {showBreakdown ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
              {showBreakdown ? 'Hide' : 'Show'} score breakdown
            </button>

            {showBreakdown && breakdown && (
              <div className="mt-2 p-3 rounded-lg bg-dc-teal/[0.04] space-y-2">
                {(Object.entries(SCORE_LABELS) as [keyof ScoreBreakdown, { label: string; icon: React.ElementType }][]).map(
                  ([key, config]) => (
                    <ScoreBar
                      key={key}
                      label={config.label}
                      score={breakdown[key] ?? 0}
                      icon={config.icon}
                    />
                  )
                )}
              </div>
            )}
          </div>
        )}

        {/* Action button (business invites the matched creator) */}
        <div className="flex pt-2 border-t dark:border-border">
          {isInvited ? (
            <Button size="sm" variant="outline" className="flex-1 min-w-0" disabled>
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
              Invited
            </Button>
          ) : (
            onInvite && (
              <Button
                onClick={() => onInvite(match.creator_id)}
                size="sm"
                className="flex-1 min-w-0 bg-teal-600 hover:bg-teal-700 text-white"
              >
                <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                Invite
              </Button>
            )
          )}
        </div>
      </CardContent>
    </Card>
  );
};

