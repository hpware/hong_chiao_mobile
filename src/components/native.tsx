import {
  Button,
  Column,
  FieldGroup,
  Host,
  Icon,
  Row,
  ListItem,
  Picker,
  RNHostView,
  Switch,
  Text,
  TextInput,
} from '@expo/ui';
import type { ReactElement } from 'react';
import { ActivityIndicator, Image as RNImage, RefreshControl, Text as RNText, ScrollView, useColorScheme, View } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';

import { ANDROID_ICONS } from './icons';

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

/**
 * Android (and fallback) implementation of the native building blocks, rendered with Jetpack
 * Compose through `@expo/ui`'s universal components. iOS uses `native.ios.tsx` (SwiftUI).
 */

function useToneColor() {
  const dark = useColorScheme() === 'dark';
  return (tone: Tone | undefined): string | undefined => {
    switch (tone) {
      case 'secondary':
        return dark ? '#C4C7C5' : '#444746';
      case 'destructive':
        return dark ? '#F2B8B5' : '#B3261E';
      case 'success':
        return dark ? '#7DD99A' : '#146C2E';
      default:
        return undefined;
    }
  };
}

function useAccent() {
  return useColorScheme() === 'dark' ? '#9EC1FF' : '#1F57C3';
}

/** Leading Material Symbol for an SF Symbol name (nothing when there's no mapping). */
function RowIcon({ name, color }: { name?: SFSymbol; color?: string }) {
  const accent = useAccent();
  const source = name ? ANDROID_ICONS[name] : undefined;
  return source ? <Icon name={source} size={24} color={color ?? accent} /> : null;
}

function Trailing({ name }: { name: SFSymbol }) {
  const dark = useColorScheme() === 'dark';
  return <RowIcon name={name} color={dark ? '#8E8E96' : '#76767E'} />;
}

export function Screen({ children, onRefresh }: ScreenProps) {
  if (!onRefresh) {
    return (
      <Host style={{ flex: 1 }}>
        <FieldGroup>{children}</FieldGroup>
      </Host>
    );
  }
  return <RefreshableScreen onRefresh={onRefresh}>{children}</RefreshableScreen>;
}

function RefreshableScreen({ children, onRefresh }: ScreenProps & { onRefresh: () => Promise<unknown> }) {
  return (
    <ScrollView
      contentContainerStyle={{ flexGrow: 1 }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => void onRefresh()} />}>
      <Host matchContents={{ vertical: true }} style={{ width: '100%' }}>
        <FieldGroup>{children}</FieldGroup>
      </Host>
    </ScrollView>
  );
}

export function Section({ title, footer, children }: SectionProps) {
  return (
    <FieldGroup.Section title={title}>
      {children}
      {footer ? (
        <FieldGroup.SectionFooter>
          <Text>{footer}</Text>
        </FieldGroup.SectionFooter>
      ) : null}
    </FieldGroup.Section>
  );
}

export function ValueRow({ label, subtitle, value, icon, tone }: ValueRowProps) {
  const color = useToneColor();
  const text = value === null || value === undefined || value === '' ? '—' : String(value);
  return (
    <ListItem
      leading={icon ? <RowIcon name={icon} /> : undefined}
      supportingText={subtitle}
      trailing={<Text textStyle={{ color: color(tone ?? 'secondary') }}>{text}</Text>}>
      <Text>{label}</Text>
    </ListItem>
  );
}

export function NavRow({ title, subtitle, detail, icon, onPress, disabled, external }: NavRowProps) {
  const color = useToneColor();
  return (
    <ListItem
      onPress={disabled ? undefined : onPress}
      leading={icon ? <RowIcon name={icon} /> : undefined}
      supportingText={subtitle}
      trailing={
        <Row spacing={8} alignment="center">
          {detail ? <Text textStyle={{ color: color('secondary') }}>{detail}</Text> : null}
          <Trailing name={external ? 'arrow.up.right' : 'chevron.right'} />
        </Row>
      }>
      <Text>{title}</Text>
    </ListItem>
  );
}

export function ActionRow({ title, icon, onPress, destructive, disabled, loading }: ActionRowProps) {
  const color = useToneColor();
  const accent = useAccent();
  return (
    <ListItem
      onPress={disabled || loading ? undefined : onPress}
      leading={icon ? <RowIcon name={icon} color={destructive ? color('destructive') : undefined} /> : undefined}
      trailing={loading ? <ActivityIndicator /> : undefined}>
      <Text textStyle={{ color: destructive ? color('destructive') : accent, fontWeight: '500' }}>
        {title}
      </Text>
    </ListItem>
  );
}

const autoCompleteMap = {
  username: 'username',
  password: 'current-password',
  newPassword: 'new-password',
  oneTimeCode: 'one-time-code',
  emailAddress: 'email',
  telephoneNumber: 'tel',
  URL: 'url',
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
  submitLabel,
  onSubmit,
}: TextFieldRowProps) {
  return (
    <TextInput
      value={state}
      onChangeText={onChangeText}
      placeholder={label ? `${label}：${placeholder}` : placeholder}
      secureTextEntry={secure}
      keyboardType={keyboard}
      autoComplete={contentType ? autoCompleteMap[contentType] : undefined}
      autoCapitalize={autoCapitalize ? 'sentences' : 'none'}
      autoCorrect={autoCapitalize}
      multiline={multiline}
      maxLength={maxLength}
      returnKeyType={submitLabel}
      onSubmitEditing={onSubmit ? () => onSubmit() : undefined}
    />
  );
}

export function PickerRow<T extends string>({ label, icon, selection, options, onChange }: PickerRowProps<T>) {
  return (
    <ListItem
      leading={icon ? <RowIcon name={icon} /> : undefined}
      trailing={
        <Picker selectedValue={selection} onValueChange={(v) => onChange(v as T)}>
          {options.map((o) => (
            <Picker.Item key={o.value} label={o.label} value={o.value} />
          ))}
        </Picker>
      }>
      <Text>{label}</Text>
    </ListItem>
  );
}

export function ScaleRow<T extends string>({ title, selection, options, onChange }: ScaleRowProps<T>) {
  return (
    <ListItem
      supportingText={selection ? undefined : '請選擇'}
      trailing={
        <Picker selectedValue={selection} onValueChange={(v) => v && onChange(v as T)}>
          {[{ label: '請選擇', value: '' }, ...options].map((o) => (
            <Picker.Item key={o.value} label={o.label} value={o.value} />
          ))}
        </Picker>
      }>
      <Text>{title}</Text>
    </ListItem>
  );
}

export function ToggleRow({ label, value, onChange }: ToggleRowProps) {
  return (
    <ListItem trailing={<Switch value={value} onValueChange={onChange} />}>
      <Text>{label}</Text>
    </ListItem>
  );
}

export function TextRow({ title, meta, body, tone }: TextRowProps) {
  const color = useToneColor();
  return (
    <Column spacing={4} style={{ padding: 16 }}>
      {title ? <Text textStyle={{ fontWeight: '600', color: color(tone) }}>{title}</Text> : null}
      {meta ? <Text textStyle={{ fontSize: 13, color: color('secondary') }}>{meta}</Text> : null}
      {body ? <Text textStyle={{ color: title ? undefined : color(tone) }}>{body}</Text> : null}
    </Column>
  );
}

export function LoadingRow({ text = '載入中…' }: { text?: string }) {
  return (
    <ListItem leading={<ActivityIndicator />}>
      <Text>{text}</Text>
    </ListItem>
  );
}

export function WideRow({ children }: { children: ReactElement }) {
  return <RNHostView matchContents={{ vertical: true }}>{children}</RNHostView>;
}

export function CustomRow({ children }: { children: ReactElement }) {
  return <RNHostView matchContents>{children}</RNHostView>;
}

export function Status({ title, message, icon = 'exclamationmark.triangle', actionTitle, onAction }: StatusProps) {
  const dark = useColorScheme() === 'dark';
  const source = ANDROID_ICONS[icon];
  return (
    <Host style={{ flex: 1 }}>
      <Column spacing={12} alignment="center" style={{ padding: 32 }}>
        {source ? <Icon name={source} size={48} color={dark ? '#8E8E96' : '#76767E'} /> : null}
        <Text textStyle={{ fontSize: 20, fontWeight: '600', textAlign: 'center' }}>{title}</Text>
        {message ? <Text textStyle={{ textAlign: 'center' }}>{message}</Text> : null}
        {actionTitle && onAction ? <Button label={actionTitle} onPress={onAction} /> : null}
      </Column>
    </Host>
  );
}

export function Loading({ text }: { text?: string }) {
  const dark = useColorScheme() === 'dark';
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <ActivityIndicator size="large" />
      {text ? <RNText style={{ color: dark ? '#C4C7C5' : '#444746', fontSize: 15 }}>{text}</RNText> : null}
    </View>
  );
}

/** Header block: large title and subtitle. */
export function HeroRow({ icon, title, subtitle }: HeroRowProps) {
  return (
    <ListItem leading={<RowIcon name={icon} />} supportingText={subtitle}>
      <Text textStyle={{ fontSize: 28, fontWeight: '700' }}>{title}</Text>
    </ListItem>
  );
}

/** Main action button. */
export function PrimaryButtonRow({ title, onPress, disabled, loading }: PrimaryButtonRowProps) {
  return <Button label={loading ? `${title}…` : title} onPress={onPress} disabled={disabled || loading} />;
}

export function ProfileRow({ name, subtitle, photo }: ProfileRowProps) {
  const accent = useAccent();
  return (
    <ListItem
      leading={
        photo ? (
          <RNHostView matchContents>
            <RNImage source={{ uri: photo }} style={{ width: 56, height: 56, borderRadius: 28 }} />
          </RNHostView>
        ) : ANDROID_ICONS['person.crop.circle.fill'] ? (
          <Icon name={ANDROID_ICONS['person.crop.circle.fill']} size={56} color={accent} />
        ) : undefined
      }
      supportingText={subtitle}>
      <Text textStyle={{ fontSize: 22, fontWeight: '600' }}>{name}</Text>
    </ListItem>
  );
}

/** Row with a selection mark. */
export function SelectRow({ title, subtitle, selected, onPress, nested }: SelectRowProps) {
  const accent = useAccent();
  return (
    <ListItem
      onPress={onPress}
      supportingText={subtitle}
      trailing={<Text textStyle={{ color: accent, fontWeight: '700' }}>{selected === 'mixed' ? '－' : selected ? '✓' : ''}</Text>}>
      <Text>{nested ? `　${title}` : title}</Text>
    </ListItem>
  );
}

/** Key figures side by side. */
export function StatsRow({ stats }: StatsRowProps) {
  const color = useToneColor();
  return (
    <Row style={{ paddingVertical: 16 }}>
      {stats.map((s) => (
        <Column key={s.label} spacing={2} alignment="center" style={{ width: `${100 / stats.length}%` }}>
          <Text textStyle={{ fontSize: 22, fontWeight: '700', color: color(s.tone) }}>{s.value}</Text>
          <Text textStyle={{ fontSize: 13, color: color('secondary') }}>{s.label}</Text>
        </Column>
      ))}
    </Row>
  );
}

/** A class in a day's list. */
export function ClassRow({ course, detail, color: courseColor, status, live, dimmed, onPress }: ClassRowProps) {
  const color = useToneColor();
  return (
    <ListItem
      onPress={onPress}
      leading={<Column style={{ width: 4, height: 40, borderRadius: 2, backgroundColor: courseColor, opacity: dimmed ? 0.4 : 1 }} />}
      supportingText={detail}
      trailing={
        status ? (
          <Text textStyle={{ color: live ? courseColor : color('secondary'), fontWeight: live ? '600' : '400' }}>{status}</Text>
        ) : undefined
      }>
      <Text textStyle={{ fontWeight: '600', color: dimmed ? color('secondary') : undefined }}>{course}</Text>
    </ListItem>
  );
}

/** Charts are iOS-only (Swift Charts); other platforms skip them. */
export function ChartRow(_props: ChartRowProps) {
  return null;
}
