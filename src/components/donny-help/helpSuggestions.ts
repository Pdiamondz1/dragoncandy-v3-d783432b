interface HelpSuggestion {
  label: string;
  question: string;
}

const PAGE_SUGGESTIONS: Record<string, HelpSuggestion[]> = {
  "/dashboard/creator/campaigns": [
    { label: "How do I apply?", question: "How do I apply to a campaign?" },
    { label: "What is DragonDash?", question: "What is DragonDash?" },
    { label: "What does match score mean?", question: "What does match score mean?" },
  ],
  "/dashboard/creator/applications": [
    { label: "Why was I rejected?", question: "Why might my application have been rejected?" },
    { label: "Can I re-apply?", question: "Can I re-apply to a campaign?" },
    { label: "What happens next?", question: "What happens after I'm accepted?" },
  ],
  "/dashboard/creator": [
    { label: "How do I get paid?", question: "How do I get paid for completed work?" },
    { label: "Where are my projects?", question: "Where can I see my active projects?" },
    { label: "How do I boost earnings?", question: "How can I increase my earnings?" },
  ],
  "/dashboard/business": [
    { label: "How do I post a campaign?", question: "How do I create and post a campaign?" },
    { label: "How do I find creators?", question: "How can I find creators that match my needs?" },
    { label: "What are quick actions?", question: "What can I do from the quick actions?" },
  ],
  "/dashboard/brand": [
    { label: "How do I shortlist?", question: "How do I shortlist creators?" },
    { label: "What is a boost?", question: "What is a boost and how does it work?" },
    { label: "How do campaigns work?", question: "How do brand campaigns work?" },
  ],
  "/dashboard/brand/creators": [
    { label: "How do filters work?", question: "How do the creator filters work?" },
    { label: "What is match score?", question: "What does the match score mean?" },
    { label: "How to invite?", question: "How do I invite a creator to my campaign?" },
  ],
  "/dashboard/brand/sponsorships": [
    { label: "How do boosts work?", question: "How do boosts work?" },
    { label: "What's a good amount?", question: "What's a good boost amount?" },
    { label: "Who gets the money?", question: "Who gets the money from a boost?" },
  ],
  "/dragonshare": [
    { label: "How do boosts work?", question: "How do boosts work in DragonShare?" },
    { label: "What's a good amount?", question: "What's a good boost amount?" },
    { label: "Who gets the money?", question: "Who gets the money from a boost?" },
  ],
  "/settings": [
    { label: "How do I add a teammate?", question: "How do I add a teammate?" },
    { label: "What's a seat?", question: "What's a seat in my plan?" },
    { label: "How do I delete?", question: "How do I delete my account?" },
  ],
  "/messages": [
    { label: "Who can I message?", question: "Who can I send messages to?" },
    { label: "Are messages private?", question: "Are my messages private?" },
    { label: "How to share files?", question: "How do I share files in a conversation?" },
  ],
};

export function getSuggestionsForPage(pathname: string): HelpSuggestion[] {
  const exact = PAGE_SUGGESTIONS[pathname];
  if (exact) return exact;

  const match = Object.entries(PAGE_SUGGESTIONS).find(([path]) =>
    pathname.startsWith(path)
  );
  return match?.[1] ?? [
    { label: "What can I do here?", question: "What can I do on this page?" },
    { label: "How does this work?", question: "How does this feature work?" },
    { label: "Need help", question: "I need help understanding this page." },
  ];
}
