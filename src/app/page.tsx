import { Suspense } from "react";
import Board from "@/components/star/Board";
import { PageSkeleton } from "@/components/ui";

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton kind="cards" />}>
      <Board />
    </Suspense>
  );
}
