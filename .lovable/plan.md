

# Add "Back to Browse Creators" Button on Direct Conversation Page

## Problem

When a restaurant or brand user clicks **Contact** on a creator card in the **Browse Creators** page, they're taken to the direct conversation page. Currently, the only back button goes to "Messages", but users want to return to **Browse Creators** to continue browsing.

## Solution

Add a secondary navigation option on the Direct Conversation page that lets users go back to Browse Creators when they came from that page. We'll use URL state to track where the user came from.

---

## Implementation Plan

### 1. Pass "from" state when navigating from CreatorCard

**File:** `src/components/creator-browse/CreatorCard.tsx`

Update the `navigate` calls in `handleContact` to include state indicating the user came from the creators browse page:

```tsx
// Navigate based on user role - include state about origin
if (profile?.role === 'business_client') {
  navigate(`/dashboard/business/messages/direct/${conversationId}`, { 
    state: { from: 'browse-creators', backPath: '/dashboard/business/creators' } 
  });
} else if (profile?.role === 'brand') {
  navigate(`/dashboard/brand/messages/direct/${conversationId}`, { 
    state: { from: 'browse-creators', backPath: '/dashboard/brand/creators' } 
  });
}
```

### 2. Update DirectConversationPage to handle "from" state

**File:** `src/pages/DirectConversationPage.tsx`

Add logic to detect when the user came from Browse Creators and show the appropriate back button:

1. Import `useLocation` from react-router-dom
2. Extract the `state` from location
3. Conditionally render a "Back to Browse Creators" button when `state?.from === 'browse-creators'`

```tsx
const location = useLocation();
const navigationState = location.state as { from?: string; backPath?: string } | null;

// In the header section:
{navigationState?.from === 'browse-creators' && navigationState?.backPath && (
  <Button
    variant="outline"
    size="sm"
    onClick={() => navigate(navigationState.backPath!)}
    className="flex items-center gap-2"
  >
    <ArrowLeft className="h-4 w-4" />
    Back to Browse Creators
  </Button>
)}
```

### 3. Keep existing "Back to Messages" button

The existing button will remain available so users always have a path to their messages.

---

## UI Layout After Change

```
Header area:
┌─────────────────────────────────────────────────────────┐
│ [← Back to Browse Creators]  [← Back to Messages]       │
│                                                         │
│ 💬 Direct Conversation                                  │
│    Direct message conversation                          │
└─────────────────────────────────────────────────────────┘
```

When user came from Browse Creators, both buttons show. Otherwise, only "Back to Messages" shows.

---

## Files to Modify

| File | Change |
|------|--------|
| `src/components/creator-browse/CreatorCard.tsx` | Pass navigation state with origin info |
| `src/pages/DirectConversationPage.tsx` | Read state and conditionally show "Back to Browse Creators" button |

---

## User Flow After Implementation

1. User is on Browse Creators page
2. Clicks "Contact" on a creator card
3. Taken to Direct Conversation page
4. Sees **two** back buttons:
   - "Back to Browse Creators" (returns to browsing)
   - "Back to Messages" (goes to messages list)
5. Can continue browsing creators or go to messages

