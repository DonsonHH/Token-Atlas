import { Suspense } from "react";
import {
  UsageWorkspace,
  WorkspaceSkeleton,
} from "@/components/workspace/usage-workspace";

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="p-8">
          <WorkspaceSkeleton />
        </div>
      }
    >
      <UsageWorkspace />
    </Suspense>
  );
}
