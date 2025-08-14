-- Add sample review data for testing (if tables are empty)
INSERT INTO project_reviews (
  collaboration_id,
  reviewer_id,
  reviewee_id,
  rating,
  review_text,
  review_type,
  communication_rating,
  quality_rating,
  timeliness_rating,
  professionalism_rating,
  is_public
)
SELECT 
  gen_random_uuid(), -- collaboration_id (dummy for now)
  profiles1.id,      -- reviewer_id
  profiles2.id,      -- reviewee_id
  4,                 -- rating
  'Great collaboration! Professional and delivered high-quality work on time.',
  'business_to_creator',
  5,                 -- communication_rating
  4,                 -- quality_rating
  4,                 -- timeliness_rating
  5,                 -- professionalism_rating
  true               -- is_public
FROM profiles profiles1
CROSS JOIN profiles profiles2
WHERE profiles1.role = 'business_client' 
  AND profiles2.role = 'content_creator'
  AND profiles1.id != profiles2.id
  AND NOT EXISTS (SELECT 1 FROM project_reviews WHERE reviewer_id = profiles1.id)
LIMIT 3;

-- Add a few creator-to-business reviews as well
INSERT INTO project_reviews (
  collaboration_id,
  reviewer_id,
  reviewee_id,
  rating,
  review_text,
  review_type,
  communication_rating,
  quality_rating,
  timeliness_rating,
  professionalism_rating,
  is_public
)
SELECT 
  gen_random_uuid(), -- collaboration_id (dummy for now)
  profiles1.id,      -- reviewer_id (creator)
  profiles2.id,      -- reviewee_id (business)
  5,                 -- rating
  'Fantastic client to work with! Clear communication and fair payment.',
  'creator_to_business',
  5,                 -- communication_rating
  5,                 -- quality_rating
  5,                 -- timeliness_rating
  5,                 -- professionalism_rating
  true               -- is_public
FROM profiles profiles1
CROSS JOIN profiles profiles2
WHERE profiles1.role = 'content_creator' 
  AND profiles2.role = 'business_client'
  AND profiles1.id != profiles2.id
  AND NOT EXISTS (SELECT 1 FROM project_reviews WHERE reviewer_id = profiles1.id)
LIMIT 2;