import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { geometryToFittedPath } from "@worldly/core/geo/silhouette";
import geojson from "../../assets/geo/countries.geojson";
import { Colors } from "../../constants/theme";

const FILL = {
  idle: "#b3d1a1",
  correct: Colors.status.correct,
  wrong: Colors.status.incorrect,
  muted: Colors.text.tertiary,
};

const STROKE = {
  idle: "#478a39",
  correct: "#1D7A58",
  wrong: "#9b2c2c",
  muted: Colors.text.tertiary,
};

let featureById: Map<string, any> | null = null;

function getFeature(countryId?: string | null) {
  if (!countryId) return null;
  if (!featureById) {
    featureById = new Map();
    for (const feature of (geojson as any).features || []) {
      const id =
        feature.properties?.["ISO3166-1-Alpha-3"] ||
        feature.properties?.iso_a3 ||
        feature.properties?.id;
      if (id && id !== "-99") featureById.set(id, feature);
    }
  }
  return featureById.get(countryId) ?? null;
}

type Tone = "idle" | "correct" | "wrong" | "muted";

type Props = {
  countryId?: string | null;
  tone?: Tone;
  height?: number;
  fit?: "square" | "aspect";
};

export function CountrySilhouette({
  countryId,
  tone = "idle",
  height = 140,
  fit = "square",
}: Props) {
  const fitted = useMemo(() => {
    const feature = getFeature(countryId);
    if (!feature?.geometry) return null;
    return geometryToFittedPath(feature.geometry, {
      iso3: countryId ?? undefined,
      fit,
    });
  }, [countryId, fit]);

  if (!fitted) {
    return <View style={[styles.placeholder, { height }]} />;
  }

  const aspect =
    fitted.width > 0 && fitted.height > 0 ? fitted.width / fitted.height : 1;

  const box =
    aspect >= 1
      ? { width: "100%" as const, aspectRatio: aspect, maxHeight: height }
      : { height, aspectRatio: aspect, alignSelf: "center" as const };

  return (
    <View style={[styles.wrap, box]}>
      <Svg
        width="100%"
        height="100%"
        viewBox={fitted.viewBox}
        preserveAspectRatio="xMidYMid meet"
      >
        <Path
          d={fitted.d}
          fill={FILL[tone] ?? FILL.idle}
          fillRule="evenodd"
          stroke={STROKE[tone] ?? STROKE.idle}
          strokeWidth={1.5}
          strokeLinejoin="miter"
          strokeMiterlimit={2.5}
          vectorEffect="nonScalingStroke"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center" },
  placeholder: { width: "100%" },
});
