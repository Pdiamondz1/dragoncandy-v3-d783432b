-- Add new structured location fields to creator_profiles
ALTER TABLE creator_profiles
  ADD COLUMN city TEXT,
  ADD COLUMN country TEXT,
  ADD COLUMN postal_code TEXT;

-- Add index for common location searches
CREATE INDEX idx_creator_profiles_city ON creator_profiles(city);
CREATE INDEX idx_creator_profiles_country ON creator_profiles(country);
CREATE INDEX idx_creator_profiles_postal_code ON creator_profiles(postal_code);

-- Add comment explaining backward compatibility
COMMENT ON COLUMN creator_profiles.location IS 'Legacy unstructured location field. Kept for backward compatibility with existing profiles. New profiles should use city, country, postal_code.';