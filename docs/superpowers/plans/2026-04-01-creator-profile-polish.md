# Creator Profile Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the public creator profile into a professional portfolio with real data, an About section, content type badges, conditional reviews, and dual CTAs.

**Architecture:** Single-file refactor of `PublicCreatorProfile.tsx`. Add one Supabase count query for completed projects. All other data already available from existing `creator_profiles` fetch and `PublicProfileReviews` component.

**Tech Stack:** React, TypeScript, Tailwind CSS, Supabase JS client v2

**Spec:** `docs/superpowers/specs/2026-04-01-creator-profile-polish-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/pages/PublicCreatorProfile.tsx` | Modify | All profile sections — hero, card, stats, about, portfolio, reviews, CTAs |

No new files needed. No changes to shared components.

---

### Task 1: Fix Rating to Use Real Data

**Files:**
- Modify: `src/pages/PublicCreatorProfile.tsx`

- [ ] **Step 1: Add `average_rating` and `total_reviews` to the CreatorProfile interface**

The interface already has most fields but is missing these two. Add them:

```typescript
// Add to CreatorProfile interface
average_rating?: number;
total_reviews?: number;
```

- [ ] **Step 2: Replace hardcoded "4.5 RATING" with real data**

Find the rating display (around line 193-195):
```tsx
<div className="flex items-center gap-1 text-sm text-dc-pink-accent">
  <Star className="h-3.5 w-3.5 fill-dc-pink-accent" />
  <span className="font-medium">4.5 RATING</span>
</div>
```

Replace with:
```tsx
<div className="flex items-center gap-1 text-sm text-dc-pink-accent">
  <Star className="h-3.5 w-3.5 fill-dc-pink-accent" />
  <span className="font-medium">
    {profile.average_rating
      ? `${profile.average_rating.toFixed(1)} · ${profile.total_reviews ?? 0} reviews`
      : 'New'}
  </span>
</div>
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds with no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/PublicCreatorProfile.tsx
git commit -m "profile: use real rating from database"
```

---

### Task 2: Fix Stats Row with Real Data + New Creator Badge

**Files:**
- Modify: `src/pages/PublicCreatorProfile.tsx`

- [ ] **Step 1: Add state for projects count and fetch completed collaborations**

Add state variable and a new `useEffect` to query `campaign_collaborations`:

```typescript
const [projectsCount, setProjectsCount] = useState<number>(0);
```

Add after the existing profile load effect:

```typescript
useEffect(() => {
  const fetchProjectsCount = async () => {
    if (!profile?.user_id) return;
    const { count, error } = await supabase
      .from('campaign_collaborations')
      .select('id', { count: 'exact', head: true })
      .eq('creator_id', profile.user_id)
      .eq('status', 'completed');
    if (error) {
      console.error('Error fetching projects count:', error);
      return;
    }
    setProjectsCount(count ?? 0);
  };
  fetchProjectsCount();
}, [profile?.user_id]);
```

- [ ] **Step 2: Replace stats row with real data and New Creator fallback**

Replace the entire stats row section (lines ~207-228) with:

```tsx
{/* Stats Row */}
{projectsCount === 0 && portfolioUrls.length === 0 && (profile.total_reviews ?? 0) === 0 ? (
  <div className="flex justify-center py-4 px-4 mt-2">
    <span className="bg-gradient-to-r from-dc-teal to-emerald-400 text-white px-6 py-2 rounded-full font-bold text-sm">
      🌟 New Creator
    </span>
  </div>
) : (
  <div className="flex justify-around py-4 px-4 mt-2">
    <div className="flex-1 text-center">
      <p className="text-3xl font-extrabold text-gray-900">{projectsCount}</p>
      <p className="text-xs text-gray-500">Projects</p>
    </div>
    <div className="w-px bg-dc-pink self-stretch mx-1" />
    <div className="flex-1 text-center">
      <p className="text-3xl font-extrabold text-gray-900">{portfolioUrls.length}</p>
      <p className="text-xs text-gray-500">Portfolio</p>
    </div>
    <div className="w-px bg-dc-pink self-stretch mx-1" />
    <div className="flex-1 text-center">
      <p className="text-3xl font-extrabold text-gray-900">{profile.total_reviews ?? 0}</p>
      <p className="text-xs text-gray-500">Reviews</p>
    </div>
  </div>
)}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/pages/PublicCreatorProfile.tsx
git commit -m "profile: real stats from collaborations, portfolio, reviews"
```

---

### Task 3: Add Availability Badge to Profile Card

**Files:**
- Modify: `src/pages/PublicCreatorProfile.tsx`

- [ ] **Step 1: Update profile card to include availability badge**

The current card structure is a flex row with avatar and info. Add the badge as a third element.

Replace the profile card div (lines ~182-204) with:

```tsx
{/* White Profile Card — overlaps hero */}
<div className="bg-white rounded-3xl -mt-6 relative z-10 mx-4 px-4 py-3 flex items-center gap-3 shadow-md">
  <Avatar className="w-16 h-16 ring-2 ring-dc-teal flex-shrink-0">
    <AvatarImage src={profile.avatar_url} />
    <AvatarFallback className="bg-dc-teal/20">
      <User className="h-8 w-8 text-dc-teal" />
    </AvatarFallback>
  </Avatar>
  <div className="min-w-0 flex-1">
    <h1 className="text-lg font-bold text-gray-900 truncate">
      {profile.creator_name}
    </h1>
    <div className="flex items-center gap-1 text-sm text-dc-pink-accent">
      <Star className="h-3.5 w-3.5 fill-dc-pink-accent" />
      <span className="font-medium">
        {profile.average_rating
          ? `${profile.average_rating.toFixed(1)} · ${profile.total_reviews ?? 0} reviews`
          : 'New'}
      </span>
    </div>
    {profile.location && (
      <p className="text-xs text-gray-500 uppercase tracking-wide flex items-center gap-1">
        <MapPin className="h-3 w-3" />
        {profile.location}
      </p>
    )}
  </div>
  {profile.availability && (
    <span className={`text-xs px-3 py-1 rounded-full font-semibold flex-shrink-0 ${
      profile.availability === 'available'
        ? 'bg-green-500 text-white'
        : 'bg-gray-300 text-gray-600'
    }`}>
      {profile.availability === 'available' ? 'Available' : 'Busy'}
    </span>
  )}
</div>
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/pages/PublicCreatorProfile.tsx
git commit -m "profile: availability badge on profile card"
```

---

### Task 4: Add About Card (Bio, Skills, Rate)

**Files:**
- Modify: `src/pages/PublicCreatorProfile.tsx`

- [ ] **Step 1: Create a skill label formatter**

Add a helper function above the component (or inside it) to convert enum values to display labels:

```typescript
const formatSkillLabel = (skill: string): string => {
  return skill
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};
```

- [ ] **Step 2: Add About card between stats row and portfolio grid**

Insert after the stats row closing tag and before the portfolio grid:

```tsx
{/* About Card */}
{(profile.bio || (profile.skills && profile.skills.length > 0) || profile.base_rate_per_hour) && (
  <div className="mx-4 mb-3 bg-white rounded-2xl p-4 shadow-sm">
    <h2 className="text-sm font-bold text-gray-900 mb-2">About</h2>
    {profile.bio && (
      <p className="text-sm text-gray-600 leading-relaxed mb-3">{profile.bio}</p>
    )}
    {profile.skills && profile.skills.length > 0 && (
      <div className="flex flex-wrap gap-2 mb-3">
        {profile.skills.map((skill) => (
          <span
            key={skill}
            className="bg-dc-teal text-white rounded-full px-3 py-1 text-xs font-semibold"
          >
            {formatSkillLabel(skill)}
          </span>
        ))}
      </div>
    )}
    {profile.base_rate_per_hour && (
      <p className="text-sm text-gray-500">
        💰 ${profile.base_rate_per_hour} / hr
      </p>
    )}
  </div>
)}
```

- [ ] **Step 3: Remove the old standalone bio section**

Delete the old bio block (around lines 231-235):
```tsx
{/* Bio */}
{profile.bio && (
  <div className="px-4 pb-2">
    <p className="text-sm text-gray-600 leading-relaxed">{profile.bio}</p>
  </div>
)}
```

This content is now inside the About card.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/pages/PublicCreatorProfile.tsx
git commit -m "profile: about card with bio, skills tags, rate"
```

---

### Task 5: Improve Portfolio Grid (Type Badges, Play Overlay, Empty State)

**Files:**
- Modify: `src/pages/PublicCreatorProfile.tsx`

- [ ] **Step 1: Add a helper to detect content type from URL**

Add above the component:

```typescript
const getContentType = (url: string): 'Photo' | 'Reel' | null => {
  const ext = url.split('.').pop()?.toLowerCase().split('?')[0];
  if (!ext) return null;
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'Photo';
  if (['mp4', 'mov', 'webm'].includes(ext)) return 'Reel';
  return null;
};
```

- [ ] **Step 2: Replace the portfolio grid section**

Replace the current portfolio grid (lines ~238-256) with:

```tsx
{/* Portfolio Grid */}
<div className="px-4 pb-4">
  <h2 className="text-sm font-bold text-gray-900 mb-2">Portfolio</h2>
  {portfolioUrls.length > 0 ? (
    <div className="grid grid-cols-3 gap-2">
      {portfolioUrls.map((url, index) => {
        const contentType = getContentType(url);
        const isVideo = contentType === 'Reel';
        return (
          <div key={index} className="aspect-square rounded-xl overflow-hidden relative">
            {isVideo ? (
              <video
                src={url}
                className="w-full h-full object-cover"
                muted
                playsInline
                preload="metadata"
              />
            ) : (
              <img
                src={url}
                alt={`Portfolio item ${index + 1}`}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
                loading="lazy"
              />
            )}
            {contentType && (
              <span className="absolute top-1.5 left-1.5 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded font-semibold">
                {contentType}
              </span>
            )}
            {isVideo && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-8 h-8 rounded-full bg-white/80 flex items-center justify-center">
                  <div className="w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-l-[10px] border-l-gray-800 ml-0.5" />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  ) : (
    <p className="text-sm text-gray-400 text-center py-6">
      This creator hasn't uploaded portfolio pieces yet
    </p>
  )}
</div>
```

Note: This shows ALL portfolio items (no longer skipping index 0 with `.slice(1)`).

- [ ] **Step 3: Update hero image to not depend on portfolio grid skipping**

The current hero uses `portfolioUrls[0]`. Keep this logic — it still works since we no longer skip index 0 in the grid. Both hero and grid can show the same first image.

No code change needed for this step — just verify the hero image line is:
```tsx
const heroImage = portfolioUrls[0] || profile.avatar_url;
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/pages/PublicCreatorProfile.tsx
git commit -m "profile: portfolio grid with type badges and empty state"
```

---

### Task 6: Conditional Reviews Section

**Files:**
- Modify: `src/pages/PublicCreatorProfile.tsx`

- [ ] **Step 1: Wrap reviews section in conditional render**

Replace the reviews section (lines ~258-265) with:

```tsx
{/* Reviews Section — only shown when reviews exist */}
{(profile.total_reviews ?? 0) > 0 && (
  <div className="mx-4 mb-4 bg-white rounded-2xl p-4 shadow-sm">
    <h2 className="text-sm font-bold text-gray-900 mb-3">Reviews</h2>
    <PublicProfileReviews
      profileId={profile.user_id}
      profileType="creator"
    />
  </div>
)}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/pages/PublicCreatorProfile.tsx
git commit -m "profile: hide reviews section when no reviews exist"
```

---

### Task 7: Dual CTA Buttons

**Files:**
- Modify: `src/pages/PublicCreatorProfile.tsx`

- [ ] **Step 1: Replace single CTA with dual buttons**

Replace the CTA section (lines ~267-284) with:

```tsx
{/* CTA Buttons */}
<div className="px-4 pb-8 space-y-3">
  <ContactCreatorModal
    creator={{
      id: profile.id,
      user_id: profile.user_id,
      creator_name: profile.creator_name,
      avatar_url: profile.avatar_url,
      bio: profile.bio,
      response_time: profile.response_time
    }}
    trigger={
      <Button className="w-full bg-dc-teal text-white rounded-full h-14 font-bold uppercase tracking-wide text-base hover:bg-dc-teal/90">
        Hire This Creator
      </Button>
    }
  />
  <ContactCreatorModal
    creator={{
      id: profile.id,
      user_id: profile.user_id,
      creator_name: profile.creator_name,
      avatar_url: profile.avatar_url,
      bio: profile.bio,
      response_time: profile.response_time
    }}
    trigger={
      <Button
        variant="outline"
        className="w-full bg-white text-dc-pink-accent rounded-full h-14 font-bold border-2 border-gray-200 text-base hover:bg-gray-50"
      >
        Message
      </Button>
    }
  />
</div>
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/pages/PublicCreatorProfile.tsx
git commit -m "profile: dual CTA buttons — hire and message"
```

---

### Task 8: Upgrade Hero Gradient

**Files:**
- Modify: `src/pages/PublicCreatorProfile.tsx`

- [ ] **Step 1: Replace flat overlay with bottom gradient**

Find the hero overlay (around line 172):
```tsx
{/* Dark overlay for readability */}
<div className="absolute inset-0 bg-black/10" />
```

Replace with:
```tsx
{/* Gradient overlay for readability */}
<div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/40 to-transparent" />
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/pages/PublicCreatorProfile.tsx
git commit -m "profile: hero gradient overlay for text readability"
```

---

### Task 9: Final Verification

- [ ] **Step 1: Full build check**

Run: `npm run build`
Expected: Build succeeds with zero errors.

- [ ] **Step 2: Visual review on mobile**

Run: `npm run dev`
Navigate to a creator profile page (e.g., `/creator/<slug>`).
Check at 375px and 430px widths in browser dev tools:
- Hero with gradient overlay
- Profile card with real rating and availability badge
- Stats row with real data (or New Creator badge)
- About card with bio, skills, rate
- Portfolio grid with type badges
- Reviews section (hidden if no reviews)
- Dual CTA buttons

- [ ] **Step 3: Final commit**

```bash
git add src/pages/PublicCreatorProfile.tsx
git commit -m "profile: professional creator portfolio with real data"
```
