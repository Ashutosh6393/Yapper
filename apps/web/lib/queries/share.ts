import { useMutation } from "@tanstack/react-query";
import { joinResponseSchema } from "@yapper/schemas";
import { apiFetch } from "../http";

/**
 * Join a note via its capability link (`POST /api/share/:token/join`). The `/share/:token` page
 * fires this once on load (after auth) and redirects to the returned note. 404 → invalid/private.
 */
export function useJoinNote() {
  return useMutation({
    mutationFn: async (token: string) =>
      joinResponseSchema.parse(await apiFetch(`/api/share/${token}/join`, { method: "POST" })),
  });
}
