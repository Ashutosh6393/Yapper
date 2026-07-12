"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * The note editor lives in a modal on the dashboard, not on its own page. Any direct or bookmarked
 * note URL (and the share-link join) redirects to `/dashboard?note=:id`, where the dashboard opens the
 * note in the dialog. Keeping the route as a thin redirect means old links still resolve.
 */
export default function NotePage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  useEffect(() => {
    router.replace(`/dashboard?note=${id}`);
  }, [router, id]);

  return null;
}
