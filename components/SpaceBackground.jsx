"use client";

import { SPACE_STAR_LAYERS } from "@/lib/spaceStars";

export default function SpaceBackground() {
  return (
    <div className="space-bg" aria-hidden="true">
      <div className="space-bg__nebula" />
      {SPACE_STAR_LAYERS.map((layer) => (
        <div key={layer.id} className={`space-bg__field space-bg__field--${layer.id}`}>
          <span
            className="space-bg__stars"
            style={{
              boxShadow: layer.shadow,
              animationDuration: `${layer.duration}s`,
            }}
          />
          <span
            className="space-bg__stars"
            style={{
              boxShadow: layer.shadow,
              animationDuration: `${layer.duration}s`,
            }}
          />
        </div>
      ))}
    </div>
  );
}
