import {
  Button,
  Capsule,
  Chart,
  ContentUnavailableView,
  Form,
  HStack,
  Host,
  Image,
  LabeledContent,
  Label,
  Picker,
  ProgressView,
  RNHostView,
  SecureField,
  Section as SwiftSection,
  Spacer,
  Text,
  TextField,
  Toggle,
  VStack,
} from '@expo/ui/swift-ui';
import {
  opacity,
  autocorrectionDisabled,
  buttonBorderShape,
  controlSize,
  listRowBackground,
  listRowInsets,
  multilineTextAlignment,
  padding,
  buttonStyle,
  contentShape,
  disabled as disabledModifier,
  font,
  foregroundStyle,
  frame,
  aspectRatio,
  clipShape,
  resizable,
  keyboardType,
  lineLimit,
  onSubmit,
  pickerStyle,
  refreshable,
  shapes,
  submitLabel,
  tag,
  textContentType,
  textInputAutocapitalization,
  textSelection,
  type ModifierConfig,
} from '@expo/ui/swift-ui/modifiers';
import type { ReactElement } from 'react';
import { PlatformColor } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';

import type {
  ActionRowProps,
  HeroRowProps,
  NavRowProps,
  PrimaryButtonRowProps,
  ClassRowProps,
  ChartRowProps,
  SelectRowProps,
  StatsRowProps,
  ProfileRowProps,
  PickerRowProps,
  ScaleRowProps,
  ScreenProps,
  SectionProps,
  StatusProps,
  TextFieldRowProps,
  TextRowProps,
  ToggleRowProps,
  Tone,
  ValueRowProps,
} from './native-types';

export type * from './native-types';

const secondary = foregroundStyle({ type: 'hierarchical', style: 'secondary' });
const tertiary = foregroundStyle({ type: 'hierarchical', style: 'tertiary' });

function toneModifier(tone: Tone | undefined): ModifierConfig[] {
  switch (tone) {
    case 'secondary':
      return [secondary];
    case 'destructive':
      return [foregroundStyle({ type: 'color', color: PlatformColor('systemRed') })];
    case 'success':
      return [foregroundStyle({ type: 'color', color: PlatformColor('systemGreen') })];
    default:
      return [];
  }
}

/** A full-screen grouped `Form` (Settings-app style). */
export function Screen({ children, onRefresh }: ScreenProps) {
  return (
    <Host style={{ flex: 1 }}>
      <Form modifiers={onRefresh ? [refreshable(async () => void (await onRefresh()))] : undefined}>
        {children}
      </Form>
    </Host>
  );
}

export function Section({ title, footer, children }: SectionProps) {
  return (
    <SwiftSection title={title} footer={footer ? <Text>{footer}</Text> : undefined}>
      {children}
    </SwiftSection>
  );
}

export function ValueRow({ label, subtitle, value, icon, tone }: ValueRowProps) {
  const text = value === null || value === undefined || value === '' ? '—' : String(value);
  return (
    <HStack spacing={12}>
      {icon ? <RowIcon name={icon} /> : null}
      {subtitle ? (
        <VStack alignment="leading" spacing={2}>
          <Text>{label}</Text>
          <Text modifiers={[secondary, font({ textStyle: 'subheadline' })]}>{subtitle}</Text>
        </VStack>
      ) : (
        <Text>{label}</Text>
      )}
      <Spacer />
      <Text modifiers={[...(tone ? toneModifier(tone) : [secondary]), textSelection(true)]}>{text}</Text>
    </HStack>
  );
}

/** Leading SF Symbol, tinted and in a fixed-width column so row titles line up. */
function RowIcon({ name }: { name: SFSymbol }) {
  return (
    <Image
      systemName={name}
      modifiers={[
        foregroundStyle({ type: 'color', color: PlatformColor('systemBlue') }),
        frame({ width: 26 }),
      ]}
    />
  );
}

export function NavRow({ title, subtitle, detail, icon, onPress, disabled, external }: NavRowProps) {
  const titleBlock = (
    <VStack alignment="leading" spacing={2}>
      <Text>{title}</Text>
      {subtitle ? <Text modifiers={[secondary, font({ textStyle: 'subheadline' })]}>{subtitle}</Text> : null}
    </VStack>
  );
  return (
    <Button
      onPress={onPress}
      modifiers={[buttonStyle('plain'), ...(disabled ? [disabledModifier(true)] : [])]}>
      <HStack spacing={12} modifiers={[contentShape(shapes.rectangle())]}>
        {icon ? <RowIcon name={icon} /> : null}
        {titleBlock}
        <Spacer />
        {detail ? <Text modifiers={[secondary]}>{detail}</Text> : null}
        <Image
          systemName={external ? 'arrow.up.right' : 'chevron.right'}
          size={13}
          modifiers={[tertiary, font({ weight: 'semibold', size: 13 })]}
        />
      </HStack>
    </Button>
  );
}

export function ActionRow({ title, icon, onPress, destructive, disabled, loading }: ActionRowProps) {
  const modifiers = disabled || loading ? [disabledModifier(true)] : undefined;
  const role = destructive ? 'destructive' : 'default';
  if (loading) {
    return (
      <Button onPress={onPress} role={role} modifiers={modifiers}>
        <HStack spacing={8}>
          <Text>{title}</Text>
          <Spacer />
          <ProgressView />
        </HStack>
      </Button>
    );
  }
  return <Button label={title} systemImage={icon} onPress={onPress} role={role} modifiers={modifiers} />;
}

const keyboardMap = {
  default: 'default',
  'number-pad': 'ascii-capable-number-pad',
  'email-address': 'email-address',
  'phone-pad': 'phone-pad',
  url: 'url',
} as const;

export function TextFieldRow({
  state,
  onChangeText,
  placeholder,
  label,
  secure,
  keyboard = 'default',
  contentType,
  autoCapitalize = false,
  multiline,
  maxLength,
  submitLabel: submit,
  onSubmit: handleSubmit,
}: TextFieldRowProps) {
  const modifiers: ModifierConfig[] = [
    keyboardType(keyboardMap[keyboard]),
    autocorrectionDisabled(!autoCapitalize),
    textInputAutocapitalization(autoCapitalize ? 'sentences' : 'never'),
  ];
  if (contentType) modifiers.push(textContentType(contentType));
  if (submit) modifiers.push(submitLabel(submit));
  if (handleSubmit) modifiers.push(onSubmit(handleSubmit));
  if (multiline) modifiers.push(lineLimit(4));

  const field = secure ? (
    <SecureField
      text={state as never}
      placeholder={placeholder}
      onTextChange={onChangeText}
      maxLength={maxLength}
      modifiers={modifiers}
    />
  ) : (
    <TextField
      text={state as never}
      placeholder={placeholder}
      onTextChange={onChangeText}
      maxLength={maxLength}
      axis={multiline ? 'vertical' : 'horizontal'}
      modifiers={modifiers}
    />
  );
  return label ? <LabeledContent label={label}>{field}</LabeledContent> : field;
}

export function PickerRow<T extends string>({ label, icon, selection, options, onChange }: PickerRowProps<T>) {
  return (
    <Picker
      label={icon ? <Label title={label} systemImage={icon} /> : label}
      selection={selection}
      onSelectionChange={(value) => onChange(value as T)}
      modifiers={[pickerStyle('menu')]}>
      {options.map((o) => (
        <Text key={o.value} modifiers={[tag(o.value)]}>
          {o.label}
        </Text>
      ))}
    </Picker>
  );
}

export function ScaleRow<T extends string>({ title, selection, options, onChange }: ScaleRowProps<T>) {
  return (
    <VStack alignment="leading" spacing={12} modifiers={[padding({ vertical: 6 })]}>
      <Text>{title}</Text>
      <Picker selection={selection} onSelectionChange={(value) => onChange(value as T)} modifiers={[pickerStyle('segmented')]}>
        {options.map((o) => (
          <Text key={o.value} modifiers={[tag(o.value)]}>
            {o.label}
          </Text>
        ))}
      </Picker>
    </VStack>
  );
}

export function ToggleRow({ label, value, onChange }: ToggleRowProps) {
  return <Toggle label={label} isOn={value} onIsOnChange={onChange} />;
}

/** A multi-line block of read-only text inside a section. */
export function TextRow({ title, meta, body, tone }: TextRowProps) {
  return (
    <VStack alignment="leading" spacing={4}>
      {title ? <Text modifiers={[font({ textStyle: 'headline' }), ...toneModifier(tone)]}>{title}</Text> : null}
      {meta ? <Text modifiers={[secondary, font({ textStyle: 'footnote' })]}>{meta}</Text> : null}
      {body ? <Text modifiers={[textSelection(true), ...(title ? [] : toneModifier(tone))]}>{body}</Text> : null}
    </VStack>
  );
}

export function LoadingRow({ text = '載入中…' }: { text?: string }) {
  return (
    <HStack spacing={10}>
      <ProgressView />
      <Text modifiers={[secondary]}>{text}</Text>
    </HStack>
  );
}

/** A row that hosts React Native content at the row's full width (its height follows the content). */
export function WideRow({ children }: { children: ReactElement }) {
  return <RNHostView matchContents={{ vertical: true }}>{children}</RNHostView>;
}

/** A row that hosts arbitrary React Native content (e.g. an image). */
export function CustomRow({ children }: { children: ReactElement }) {
  return <RNHostView matchContents>{children}</RNHostView>;
}

/** Full-screen empty / error state. */
export function Status({ title, message, icon = 'exclamationmark.triangle', actionTitle, onAction }: StatusProps) {
  return (
    <Host style={{ flex: 1 }}>
      <ContentUnavailableView
        title={title}
        systemImage={icon}
        description={message}
        actions={actionTitle && onAction ? <Button label={actionTitle} onPress={onAction} /> : undefined}
      />
    </Host>
  );
}

/** Full-screen loading indicator. */
export function Loading({ text }: { text?: string }) {
  return (
    <Host style={{ flex: 1 }}>
      {/* Fill the screen so the spinner sits in the middle, like a native loading view. */}
      <VStack spacing={10} modifiers={[frame({ maxWidth: 10_000, maxHeight: 10_000 })]}>
        <ProgressView />
        {text ? <Text modifiers={[secondary]}>{text}</Text> : null}
      </VStack>
    </Host>
  );
}

/** Borderless header row: a large tinted symbol, a large title and a subtitle (Apple sign-in sheet style). */
export function HeroRow({ icon, title, subtitle }: HeroRowProps) {
  return (
    <VStack
      spacing={10}
      modifiers={[
        frame({ maxWidth: 10_000 }),
        padding({ top: 8, bottom: 4 }),
        listRowBackground('clear'),
        listRowInsets({ top: 0, bottom: 0, leading: 0, trailing: 0 }),
      ]}>
      <Image
        systemName={icon}
        size={56}
        modifiers={[
          foregroundStyle({ type: 'color', color: PlatformColor('systemBlue') }),
          padding({ bottom: 4 }),
        ]}
      />
      <Text modifiers={[font({ textStyle: 'largeTitle', weight: 'bold' })]}>{title}</Text>
      {subtitle ? (
        <Text modifiers={[secondary, font({ textStyle: 'subheadline' }), multilineTextAlignment('center')]}>
          {subtitle}
        </Text>
      ) : null}
    </VStack>
  );
}

/** Full-width filled button on a clear row (the main action of a screen, e.g. 登入). */
export function PrimaryButtonRow({ title, onPress, disabled, loading }: PrimaryButtonRowProps) {
  return (
    <Button
      onPress={onPress}
      modifiers={[
        buttonStyle('borderedProminent'),
        buttonBorderShape('capsule'),
        controlSize('large'),
        ...(disabled || loading ? [disabledModifier(true)] : []),
        listRowBackground('clear'),
        listRowInsets({ top: 0, bottom: 0, leading: 0, trailing: 0 }),
      ]}>
      <HStack spacing={8} modifiers={[frame({ maxWidth: 10_000 })]}>
        {loading ? <ProgressView /> : null}
        <Text modifiers={[font({ textStyle: 'headline' })]}>{title}</Text>
      </HStack>
    </Button>
  );
}

/** The signed-in student at the top of 設定 (like the Apple Account row in iOS Settings). */
export function ProfileRow({ name, subtitle, photo }: ProfileRowProps) {
  return (
    <HStack spacing={14} modifiers={[padding({ vertical: 4 })]}>
      {photo ? (
        <Image
          key={photo}
          uiImage={photo}
          modifiers={[resizable(), aspectRatio({ contentMode: 'fill' }), frame({ width: 56, height: 56 }), clipShape('circle')]}
        />
      ) : (
        <Image
          systemName="person.crop.circle.fill"
          size={52}
          modifiers={[foregroundStyle({ type: 'color', color: PlatformColor('systemBlue') })]}
        />
      )}
      <VStack alignment="leading" spacing={3}>
        <Text modifiers={[font({ size: 22, weight: 'semibold' })]}>{name}</Text>
        {subtitle ? <Text modifiers={[secondary, font({ textStyle: 'subheadline' })]}>{subtitle}</Text> : null}
      </VStack>
      <Spacer />
    </HStack>
  );
}

/** A tappable row with a selection circle on the right (like picking items in Mail or Reminders). */
export function SelectRow({ title, subtitle, selected, onPress, nested }: SelectRowProps) {
  const symbol = selected === 'mixed' ? 'minus.circle.fill' : selected ? 'checkmark.circle.fill' : 'circle';
  return (
    <Button onPress={onPress} modifiers={[buttonStyle('plain')]}>
      <HStack spacing={12} modifiers={[contentShape(shapes.rectangle()), ...(nested ? [padding({ leading: 16 })] : [])]}>
        <VStack alignment="leading" spacing={2}>
          <Text modifiers={nested ? [font({ textStyle: 'subheadline' })] : [font({ textStyle: 'body', weight: 'medium' })]}>
            {title}
          </Text>
          {subtitle ? <Text modifiers={[secondary, font({ textStyle: nested ? 'caption' : 'subheadline' })]}>{subtitle}</Text> : null}
        </VStack>
        <Spacer />
        <Image
          systemName={symbol}
          size={nested ? 20 : 24}
          modifiers={[
            selected
              ? foregroundStyle({ type: 'color', color: PlatformColor('systemBlue') })
              : tertiary,
          ]}
        />
      </HStack>
    </Button>
  );
}

/** Key figures side by side (like the summary at the top of Health or Fitness). */
export function StatsRow({ stats }: StatsRowProps) {
  return (
    <HStack spacing={0} modifiers={[padding({ top: 6, bottom: 6 })]}>
      {stats.map((s) => (
        <VStack key={s.label} spacing={2} modifiers={[frame({ maxWidth: 10_000 })]}>
          <Text modifiers={[font({ textStyle: 'title2', weight: 'semibold', design: 'rounded' }), ...toneModifier(s.tone)]}>
            {s.value}
          </Text>
          <Text modifiers={[secondary, font({ textStyle: 'caption' })]}>{s.label}</Text>
        </VStack>
      ))}
    </HStack>
  );
}

/** A class in a day's list: colour stripe, course, time · room, and a status on the right. */
export function ClassRow({ course, detail, color, status, live, dimmed, onPress }: ClassRowProps) {
  return (
    <Button onPress={onPress} modifiers={[buttonStyle('plain'), ...(dimmed ? [opacity(0.45)] : [])]}>
      <HStack spacing={12} modifiers={[contentShape(shapes.rectangle())]}>
        <Capsule modifiers={[foregroundStyle({ type: 'color', color }), frame({ width: 4, height: 40 })]} />
        <VStack alignment="leading" spacing={2}>
          <Text modifiers={[font({ textStyle: 'body', weight: 'semibold' }), lineLimit(1)]}>{course}</Text>
          <Text modifiers={[secondary, font({ textStyle: 'subheadline' }), lineLimit(1)]}>{detail}</Text>
        </VStack>
        <Spacer />
        {status ? (
          <Text
            modifiers={[
              font({ textStyle: 'subheadline', weight: live ? 'semibold' : 'regular' }),
              ...(live ? [foregroundStyle({ type: 'color', color })] : [secondary]),
            ]}>
            {status}
          </Text>
        ) : null}
      </HStack>
    </Button>
  );
}

/** A native Swift Charts chart inside a list row. */
export function ChartRow({ type, data, height = 180, referenceLines, color, legend }: ChartRowProps) {
  return (
    <Chart
      type={type}
      data={data}
      animate
      showGrid={type !== 'pie'}
      showLegend={legend}
      referenceLines={referenceLines}
      lineStyle={type === 'line' ? { width: 3, pointStyle: 'circle', pointSize: 8, color: color ?? PlatformColor('systemBlue') } : undefined}
      barStyle={type === 'bar' ? { cornerRadius: 6 } : undefined}
      pieStyle={type === 'pie' ? { innerRadius: 0.6, angularInset: 2, cornerRadius: 6, opacity: 1 } : undefined}
      ruleStyle={{ color: PlatformColor('systemRed'), lineWidth: 1, dashArray: [4, 4] }}
      modifiers={[frame({ height }), padding({ top: 8, bottom: 8 })]}
    />
  );
}
