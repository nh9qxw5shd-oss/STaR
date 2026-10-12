import { Suspense } from "react";
import History from "@/components/star/History";
import { PageSkeleton } from "@/components/ui";

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton kind="table" />}>
      <History />
    </Suspense>
  );
}
