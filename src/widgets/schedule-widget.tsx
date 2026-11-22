import {
  AccessoryWidgetBackground,
  Capsule,
  HStack,
  Image,
  Spacer,
  Text,
  VStack,
  Rectangle,
  RoundedRectangle,
  ZStack,
} from '@expo/ui/swift-ui';
import {
  containerBackground,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  offset,
  padding,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

/**
 * 課表 widget for the home screen (small / medium / large) and the lock screen (inline,
 * circular, rectangular). The app computes a timeline of what to show (see `sync-schedule-widget`),
 * so the widget itself only lays out props.
 */
export type ScheduleWidgetClass = {
  course: string;
  /** 09:20–12:10 */
  time: string;
  room: string;
  /** Course colour for light and dark backgrounds. */
  color: string;
  colorDark: string;
  /** In progress at this entry's time. */
  now: boolean;
};

/** One class in the week grid (large widget). */
export type ScheduleWidgetBlock = {
  weekday: number;
  startMin: number;
  endMin: number;
  course: string;
  room: string;
  color: string;
  colorDark: string;
};

export type ScheduleWidgetProps = {
  /** 今天 / 明天 / 週一; empty when there's no class all week. */
  day: string;
  /** e.g. 11月24日 週一 */
  date: string;
  classes: ScheduleWidgetClass[];
  /** Shown when `classes` is empty. */
  message: string;
  /** The whole week, for the large widget's calendar. */
  week?: ScheduleWidgetBlock[];
  /** Today's weekday (1–7) and minutes after midnight at this entry, for the highlight and now line. */
  today?: number;
  nowMin?: number;
};

function ScheduleWidget(props: ScheduleWidgetProps, env: WidgetEnvironment) {
  'widget';
  const family = env.widgetFamily ?? 'systemSmall';
  const dark = env.colorScheme === 'dark';
  const first = props.classes[0];
  const start = (c: { time: string }) => c.time.split('–')[0];
  const red = { type: 'color' as const, color: '#FF3B30' };
  const secondary = { type: 'hierarchical' as const, style: 'secondary' as const };
  const url = widgetURL('hongchiao://schedule');

  // ----- Lock screen -----
  if (family === 'accessoryInline') {
    return (
      <Text modifiers={[url]}>
        {first ? `${first.now ? '上課中' : `${props.day} ${start(first)}`} ${first.course}` : props.message}
      </Text>
    );
  }

  if (family === 'accessoryCircular') {
    return (
      <ZStack modifiers={[containerBackground('clear', 'widget'), url]}>
        <AccessoryWidgetBackground />
        <VStack spacing={0}>
          <Image systemName={first?.now ? 'book.fill' : 'calendar'} size={13} />
          <Text modifiers={[font({ size: 15, weight: 'semibold', design: 'rounded' }), lineLimit(1)]}>
            {first ? (first.now ? '上課' : start(first)) : '—'}
          </Text>
        </VStack>
      </ZStack>
    );
  }

  if (family === 'accessoryRectangular') {
    return (
      <VStack alignment="leading" spacing={1} modifiers={[containerBackground('clear', 'widget'), url, frame({ maxWidth: 10_000, alignment: 'leading' })]}>
        <Text modifiers={[font({ textStyle: 'caption', weight: 'semibold' }), lineLimit(1)]}>
          {first ? (first.now ? `上課中 · ${first.time}` : `${props.day} ${first.time}`) : '課表'}
        </Text>
        <Text modifiers={[font({ textStyle: 'headline' }), lineLimit(1)]}>{first ? first.course : props.message}</Text>
        {first ? (
          <Text modifiers={[font({ textStyle: 'caption' }), lineLimit(1)]}>
            {props.classes[1] ? `${first.room} · 接著 ${props.classes[1].course}` : first.room}
          </Text>
        ) : null}
      </VStack>
    );
  }

  // ----- Home screen -----
  const background = containerBackground(dark ? '#1C1C1E' : '#FFFFFF', 'widget');
  const header = (
    <HStack spacing={4}>
      <Text modifiers={[font({ textStyle: 'caption', weight: 'bold' }), foregroundStyle(red)]}>
        {props.day || '課表'}
      </Text>
      <Text modifiers={[font({ textStyle: 'caption' }), foregroundStyle(secondary), lineLimit(1)]}>{props.date}</Text>
      <Spacer />
    </HStack>
  );

  // ----- Large: the week as a calendar -----
  const week = props.week ?? [];
  if (family === 'systemLarge' && week.length) {
    const days = [1, 2, 3, 4, 5, ...[6, 7].filter((d) => week.some((b) => b.weekday === d))];
    const names = ['', '一', '二', '三', '四', '五', '六', '日'];
    const from = Math.min(8, Math.floor(Math.min(...week.map((b) => b.startMin)) / 60));
    const to = Math.max(17, Math.ceil(Math.max(...week.map((b) => b.endMin)) / 60));
    const bodyH = 262;
    const hourH = bodyH / (to - from);
    const y = (min: number) => ((min - from * 60) / 60) * hourH;
    const today = props.today ?? 0;
    const nowMin = props.nowMin ?? -1;
    const hours = Array.from({ length: to - from }, (_, i) => from + i);
    const line = dark ? '#3A3A3C' : '#E5E5EA';
    const gutter = 26;

    return (
      <VStack alignment="leading" spacing={4} modifiers={[background, url, frame({ maxWidth: 10_000, maxHeight: 10_000, alignment: 'topLeading' })]}>
        <HStack spacing={0}>
          <Text modifiers={[font({ size: 9 }), frame({ width: gutter, alignment: 'leading' })]}> </Text>
          {days.map((d) => (
            <Text
              key={d}
              modifiers={[
                font({ size: 11, weight: d === today ? 'bold' : 'medium' }),
                foregroundStyle(d === today ? red : secondary),
                frame({ maxWidth: 10_000 }),
              ]}>
              {`週${names[d]}`}
            </Text>
          ))}
        </HStack>
        <HStack spacing={0} alignment="top">
          <VStack alignment="trailing" spacing={0} modifiers={[frame({ width: gutter, height: bodyH, alignment: 'top' })]}>
            {hours.map((h) => (
              <Text key={h} modifiers={[font({ size: 8.5, design: 'rounded' }), foregroundStyle(secondary), frame({ width: gutter - 4, height: hourH, alignment: 'topTrailing' }), offset({ y: -5 })]}>
                {String(h)}
              </Text>
            ))}
          </VStack>
          <ZStack alignment="topLeading">
            <VStack spacing={0}>
              {hours.map((h) => (
                <VStack key={h} spacing={0} modifiers={[frame({ maxWidth: 10_000, minHeight: hourH, maxHeight: hourH, alignment: 'top' })]}>
                  <Rectangle modifiers={[foregroundStyle({ type: 'color', color: line }), frame({ maxWidth: 10_000, minHeight: 0.5, maxHeight: 0.5 })]} />
                  <Spacer />
                </VStack>
              ))}
            </VStack>
            <HStack spacing={2} alignment="top">
              {days.map((d) => {
                const blocks = week.filter((b) => b.weekday === d).sort((a, z) => a.startMin - z.startMin);
                let cursor = from * 60;
                const showNow = d === today && nowMin >= from * 60 && nowMin <= to * 60;
                return (
                  <ZStack key={d} alignment="topLeading" modifiers={[frame({ maxWidth: 10_000, minHeight: bodyH, maxHeight: bodyH, alignment: 'topLeading' })]}>
                    <VStack alignment="leading" spacing={0} modifiers={[frame({ maxWidth: 10_000, minHeight: bodyH, maxHeight: bodyH, alignment: 'topLeading' })]}>
                      {blocks.map((b, i) => {
                        const gap = Math.max(0, y(b.startMin) - y(cursor));
                        const h = Math.max(12, y(b.endMin) - y(Math.max(b.startMin, cursor)) - 1.5);
                        cursor = Math.max(cursor, b.endMin);
                        const color = dark ? b.colorDark : b.color;
                        return (
                          <VStack key={i} alignment="leading" spacing={0}>
                            <Rectangle modifiers={[foregroundStyle({ type: 'color', color: '#00000000' }), frame({ height: gap + 1.5 })]} />
                            <ZStack alignment="topLeading" modifiers={[frame({ maxWidth: 10_000, minHeight: h, maxHeight: h, alignment: 'topLeading' })]}>
                              <RoundedRectangle cornerRadius={4} modifiers={[foregroundStyle({ type: 'color', color: `${color}${dark ? '40' : '2E'}` })]} />
                              <HStack spacing={2} alignment="top">
                                <Rectangle modifiers={[foregroundStyle({ type: 'color', color }), frame({ width: 2.5, height: h })]} />
                                <VStack alignment="leading" spacing={1} modifiers={[padding({ top: 2, trailing: 1 })]}>
                                  <Text modifiers={[font({ size: 9.5, weight: 'semibold' }), lineLimit(Math.max(1, Math.floor((h - 4) / 12))), foregroundStyle({ type: 'color', color })]}>
                                    {b.course}
                                  </Text>
                                  {h > 44 && b.room ? (
                                    <Text modifiers={[font({ size: 8 }), lineLimit(1), foregroundStyle(secondary)]}>{(b.room.match(/^\D*\d+/) ?? [b.room])[0]}</Text>
                                  ) : null}
                                </VStack>
                              </HStack>
                            </ZStack>
                          </VStack>
                        );
                      })}
                      <Spacer />
                    </VStack>
                    {showNow ? (
                      <VStack spacing={0} modifiers={[frame({ maxWidth: 10_000, minHeight: bodyH, maxHeight: bodyH, alignment: 'top' })]}>
                        <Rectangle modifiers={[foregroundStyle({ type: 'color', color: '#00000000' }), frame({ height: Math.max(0, y(nowMin) - 1) })]} />
                        <Rectangle modifiers={[foregroundStyle(red), frame({ maxWidth: 10_000, minHeight: 2, maxHeight: 2 })]} />
                        <Spacer />
                      </VStack>
                    ) : null}
                  </ZStack>
                );
              })}
            </HStack>
          </ZStack>
        </HStack>
        <Spacer />
      </VStack>
    );
  }

  if (!first) {
    return (
      <VStack alignment="leading" spacing={6} modifiers={[background, url, frame({ maxWidth: 10_000, maxHeight: 10_000, alignment: 'topLeading' })]}>
        {header}
        <Spacer />
        <Image systemName="sun.max" size={22} modifiers={[foregroundStyle(secondary)]} />
        <Text modifiers={[font({ textStyle: 'subheadline', weight: 'semibold' })]}>{props.message}</Text>
      </VStack>
    );
  }

  if (family === 'systemSmall') {
    const color = dark ? first.colorDark : first.color;
    const more = props.classes.length - 1;
    return (
      <VStack alignment="leading" spacing={4} modifiers={[background, url, frame({ maxWidth: 10_000, maxHeight: 10_000, alignment: 'topLeading' })]}>
        {header}
        <Spacer />
        <HStack spacing={6} alignment="top">
          <Capsule modifiers={[foregroundStyle({ type: 'color', color }), frame({ width: 4, height: 54 })]} />
          <VStack alignment="leading" spacing={2}>
            {first.now ? (
              <Text modifiers={[font({ textStyle: 'caption2', weight: 'bold' }), foregroundStyle({ type: 'color', color })]}>上課中</Text>
            ) : null}
            <Text modifiers={[font({ textStyle: 'headline' }), lineLimit(2)]}>{first.course}</Text>
            <Text modifiers={[font({ textStyle: 'caption' }), foregroundStyle(secondary), lineLimit(1)]}>{first.time}</Text>
            <Text modifiers={[font({ textStyle: 'caption' }), foregroundStyle(secondary), lineLimit(1)]}>{first.room}</Text>
          </VStack>
        </HStack>
        {more > 0 ? (
          <Text modifiers={[font({ textStyle: 'caption2' }), foregroundStyle(secondary), padding({ top: 2 })]}>{`還有 ${more} 堂課`}</Text>
        ) : null}
      </VStack>
    );
  }

  const limit = family === 'systemMedium' ? 3 : 7;
  const shown = props.classes.slice(0, limit);
  const hidden = props.classes.length - shown.length;
  return (
    <VStack alignment="leading" spacing={family === 'systemMedium' ? 5 : 8} modifiers={[background, url, frame({ maxWidth: 10_000, maxHeight: 10_000, alignment: 'topLeading' })]}>
      {header}
      {shown.map((c, i) => {
        const color = dark ? c.colorDark : c.color;
        return (
          <HStack key={i} spacing={8}>
            <Capsule modifiers={[foregroundStyle({ type: 'color', color }), frame({ width: 4, height: 30 })]} />
            <VStack alignment="leading" spacing={0}>
              <Text modifiers={[font({ textStyle: 'subheadline', weight: 'semibold' }), lineLimit(1)]}>{c.course}</Text>
              <Text modifiers={[font({ textStyle: 'caption' }), foregroundStyle(secondary), lineLimit(1)]}>{c.room}</Text>
            </VStack>
            <Spacer />
            <Text
              modifiers={[
                font({ textStyle: 'caption', weight: c.now ? 'bold' : 'regular' }),
                foregroundStyle(c.now ? { type: 'color', color } : secondary),
              ]}>
              {c.now ? '上課中' : c.time}
            </Text>
          </HStack>
        );
      })}
      {hidden > 0 ? (
        <Text modifiers={[font({ textStyle: 'caption2' }), foregroundStyle(secondary)]}>{`還有 ${hidden} 堂課`}</Text>
      ) : null}
      <Spacer />
    </VStack>
  );
}

export const scheduleWidget = createWidget<ScheduleWidgetProps>('ScheduleWidget', ScheduleWidget, {
  day: '',
  date: '',
  classes: [],
  message: '打開管城市以載入課表',
});
