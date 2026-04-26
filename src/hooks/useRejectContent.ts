import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useRejectContent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ collaborationId, reason }: { collaborationId: string; reason: string }) => {
      const response = await supabase.functions.invoke("reject-content", {
        body: { collaborationId, reason },
      });
      if (response.error) throw new Error(response.error.message);
      return response.data;
    },
    onSuccess: () => {
      toast.success("Content rejected. A dispute has been opened.");
      queryClient.invalidateQueries({ queryKey: ["collaboration"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to reject content");
    },
  });
}
