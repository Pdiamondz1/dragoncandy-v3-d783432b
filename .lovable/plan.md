
# Add "Project Status" Button to Campaign Cards

## Overview

Add a "Project Status" button to campaign cards when a creator has been assigned (i.e., when there's at least one accepted application). Clicking this button redirects to the Business Projects page.

---

## How We Know a Creator is Assigned

The `useCampaignApplicationsCount` hook already returns an `accepted` count for each campaign. When `accepted > 0`, it means at least one creator has been assigned to the campaign.

---

## File to Modify

**`src/components/campaigns/CampaignCard.tsx`**

---

## Changes

### 1. Add Import

Add `FolderOpen` icon from lucide-react for the button:

```tsx
import { ..., FolderOpen } from 'lucide-react';
```

Add `useNavigate` from react-router-dom:

```tsx
import { useNavigate } from 'react-router-dom';
```

### 2. Add Navigation Hook

Inside the component, add:

```tsx
const navigate = useNavigate();
```

### 3. Add "Project Status" Button in CardFooter

Update the CardFooter section (lines 360-390) to include the new button when `applicationCounts?.accepted > 0`:

```tsx
<CardFooter className="flex flex-col sm:flex-row gap-2 pt-4 border-t border-border">
  {/* Existing View Details button */}
  <Button variant="outline" size="sm" ... />
  
  {/* NEW: Project Status button - shown when creator is assigned */}
  {applicationCounts && applicationCounts.accepted > 0 && (
    <Button 
      variant="secondary" 
      size="sm" 
      className="flex-1 text-xs w-full sm:w-auto"
      onClick={() => navigate('/dashboard/business/projects')}
    >
      <FolderOpen className="h-3 w-3 mr-1" />
      Project Status
    </Button>
  )}
  
  {/* Existing Edit button */}
  {onEdit && <Button variant="default" size="sm" ... />}
</CardFooter>
```

---

## Visual Result

### Before (No accepted applications)
```
[ View Details ]  [ Edit ]
```

### After (When creator is assigned)
```
[ View Details ]  [ Project Status ]  [ Edit ]
```

---

## Button Design

| Property | Value |
|----------|-------|
| Variant | `secondary` (subtle, not primary focus) |
| Icon | `FolderOpen` (represents project folder) |
| Text | "Project Status" |
| Redirect | `/dashboard/business/projects` |

---

## Technical Summary

| Change | Description |
|--------|-------------|
| Import | Add `FolderOpen` icon and `useNavigate` |
| Logic | Check `applicationCounts.accepted > 0` |
| Button | New secondary button redirecting to projects page |
| Placement | Between "View Details" and "Edit" buttons |

---

## No Breaking Changes

- Existing button behavior remains unchanged
- Only adds a new button when the condition is met
- Simple redirect, no additional API calls needed
