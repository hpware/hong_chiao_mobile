import { AppleMaps } from 'expo-maps';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BuildingCard } from '@/components/building-card';
import { useCalendarColors } from '@/components/week-grid';
import { openInApp } from '@/lib/browser';
import { BUILDINGS, CAMPUS_ADDRESS, CAMPUS_CENTER, CAMPUS_MAP_PAGE, findRoom, type Building } from '@/lib/campus';

type MapRef = React.ComponentRef<typeof AppleMaps.View>;

const ON_MAP = BUILDINGS.filter((b) => b.center);
const BUILDING_ZOOM = 17;
const CAMPUS_ZOOM = 16;
/** Aim a little south of the target so it sits above the bottom panel, not under it. */
const above = (p: { latitude: number; longitude: number }, zoom: number) => ({
  latitude: p.latitude - 0.0009 * 2 ** (17 - zoom),
  longitude: p.longitude,
});
const ICONS: Record<string, string> = { gate: 'door.left.hand.open', parking: 'parkingsign' };

/**
 * 校園地圖 on iOS: Apple Maps with a pin per building (positions and outlines from
 * OpenStreetMap). Tap a pin, or a building in the panel, to see its floors; `?room=成306`
 * opens straight on that building and floor.
 */
export function NativeCampusMap() {
  const params = useLocalSearchParams<{ room?: string; building?: string }>();
  const c = useCalendarColors();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const room = params.room ? findRoom(params.room) : null;
  const [selected, setSelected] = useState<string | undefined>(room?.building.id ?? params.building);
  const map = useRef<MapRef>(null);

  const building = BUILDINGS.find((b) => b.id === selected);
  const floor = room && room.building.id === selected ? room.floor : undefined;
  const start = useMemo(() => building?.center ?? CAMPUS_CENTER, []); // eslint-disable-line react-hooks/exhaustive-deps

  const select = (b: Building | undefined) => {
    setSelected(b?.id);
    const target = b?.center ?? CAMPUS_CENTER;
    const zoom = b?.center ? BUILDING_ZOOM : CAMPUS_ZOOM;
    void map.current?.setCameraPosition({ coordinates: above(target, zoom), zoom });
  };

  const markers = ON_MAP.map((b) => ({
    id: b.id,
    title: b.name,
    coordinates: b.center,
    systemImage: ICONS[b.kind ?? ''] ?? 'building.2.fill',
    tintColor: b.id === selected ? c.now : c.accent,
  }));
  const polygons = building?.outline
    ? [
        {
          id: building.id,
          coordinates: building.outline.map(([latitude, longitude]) => ({ latitude, longitude })),
          color: `${c.now}44`,
          lineColor: c.now,
          lineWidth: 2,
        },
      ]
    : [];

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      <Stack.Screen options={{ title: room ? room.code : '校園地圖' }} />
      <AppleMaps.View
        ref={map}
        style={StyleSheet.absoluteFill}
        cameraPosition={{ coordinates: above(start, building ? BUILDING_ZOOM : CAMPUS_ZOOM), zoom: building ? BUILDING_ZOOM : CAMPUS_ZOOM }}
        markers={markers}
        polygons={polygons}
        properties={{ pointsOfInterest: { including: [] }, selectionEnabled: false }}
        uiSettings={{ compassEnabled: true, scaleBarEnabled: true, myLocationButtonEnabled: false }}
        onMarkerClick={(m) => select(BUILDINGS.find((b) => b.id === m.id))}
      />

      <View style={[styles.panel, { backgroundColor: c.bg, maxHeight: height * 0.45, paddingBottom: insets.bottom }]}>
        <View style={[styles.grabber, { backgroundColor: c.hairline }]} />
        <ScrollView contentContainerStyle={{ paddingBottom: 12 }}>
          {params.room && !room ? <Text style={[styles.note, { color: c.secondary }]}>找不到「{params.room}」在哪棟大樓。</Text> : null}
          {building ? (
            <>
              <BuildingCard c={c} building={building} floor={floor} room={floor ? room?.code : undefined} flat />
              <Pressable onPress={() => select(undefined)} style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]} accessibilityRole="button">
                <Text style={{ color: c.accent, fontSize: 16 }}>所有大樓</Text>
              </Pressable>
            </>
          ) : (
            <>
              {BUILDINGS.filter((b) => !b.kind).map((b, i) => (
                <Pressable
                  key={b.id}
                  onPress={() => select(b)}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.hairline }, pressed && { opacity: 0.6 }]}>
                  <Text style={{ color: c.label, fontSize: 16, flex: 1 }}>{b.name}</Text>
                  {b.floors ? <Text style={{ color: c.secondary, fontSize: 14 }}>{b.floors.length} 層</Text> : null}
                  {!b.center ? <Text style={{ color: c.tertiary, fontSize: 13 }}>地圖上未標示</Text> : null}
                </Pressable>
              ))}
              <Pressable
                style={({ pressed }) => [styles.row, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.hairline }, pressed && { opacity: 0.6 }]}
                accessibilityRole="link"
                onPress={() => void Linking.openURL(`https://maps.apple.com/?q=${encodeURIComponent(`臺北城市科技大學 ${CAMPUS_ADDRESS}`)}`)}>
                <Text style={{ color: c.accent, fontSize: 16, flex: 1 }}>在「地圖」App 開啟</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.row, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.hairline }, pressed && { opacity: 0.6 }]}
                accessibilityRole="link"
                onPress={() => openInApp(CAMPUS_MAP_PAGE)}>
                <Text style={{ color: c.accent, fontSize: 16 }}>學校網站上的校園平面圖</Text>
              </Pressable>
              <Text style={[styles.note, { color: c.tertiary }]}>大樓位置：© OpenStreetMap 貢獻者。樓層資訊來自學校網站。</Text>
            </>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 8,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -2 },
  },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 14 },
  note: { fontSize: 12, textAlign: 'center', paddingHorizontal: 20, paddingTop: 8 },
});
