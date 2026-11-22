import { StyleSheet, Text, View } from 'react-native';

import type { Colors } from '@/components/week-grid';
import type { Building } from '@/lib/campus';

/** A building's name and floor directory, with `floor` highlighted. */
export function BuildingCard({ c, building, floor, room, flat }: { c: Colors; building: Building; floor?: string; room?: string; flat?: boolean }) {
  return (
    <View style={[{ borderRadius: 16, overflow: 'hidden' as const }, { backgroundColor: flat ? 'transparent' : c.bg, padding: 16, gap: 10 }]}>
      <View style={{ gap: 2 }}>
        <Text style={{ color: c.label, fontSize: 20, fontWeight: '700' }}>{building.name}</Text>
        {room ? <Text style={{ color: c.secondary, fontSize: 15 }}>{`${room} 在 ${floor}`}</Text> : null}
      </View>
      {building.floors ? (
        building.floors.map(([f, what]) => {
          const here = f === floor;
          return (
            <View key={f} style={[styles.floor, here && { backgroundColor: c.accent }]}>
              <Text style={[styles.floorLabel, { color: here ? c.onAccent : c.accent }]}>{f}</Text>
              <Text style={{ flex: 1, color: here ? c.onAccent : c.label, fontSize: 14, lineHeight: 20 }}>{what}</Text>
            </View>
          );
        })
      ) : (
        <Text style={{ color: c.secondary, fontSize: 14 }}>學校網站沒有這棟大樓的樓層資訊。</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  floor: { flexDirection: 'row', gap: 12, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, marginHorizontal: -10 },
  floorLabel: { width: 34, fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
