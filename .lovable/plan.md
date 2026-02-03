
# Fix Campaign Location Filters

## Problem Analysis

The location filters (Postal/Zip Code, City, Country) on the Creator Browse Campaigns page are not working because:

1. **Data Gap**: Many business profiles have the structured location fields (`postal_code`, `city`, `country`) empty or NULL
2. **Legacy Data**: Older businesses only have the `legacy_location` field populated (e.g., "Hoboken, NJ" or "ontario,canada")

**Database Evidence:**

| Business | postal_code | city | country | legacy_location |
|----------|-------------|------|---------|-----------------|
| Harbormill Automation | 07030 | Hoboken | United States | Hoboken, New Jersey |
| Antique Bar & Bakery | NULL | NULL | NULL | Hoboken, NJ |
| Dragon LLCQ! | "" | "" | "" | ontario,canada |

The filtering code only checks `postal_code`, `city`, and `country` - it doesn't fall back to the `legacy_location` field.

---

## Solution

Enhance the filtering logic in two places:

1. **Data Layer** (`usePublicCampaigns.ts`): Include `legacy_location` in the business profile data passed to the frontend
2. **Filter Logic** (`useCampaignMarketplaceFilters.ts`): Add fallback logic to check `legacy_location` when structured fields are empty

---

## Implementation Details

### File 1: `src/hooks/usePublicCampaigns.ts`

**Change**: Add `location` (legacy field) to the business profile query and response.

```text
Current query (line 98):
.select('user_id, business_name, logo_url, postal_code, city, country')

Updated query:
.select('user_id, business_name, logo_url, postal_code, city, country, location')

Update interface to include:
business_profile?: {
  business_name: string;
  logo_url?: string;
  postal_code?: string;
  city?: string;
  country?: string;
  location?: string;  // <-- Add legacy field
};
```

### File 2: `src/hooks/useCampaignMarketplaceFilters.ts`

**Change**: Add fallback logic to check `legacy_location` when filtering.

The enhanced filter logic will:

1. First check the structured field (`postal_code`, `city`, or `country`)
2. If empty/null, fall back to checking if the filter value exists in `legacy_location`

```text
Example for city filter:

Current:
campaign.business_profile?.city?.toLowerCase().includes(cityLower)

Enhanced:
const cityField = campaign.business_profile?.city?.toLowerCase();
const legacyField = campaign.business_profile?.location?.toLowerCase();

// Match if structured field contains the search term
// OR if structured field is empty and legacy field contains the search term
return (cityField && cityField.includes(cityLower)) ||
       (!cityField && legacyField && legacyField.includes(cityLower));
```

---

## Files to Modify

| File | Change |
|------|--------|
| `src/hooks/usePublicCampaigns.ts` | Add `location` field to business profile query and response |
| `src/hooks/useCampaignMarketplaceFilters.ts` | Add legacy location fallback in filter logic |

---

## Expected Result

After this fix:
- Entering "Hoboken" in the City filter will show both:
  - Campaigns from "Harbormill Automation" (has `city: "Hoboken"`)
  - Campaigns from "Antique Bar & Bakery" (has `legacy_location: "Hoboken, NJ"`)
- The same fallback applies to postal code and country filters
