

# UI Update: Restaurant Dashboard DragonDash Card

## Summary
Update the "Create Your First Campaign" card on the Restaurant Dashboard to promote DragonDash as the main call-to-action.

---

## Current State
- Title: "Create Your First Campaign"
- Description: "Use our AI-powered campaign wizard to define your goals and find the perfect creators"
- Button: "Start Campaign Wizard"

## New State
- Title: "Create Your First Campaign" (unchanged)
- Description Line 1: "Use our AI-powered campaign wizard to define your goals and find the perfect creators" (unchanged)
- Description Line 2 (NEW): "Get content delivered to you fast for your campaign with DragonDash."
- Button: "DragonDash" (changed from "Start Campaign Wizard")

---

## File to Modify

**`src/pages/BusinessDashboard.tsx`** - Lines 121-136

### Changes

1. **Add new description line** after the existing AI-powered text (line 127):
   ```tsx
   <p className="text-gray-600">
     Use our AI-powered campaign wizard to define your goals and find the perfect creators
   </p>
   <p className="text-gray-600 mt-2">
     Get content delivered to you fast for your campaign with DragonDash.
   </p>
   ```

2. **Update button text** (line 135):
   ```tsx
   // Before:
   Start Campaign Wizard
   
   // After:
   DragonDash
   ```

---

## Visual Result

The card will display:

```
        [+]
        
Create Your First Campaign

Use our AI-powered campaign wizard to define 
your goals and find the perfect creators

Get content delivered to you fast for your 
campaign with DragonDash.

    [ ⚡ DragonDash ]
```

---

## Technical Notes

- No new dependencies required
- Button functionality remains the same (navigates to `/dashboard/business/campaigns/create`)
- Styling remains consistent with existing design
- The Zap icon on the button stays the same (fits the "fast delivery" DragonDash theme)

