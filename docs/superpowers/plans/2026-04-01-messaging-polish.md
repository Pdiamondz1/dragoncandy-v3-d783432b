# Messaging Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the messaging UI — fix header, add message grouping, slide-in animations, input bar refinements, and background color update — without touching real-time Supabase logic.

**Architecture:** Surgical edits to 6 existing files. No new components. All changes are visual/UX polish. Protected hooks (`useMessageQueries`, `useMessageMutations`, `useConversations`, `useTypingIndicator`) are never modified.

**Tech Stack:** React, TypeScript, Tailwind CSS, tailwindcss-animate, date-fns, lucide-react

**Spec:** `docs/superpowers/specs/2026-04-01-messaging-polish-design.md`

---

### Task 1: Header Polish — DirectConversationPage

**Files:**
- Modify: `src/pages/DirectConversationPage.tsx`

- [ ] **Step 1: Remove phone icon from imports and header**

In `src/pages/DirectConversationPage.tsx`, remove `Phone` from the lucide-react import (line 5), and remove `Users` which is also unused. Then replace the phone icon JSX (lines 96-99) with a "View Profile" link.

Change the import:
```tsx
// Before
import { ArrowLeft, Phone, Users } from 'lucide-react';
// After
import { ArrowLeft } from 'lucide-react';
```

Replace the phone icon block (lines 96-99):
```tsx
// Before
<div className="w-10 h-10 rounded-full bg-pink-100 flex items-center justify-center flex-shrink-0">
  <Phone className="h-5 w-5 text-dc-pink-accent" />
</div>

// After
<div className="flex-shrink-0">
  {otherParticipantId && (
    <button
      onClick={() => navigate(`/profile/${otherParticipantId}`)}
      className="text-xs font-medium text-dc-teal hover:underline"
    >
      View Profile
    </button>
  )}
</div>
```

- [ ] **Step 2: Update background color**

Change `bg-dc-gray` to `bg-teal-50` in two places:

Line 29:
```tsx
// Before
<div className="flex-1 p-6 bg-dc-gray min-h-screen overflow-x-hidden">
// After
<div className="flex-1 p-6 bg-teal-50 min-h-screen overflow-x-hidden">
```

Line 69:
```tsx
// Before
<div className="flex flex-col h-full bg-dc-gray">
// After
<div className="flex flex-col h-full bg-teal-50">
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/pages/DirectConversationPage.tsx
git commit -m "messaging: polish header — remove phone icon, add View Profile link, teal bg"
```

---

### Task 2: Header Polish — DirectMessagesPage

**Files:**
- Modify: `src/pages/DirectMessagesPage.tsx`

- [ ] **Step 1: Update background color**

Line 53 — change `bg-dc-gray` to `bg-teal-50`:
```tsx
// Before
<div className="min-h-screen overflow-x-hidden bg-dc-gray w-full max-w-full md:max-w-4xl md:mx-auto">
// After
<div className="min-h-screen overflow-x-hidden bg-teal-50 w-full max-w-full md:max-w-4xl md:mx-auto">
```

- [ ] **Step 2: Add "View Profile" link to header when conversation is selected**

In the header section (lines 55-73), add a "View Profile" link in the right placeholder div when a conversation is selected. Replace the empty `<div className="w-7" />` at line 72:

```tsx
// Before (line 72)
<div className="w-7" />

// After — but only the closing div at line 72 (the right side).
// We need to distinguish: line 65 is the left placeholder, line 72 is the right placeholder.
// Replace the ENTIRE header block (lines 55-73) for clarity:
<div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center">
  {selectedConversationId ? (
    <button
      onClick={() => setSelectedConversationId(null)}
      className="text-dc-pink-accent text-lg mr-2"
      aria-label="Back to messages"
    >
      <ArrowLeft className="h-5 w-5" />
    </button>
  ) : (
    <div className="w-7" />
  )}
  <div className="flex-1 text-center">
    <h1 className="font-sans text-base font-bold text-gray-900 uppercase tracking-wide">
      {selectedConversationId
        ? (selectedConversation?.other_participant_name || 'Conversation')
        : 'Messages'}
    </h1>
    {selectedConversationId && (
      <p className="text-xs text-gray-500">Recently Active</p>
    )}
  </div>
  {selectedConversationId && recipientId ? (
    <button
      onClick={() => navigate(`/profile/${recipientId}`)}
      className="text-xs font-medium text-dc-teal hover:underline"
    >
      View Profile
    </button>
  ) : (
    <div className="w-7" />
  )}
</div>
```

- [ ] **Step 3: Add empty state for desktop when no conversation selected**

The current code at lines 84-93 shows the `DirectMessagesList` when no conversation is selected. On wider screens, we can add an empty state hint below the list. The else branch currently returns a single `<div>` — wrap it in a React fragment and add the empty state as a sibling:

```tsx
// Before (lines 84-93)
) : (
  /* Scrollable conversation list */
  <div className="pb-24 md:pb-0 px-4 pt-4 overflow-hidden">
    <DirectMessagesList
      onConversationSelect={handleConversationSelect}
      onCampaignNavigate={handleCampaignNavigate}
      activeConversationId={selectedConversationId}
    />
  </div>
)}

// After
) : (
  <>
    {/* Scrollable conversation list */}
    <div className="pb-24 md:pb-0 px-4 pt-4 overflow-hidden">
      <DirectMessagesList
        onConversationSelect={handleConversationSelect}
        onCampaignNavigate={handleCampaignNavigate}
        activeConversationId={selectedConversationId}
      />
    </div>
    {/* Desktop empty state hint */}
    <div className="hidden md:flex items-center justify-center py-16">
      <div className="text-center">
        <MessageCircle className="h-10 w-10 text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-400">
          Select a conversation or start a new one from a creator's profile
        </p>
      </div>
    </div>
  </>
)}
```

Note: `MessageCircle` is already imported (line 4).

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/pages/DirectMessagesPage.tsx
git commit -m "messaging: DirectMessagesPage header polish, teal bg, empty state"
```

---

### Task 3: Background Color — ConversationMessageThread & MessageList

**Files:**
- Modify: `src/components/messages/ConversationMessageThread.tsx`
- Modify: `src/components/messages/MessageList.tsx`

- [ ] **Step 1: Update ConversationMessageThread background**

In `src/components/messages/ConversationMessageThread.tsx`, line 55 — change `bg-dc-gray` to `bg-teal-50`:

```tsx
// Before
<div className="flex-1 min-h-0 bg-dc-gray">
// After
<div className="flex-1 min-h-0 bg-teal-50">
```

- [ ] **Step 2: Update MessageList backgrounds**

In `src/components/messages/MessageList.tsx`, two places:

Line 58 (empty state):
```tsx
// Before
<div className="flex-1 flex items-center justify-center p-8 bg-dc-gray min-h-[200px]">
// After
<div className="flex-1 flex items-center justify-center p-8 bg-teal-50 min-h-[200px]">
```

Line 71 (message scroll area):
```tsx
// Before
<ScrollArea className="flex-1 bg-dc-gray" ref={scrollAreaRef}>
// After
<ScrollArea className="flex-1 bg-teal-50" ref={scrollAreaRef}>
```

Also update the empty state text colors to work on the lighter background (lines 62-64):
```tsx
// Before
<div className="p-4 bg-white/30 rounded-2xl w-fit mx-auto mb-3">
  <MessageSquare className="h-8 w-8 text-white/60" />
</div>
<p className="text-sm font-medium text-white mb-1">No messages yet</p>
<p className="text-xs text-white/70">Start the conversation by sending a message below</p>

// After
<div className="p-4 bg-teal-100 rounded-2xl w-fit mx-auto mb-3">
  <MessageSquare className="h-8 w-8 text-teal-400" />
</div>
<p className="text-sm font-medium text-gray-600 mb-1">No messages yet</p>
<p className="text-xs text-gray-400">Start the conversation by sending a message below</p>
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/components/messages/ConversationMessageThread.tsx src/components/messages/MessageList.tsx
git commit -m "messaging: update background color to bg-teal-50 across chat components"
```

---

### Task 4: Message Grouping

**Files:**
- Modify: `src/components/messages/MessageList.tsx`
- Modify: `src/components/messages/MessageBubbleEnhanced.tsx`

- [ ] **Step 1: Pass showAvatar prop from MessageList**

In `src/components/messages/MessageList.tsx`, update the message mapping (lines 73-81) to compute and pass a `showAvatar` boolean:

```tsx
// Before
{messages.map((message) => (
  <MessageBubbleEnhanced
    key={message.id}
    message={message}
    onReply={onReply}
    onForward={onForward}
    onEdit={onEdit}
  />
))}

// After
{messages.map((message, index) => {
  const prevMessage = index > 0 ? messages[index - 1] : null;
  const showAvatar = !prevMessage || prevMessage.sender_id !== message.sender_id;
  return (
    <MessageBubbleEnhanced
      key={message.id}
      message={message}
      showAvatar={showAvatar}
      onReply={onReply}
      onForward={onForward}
      onEdit={onEdit}
    />
  );
})}
```

- [ ] **Step 2: Accept showAvatar prop in MessageBubbleEnhanced**

In `src/components/messages/MessageBubbleEnhanced.tsx`, update the interface and component:

Add `showAvatar` to the interface (line 17-22):
```tsx
// Before
interface MessageBubbleEnhancedProps {
  message: Message;
  onReply?: (message: Message) => void;
  onForward?: (message: Message) => void;
  onEdit?: (message: Message) => void;
}

// After
interface MessageBubbleEnhancedProps {
  message: Message;
  showAvatar?: boolean;
  onReply?: (message: Message) => void;
  onForward?: (message: Message) => void;
  onEdit?: (message: Message) => void;
}
```

Destructure the prop (line 24-28):
```tsx
// Before
const MessageBubbleEnhanced: React.FC<MessageBubbleEnhancedProps> = ({
  message,
  onReply,
  onForward,
  onEdit
}) => {

// After
const MessageBubbleEnhanced: React.FC<MessageBubbleEnhancedProps> = ({
  message,
  showAvatar = true,
  onReply,
  onForward,
  onEdit
}) => {
```

- [ ] **Step 3: Conditionally render avatar and sender name**

Replace the avatar block (lines 82-89):
```tsx
// Before
{!isOwnMessage && (
  <Avatar className="h-8 w-8 flex-shrink-0 mt-1 ring-2 ring-teal-400">
    <AvatarImage src={senderAvatar || logo} alt={senderName} />
    <AvatarFallback className="bg-dc-pink text-white text-xs font-semibold">
      {senderName.charAt(0).toUpperCase()}
    </AvatarFallback>
  </Avatar>
)}

// After
{!isOwnMessage && (
  showAvatar ? (
    <Avatar className="h-8 w-8 flex-shrink-0 mt-1 ring-2 ring-teal-400">
      <AvatarImage src={senderAvatar || logo} alt={senderName} />
      <AvatarFallback className="bg-dc-pink text-white text-xs font-semibold">
        {senderName.charAt(0).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  ) : (
    <div className="w-8 flex-shrink-0" />
  )
)}
```

Conditionally render sender name (lines 94-98):
```tsx
// Before
{!isOwnMessage && (
  <div className="flex items-center gap-2 mb-0.5 px-1">
    <span className="text-xs font-medium text-foreground">{senderName}</span>
    {getCategoryBadge()}
  </div>
)}

// After
{!isOwnMessage && showAvatar && (
  <div className="flex items-center gap-2 mb-0.5 px-1">
    <span className="text-xs font-medium text-foreground">{senderName}</span>
    {getCategoryBadge()}
  </div>
)}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/components/messages/MessageList.tsx src/components/messages/MessageBubbleEnhanced.tsx
git commit -m "messaging: group consecutive messages from same sender"
```

---

### Task 5: Slide-in Animations

**Files:**
- Modify: `src/components/messages/MessageBubbleEnhanced.tsx`

- [ ] **Step 1: Add slide-in animation to the message container**

The project has `tailwindcss-animate` installed. Add a CSS animation using inline style for the slide-in effect, since tailwindcss-animate doesn't ship with directional slide variants by default.

In `src/components/messages/MessageBubbleEnhanced.tsx`, update the outermost div (line 80):

```tsx
// Before
<div className={`group flex gap-2.5 px-4 py-1.5 ${isOwnMessage ? 'flex-row-reverse' : ''}`}>

// After
<div
  className={`group flex gap-2.5 px-4 py-1.5 ${isOwnMessage ? 'flex-row-reverse' : ''}`}
  style={{
    animation: `${isOwnMessage ? 'slideInRight' : 'slideInLeft'} 0.2s ease-out`,
  }}
>
```

- [ ] **Step 2: Add keyframes to index.css**

In `src/index.css`, add the keyframe definitions at the end of the file:

```css
@keyframes slideInLeft {
  from {
    opacity: 0;
    transform: translateX(-12px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes slideInRight {
  from {
    opacity: 0;
    transform: translateX(12px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/components/messages/MessageBubbleEnhanced.tsx src/index.css
git commit -m "messaging: add slide-in animations for chat bubbles"
```

---

### Task 6: Input Bar Polish

**Files:**
- Modify: `src/components/messages/MessageInputEnhanced.tsx`
- Modify: `src/components/messages/ConversationMessageThread.tsx`

- [ ] **Step 1: Update placeholder in ConversationMessageThread**

In `src/components/messages/ConversationMessageThread.tsx`, line 70:

```tsx
// Before
placeholder="Type your message..."
// After
placeholder="Type a message..."
```

- [ ] **Step 2: Update default placeholder in MessageInputEnhanced**

In `src/components/messages/MessageInputEnhanced.tsx`, line 34:

```tsx
// Before
placeholder = "Type your message...",
// After
placeholder = "Type a message...",
```

- [ ] **Step 3: Update send button styling**

In `src/components/messages/MessageInputEnhanced.tsx`, replace the send button (lines 246-253):

```tsx
// Before
<button
  type="submit"
  disabled={(!message.trim() && !file) || disabled || uploading}
  className="text-gray-900 text-xl flex-shrink-0 disabled:opacity-40 hover:text-dc-teal transition-colors p-1"
  aria-label="Send message"
>
  <Send className="h-6 w-6" />
</button>

// After
<button
  type="submit"
  disabled={(!message.trim() && !file) || disabled || uploading}
  className="w-10 h-10 rounded-full bg-dc-teal text-white flex items-center justify-center flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-dc-teal/90 transition-colors"
  aria-label="Send message"
>
  <Send className="h-5 w-5" />
</button>
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/components/messages/MessageInputEnhanced.tsx src/components/messages/ConversationMessageThread.tsx
git commit -m "messaging: polish input bar — teal send button, updated placeholder"
```

---

### Task 7: Final Verification

- [ ] **Step 1: Full build check**

Run: `npm run build`
Expected: Clean build, no errors or warnings related to changed files

- [ ] **Step 2: Visual checklist**

Run `npm run dev` and verify:
- Direct conversation page: teal-50 background, no phone icon, "View Profile" link visible, "Recently Active" text
- Message bubbles: consecutive same-sender messages grouped (no repeated avatar), slide-in animation on load
- Input bar: "Type a message..." placeholder, teal send button, send button disabled when empty
- Empty state: shows on desktop when no conversation selected
- Existing features still work: sending messages, receiving messages, typing indicators, file attachments, reactions

- [ ] **Step 3: Final commit (if any adjustments needed)**

```bash
git add -A
git commit -m "messaging: final polish adjustments"
```
