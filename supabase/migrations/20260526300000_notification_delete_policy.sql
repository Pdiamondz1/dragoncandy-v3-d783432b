-- Allow users to delete their own notifications (hard delete)
CREATE POLICY "Users can delete their own notifications"
  ON public.push_notifications FOR DELETE
  USING (user_id = auth.uid());
