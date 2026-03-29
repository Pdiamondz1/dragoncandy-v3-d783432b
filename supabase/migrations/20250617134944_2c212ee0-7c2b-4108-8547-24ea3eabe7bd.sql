
-- Create analytics_events table for tracking user behavior and performance metrics
CREATE TABLE public.analytics_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL,
  event_data JSONB DEFAULT '{}',
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id TEXT,
  page_url TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add Row Level Security
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- Create policy for users to view their own analytics data (for dashboard)
CREATE POLICY "Users can view their own analytics data" 
  ON public.analytics_events 
  FOR SELECT 
  USING (auth.uid() = user_id OR user_id IS NULL);

-- Create policy for inserting analytics events (allow all authenticated users)
CREATE POLICY "Authenticated users can insert analytics events" 
  ON public.analytics_events 
  FOR INSERT 
  TO authenticated
  WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX idx_analytics_events_user_id ON public.analytics_events(user_id);
CREATE INDEX idx_analytics_events_event_type ON public.analytics_events(event_type);
CREATE INDEX idx_analytics_events_created_at ON public.analytics_events(created_at);
CREATE INDEX idx_analytics_events_page_url ON public.analytics_events(page_url);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION public.handle_analytics_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_analytics_updated_at
  BEFORE UPDATE ON public.analytics_events
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_analytics_updated_at();
