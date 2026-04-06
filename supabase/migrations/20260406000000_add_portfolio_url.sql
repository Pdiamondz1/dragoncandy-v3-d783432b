-- Add portfolio sample URL to campaign applications
ALTER TABLE campaign_applications
ADD COLUMN portfolio_url text;

COMMENT ON COLUMN campaign_applications.portfolio_url IS 'URL to portfolio sample attached by creator when applying';
