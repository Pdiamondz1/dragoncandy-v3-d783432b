-- Delete test sponsorship proposals to allow resubmission
DELETE FROM campaign_sponsorships 
WHERE id IN (
  '50109e28-384a-4358-b07c-247e3443f530',
  '441b24e7-737a-4068-952f-753083886219'
);