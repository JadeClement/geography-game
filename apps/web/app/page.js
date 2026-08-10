import { Suspense } from "react";
import GeographyGame from "@/components/GeographyGame";

export default function Home() {
  return (
    <Suspense fallback={null}>
      <GeographyGame />
    </Suspense>
  );
}
