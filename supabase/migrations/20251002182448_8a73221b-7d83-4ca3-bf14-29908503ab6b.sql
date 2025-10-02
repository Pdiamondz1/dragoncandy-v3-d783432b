-- Enable sponsorship for published campaigns to create test data
UPDATE campaigns 
SET open_for_sponsorship = true 
WHERE status = 'published';