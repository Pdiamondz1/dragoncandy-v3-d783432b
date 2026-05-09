-- Dashboard summary RPC: replaces 8 sequential queries with 1 call
-- Uses SECURITY DEFINER to bypass RLS for cross-table aggregation,
-- but guards with auth.uid() check to prevent unauthorized access.

CREATE OR REPLACE FUNCTION get_dashboard_summary(p_user_id UUID)
RETURNS JSON AS $$
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN (
    SELECT json_build_object(
      'campaign_count', (
        SELECT count(*) FROM campaigns WHERE user_id = p_user_id
      ),
      'active_campaigns', (
        SELECT count(*) FROM campaigns
        WHERE user_id = p_user_id AND status IN ('active', 'published')
      ),
      'active_collaborations', (
        SELECT count(*) FROM campaign_collaborations cc
        JOIN campaigns c ON cc.campaign_id = c.id
        WHERE c.user_id = p_user_id AND cc.status = 'active'
      ),
      'completed_collaborations', (
        SELECT count(*) FROM campaign_collaborations cc
        JOIN campaigns c ON cc.campaign_id = c.id
        WHERE c.user_id = p_user_id AND cc.status = 'completed'
      ),
      'pending_applications', (
        SELECT count(*) FROM campaign_applications ca
        JOIN campaigns c ON ca.campaign_id = c.id
        WHERE c.user_id = p_user_id AND ca.status = 'pending'
      ),
      'total_applications', (
        SELECT count(*) FROM campaign_applications ca
        JOIN campaigns c ON ca.campaign_id = c.id
        WHERE c.user_id = p_user_id
      ),
      'avg_review_score', (
        SELECT coalesce(avg(rating), 0) FROM project_reviews
        WHERE reviewee_id = p_user_id
      ),
      'total_spent', (
        SELECT coalesce(sum(coalesce(c.fixed_price, c.budget_min, 0)), 0)
        FROM campaigns c
        WHERE c.user_id = p_user_id AND c.status IN ('completed', 'published')
      ),
      'monthly_data', (
        SELECT coalesce(json_agg(month_row ORDER BY month_row.month), '[]'::json)
        FROM (
          SELECT
            date_trunc('month', cc.created_at) AS month,
            count(*) AS collaborations
          FROM campaign_collaborations cc
          JOIN campaigns c ON cc.campaign_id = c.id
          WHERE c.user_id = p_user_id
            AND cc.created_at > now() - interval '6 months'
          GROUP BY 1
        ) month_row
      )
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = 'public';
