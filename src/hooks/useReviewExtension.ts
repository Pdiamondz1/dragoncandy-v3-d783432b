import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useReviewExtension() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ collaborationId }: { collaborationId: string }) => {
      const response = await supabase.functions.invoke("extend-review", {
        body: { collaborationId },
      });
      if (response.error) throw new Error(response.error.message);
      return response.data;
    },
    onSuccess: () => {
      toast.success("Review time extended");
      queryClient.invalidateQueries({ queryKey: ["collaboration"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to extend review time");
    },
  });
}
