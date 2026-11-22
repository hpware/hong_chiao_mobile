import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, type ScrollViewInstance, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { BuildingCard } from '@/components/building-card';
import { NativeCampusMap } from '@/components/native-campus-map';
import { useCalendarColors, type Colors } from '@/components/week-grid';
import { openInApp } from '@/lib/browser';
import { BUILDINGS, CAMPUS_ADDRESS, CAMPUS_MAP_IMAGE, CAMPUS_MAP_PAGE, CAMPUS_MAP_RATIO, findRoom, type Building } from '@/lib/campus';

/**
 * 校園地圖: the school's own campus plan (pinch to zoom on iOS) with a pin per building, each
 * building's floor directory, and room lookup (`?room=成306…` highlights 大成館 3F).
 */
export default function CampusMapScreen() {
  // iOS: a native Apple Maps view (Google Maps on Android needs an API key the app doesn't have).
  return Platform.OS === 'ios' ? <NativeCampusMap /> : <ImageCampusMap />;
}

function ImageCampusMap() {
  const params = useLocalSearchParams<{ room?: string; building?: string }>();
  const c = useCalendarColors();
  const { width } = useWindowDimensions();
  const room = params.room ? findRoom(params.room) : null;
  const [selected, setSelected] = useState<string | undefined>(room?.building.id ?? params.building);
  const [failed, setFailed] = useState(false);
  const scroll = useRef<ScrollViewInstance>(null);

  const mapW = width - 32;
  const mapH = mapW / CAMPUS_MAP_RATIO;
  const building = BUILDINGS.find((b) => b.id === selected);
  const floor = room && room.building.id === selected ? room.floor : undefined;

  const select = (b: Building) => {
    setSelected(b.id === selected ? undefined : b.id);
    scroll.current?.scrollTo({ y: 0, animated: true });
  };

  return (
    <ScrollView ref={scroll} contentInsetAdjustmentBehavior="automatic" style={{ flex: 1, backgroundColor: c.surface }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 48 }}>
      <Stack.Screen options={{ title: room ? room.code : '校園地圖' }} />

      {params.room && !room ? <Text style={[styles.lead, { color: c.secondary }]}>找不到「{params.room}」在哪棟大樓。</Text> : null}

      <View style={[styles.card, { backgroundColor: c.bg, height: mapH }]}>
        {failed ? (
          <View style={styles.center}>
            <Text style={{ color: c.secondary, textAlign: 'center' }}>無法載入學校網站上的平面圖。</Text>
          </View>
        ) : (
          <ScrollView
            maximumZoomScale={4}
            minimumZoomScale={1}
            bouncesZoom
            centerContent
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            style={{ borderRadius: 16 }}>
            <View style={{ width: mapW, height: mapH }}>
              <Image
                source={{ uri: CAMPUS_MAP_IMAGE }}
                cachePolicy="disk"
                contentFit="cover"
                transition={150}
                style={StyleSheet.absoluteFill}
                accessibilityLabel="臺北城市科技大學校園平面圖"
                onError={() => setFailed(true)}
              />
              {BUILDINGS.filter((b) => !b.kind).map((b) => (
                <Pin key={b.id} c={c} building={b} active={b.id === selected} left={b.x * mapW} top={b.y * mapH} onPress={() => select(b)} />
              ))}
            </View>
          </ScrollView>
        )}
      </View>
      {Platform.OS === 'ios' && !failed ? <Text style={[styles.hint, { color: c.tertiary }]}>雙指縮放地圖，點圓點查看大樓。</Text> : null}

      {building ? <BuildingCard c={c} building={building} floor={floor} room={floor ? room?.code : undefined} /> : null}

      <View style={[styles.card, { backgroundColor: c.bg }]}>
        {BUILDINGS.filter((b) => b.id !== selected).map((b, i) => (
          <Pressable
            key={b.id}
            onPress={() => select(b)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.hairline }, pressed && { opacity: 0.6 }]}>
            <Text style={{ color: c.label, fontSize: 16, flex: 1 }}>{b.name}</Text>
            {b.floors ? <Text style={{ color: c.secondary, fontSize: 14 }}>{b.floors.length} 層</Text> : null}
          </Pressable>
        ))}
      </View>

      <View style={[styles.card, { backgroundColor: c.bg }]}>
        <Pressable
          style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
          accessibilityRole="link"
          onPress={() =>
            void Linking.openURL(
              Platform.OS === 'ios'
                ? `https://maps.apple.com/?q=${encodeURIComponent(`臺北城市科技大學 ${CAMPUS_ADDRESS}`)}`
                : `geo:0,0?q=${encodeURIComponent(`臺北城市科技大學 ${CAMPUS_ADDRESS}`)}`,
            )
          }>
          <Text style={{ color: c.accent, fontSize: 16, flex: 1 }}>在地圖 App 開啟</Text>
          <Text style={{ color: c.secondary, fontSize: 13 }}>{CAMPUS_ADDRESS}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.row, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.hairline }, pressed && { opacity: 0.6 }]}
          accessibilityRole="link"
          onPress={() => openInApp(CAMPUS_MAP_PAGE)}>
          <Text style={{ color: c.accent, fontSize: 16 }}>學校網站上的校園平面圖</Text>
        </Pressable>
      </View>
      <Text style={[styles.hint, { color: c.tertiary }]}>平面圖與樓層資訊來自學校網站（www.tpcu.edu.tw）。</Text>
    </ScrollView>
  );
}

function Pin({ c, building, active, left, top, onPress }: { c: Colors; building: Building; active: boolean; left: number; top: number; onPress: () => void }) {
  const size = active ? 26 : 18;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={building.name}
      accessibilityState={{ selected: active }}
      style={{
        position: 'absolute',
        left: left - size / 2,
        top: top - size / 2,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: active ? c.now : c.accent,
        borderWidth: 3,
        borderColor: '#FFFFFF',
        shadowColor: '#000',
        shadowOpacity: 0.3,
        shadowRadius: 3,
        shadowOffset: { width: 0, height: 1 },
        elevation: 3,
      }}
    />
  );
}

const styles = StyleSheet.create({
  lead: { fontSize: 17, textAlign: 'center' },
  card: { borderRadius: 16, overflow: 'hidden' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  hint: { fontSize: 12, textAlign: 'center', marginTop: -8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 14 },
  floor: { flexDirection: 'row', gap: 12, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, marginHorizontal: -10 },
  floorLabel: { width: 34, fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
