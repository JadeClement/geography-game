import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import geojson from "../../assets/geo/countries.geojson";
import { Colors } from "../../constants/theme";

function project(lon: number, lat: number, w: number, h: number) {
  return [((lon + 180) / 360) * w, ((90 - lat) / 180) * h];
}

function ringToPath(ring: number[][], w: number, h: number) {
  return (
    ring
      .map((coord, i) => {
        const [x, y] = project(coord[0], coord[1], w, h);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ") + " Z"
  );
}

function featureToPath(feature: any, w: number, h: number) {
  const g = feature.geometry;
  if (!g) return "";
  const polys =
    g.type === "Polygon"
      ? [g.coordinates]
      : g.type === "MultiPolygon"
        ? g.coordinates
        : [];
  return polys
    .map((poly: number[][][]) =>
      poly.map((ring) => ringToPath(ring, w, h)).join(" ")
    )
    .join(" ");
}

type Props = {
  region?: string;
  highlightId?: string | null;
  wrongId?: string | null;
  onSelect: (countryId: string) => void;
};

export function SessionMap({ region, highlightId, wrongId, onSelect }: Props) {
  const width = 360;
  const height = 200;

  const features = useMemo(() => {
    const all = (geojson as any).features || [];
    // Equirectangular world map; region filtering is soft (full world for reliability)
    return all;
  }, [region]);

  return (
    <View style={styles.wrap} renderToHardwareTextureAndroid shouldRasterizeIOS>
      <Svg width="100%" height={220} viewBox={`0 0 ${width} ${height}`}>
        {features.map((f: any, i: number) => {
          const id =
            f.properties?.["ISO3166-1-Alpha-3"] ||
            f.properties?.iso_a3 ||
            f.properties?.id;
          if (!id || id === "-99") return null;
          const d = featureToPath(f, width, height);
          if (!d) return null;
          let fill = "#1a2a3a";
          if (id === highlightId) fill = Colors.status.correct;
          if (id === wrongId) fill = Colors.status.incorrect;
          return (
            <Path
              key={`${id}-${i}`}
              d={d}
              fill={fill}
              stroke={Colors.border.subtle}
              strokeWidth={0.4}
              onPress={() => onSelect(id)}
            />
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { minHeight: 220 },
});
