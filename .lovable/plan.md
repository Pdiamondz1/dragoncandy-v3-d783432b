

# Content Creator Campaign Improvements

## Overview

This plan addresses three feature requests for content creators:

1. **Apply Button on Campaign Details Page** - Allow creators to apply directly from the campaign details page
2. **Withdraw Application** - Enable creators to withdraw pending applications before acceptance
3. **Project Status Button** - Add navigation to Projects page for accepted applications

---

## Feature 1: Apply Button on Campaign Details Page

### Current State
When a creator views campaign details at `/dashboard/creator/campaigns/:id`, they can only see the overview. There's no way to apply directly from this page - they must go back to the marketplace.

### Solution
Add an "Apply" button in the campaign details header when viewing as a creator, and handle the application modal flow similar to the marketplace page.

### Files to Modify

**`src/pages/CampaignDetailsPage.tsx`**
- Import the `ApplicationForm` component and `Dialog` components
- Add state for managing application dialog visibility
- Add a check for whether the creator has already applied (query the database)
- Add an "Apply to Campaign" button in the header section when:
  - User is viewing as creator (`isCreatorView === true`)
  - User hasn't already applied to this campaign
  - Campaign is published
- Render the ApplicationForm in a Dialog

**`src/hooks/useCreatorApplicationStatus.ts`** (new file)
- Create a hook to check if the current creator has applied to a specific campaign
- Returns: `{ hasApplied, applicationStatus, isLoading }`

---

## Feature 2: Withdraw Application (Pending Only)

### Current State
Creators can view their applications on the My Applications page but cannot withdraw/cancel pending applications.

### Solution
Add a "Withdraw Application" button on the `DetailedApplicationCard` component, only visible for pending applications. This will delete the application from the database.

### Files to Modify

**`src/hooks/useWithdrawApplication.ts`** (new file)
- Create a mutation hook to delete a pending application
- Only allows deletion if status is 'pending'
- Invalidates relevant query caches

**`src/components/applications/DetailedApplicationCard.tsx`**
- Import the new `useWithdrawApplication` hook
- Add an AlertDialog for confirmation before withdrawing
- Add a "Withdraw" button in the card footer for pending applications
- Button should be styled as destructive/outline variant

---

## Feature 3: Project Status Button for Accepted Applications

### Current State
Accepted applications show a "Message Restaurant" button, but there's no way to navigate to the Projects page to see the active project.

### Solution
Add a "View Project" button for accepted applications that navigates to `/dashboard/creator/projects`.

### Files to Modify

**`src/components/applications/DetailedApplicationCard.tsx`**
- Import `useNavigate` from react-router-dom
- Add a "View Project" button for accepted applications
- This button navigates to `/dashboard/creator/projects`
- Style it as the primary action (above or alongside the Message button)

---

## Implementation Details

### New Hook: useCreatorApplicationStatus

```text
Location: src/hooks/useCreatorApplicationStatus.ts

Purpose: Check if current user has applied to a campaign

Query:
- Table: campaign_applications
- Filter: campaign_id = provided ID AND creator_id = current user
- Returns: application record or null
```

### New Hook: useWithdrawApplication

```text
Location: src/hooks/useWithdrawApplication.ts

Purpose: Allow creators to withdraw pending applications

Mutation:
- Table: campaign_applications
- Action: DELETE
- Condition: id = applicationId AND status = 'pending'
- Validation: Ensures only pending applications can be withdrawn
- Cache invalidation: creator-applications, campaign-applications
```

### UI Flow: Campaign Details Apply Button

```text
Campaign Details Page (Creator View)
+--------------------------------------------------+
| [Back to Campaigns]    Campaign Title            |
|                        Campaign Details          |
|                                    [Apply Now]   |  <-- New button
+--------------------------------------------------+
|    [Overview]                                    |
+--------------------------------------------------+

Button States:
- "Apply Now" - Default, opens application dialog
- "Applied (Pending)" - Disabled, already applied
- "Accepted" - Hidden (show Project Status instead)
- "Rejected" - "Apply Again" option
```

### UI Flow: Withdraw Application

```text
Application Card (Pending Status)
+------------------------------------------+
| Campaign Title              [Pending]    |
| Restaurant Name                          |
| Applied on 2/3/2026                      |
|                                          |
| Your Message: ...                        |
| Timeline: 2weeks  |  Rate: $1,400        |
|                                          |
| [Withdraw Application]                   |  <-- New button
+------------------------------------------+

Confirmation Dialog:
- Title: "Withdraw Application?"
- Message: "Are you sure you want to withdraw your application for [Campaign Title]? This action cannot be undone."
- Actions: [Cancel] [Withdraw]
```

### UI Flow: Project Status Button

```text
Application Card (Accepted Status)
+------------------------------------------+
| Campaign Title              [Accepted]   |
| Restaurant Name                          |
| Applied on 2/3/2026                      |
|                                          |
| Your Message: ...                        |
|                                          |
| [View Project] [Message Restaurant]      |  <-- New button added
+------------------------------------------+
```

---

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `src/hooks/useCreatorApplicationStatus.ts` | Create | Check if creator applied to campaign |
| `src/hooks/useWithdrawApplication.ts` | Create | Delete pending applications |
| `src/pages/CampaignDetailsPage.tsx` | Modify | Add Apply button and dialog for creators |
| `src/components/applications/DetailedApplicationCard.tsx` | Modify | Add Withdraw and Project Status buttons |

---

## Technical Notes

1. **RLS Policies**: The existing RLS policies on `campaign_applications` already allow creators to delete their own applications, so no database changes are needed.

2. **Cache Invalidation**: After withdrawing an application, invalidate:
   - `creator-applications` - Refresh My Applications page
   - `campaign-applications` - Refresh business view
   - `public-campaigns` - Update application counts in marketplace

3. **Email Notifications**: Optionally, we could send a notification to the business when an application is withdrawn. This is out of scope for the MVP but can be added later.

