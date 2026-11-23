import type { ObservableState } from '@expo/ui';
import type { ReactNode } from 'react';
import type { SFSymbol } from 'sf-symbols-typescript';

/**
 * Shared props for the platform-native building blocks in `native.ios.tsx` (SwiftUI) and
 * `native.tsx` (Jetpack Compose via `@expo/ui`'s universal components).
 *
 * Every screen is a grouped form: a `Screen` holding `Section`s of rows, like the iOS Settings
 * app or an Android Material settings page.
 */

export type Tone = 'default' | 'secondary' | 'destructive' | 'success';

export type ScreenProps = {
  children: ReactNode;
  /** Pull-to-refresh. */
  onRefresh?: () => Promise<unknown>;
};

export type SectionProps = {
  title?: string;
  footer?: string;
  children: ReactNode;
};

export type ValueRowProps = {
  label: string;
  /** Small secondary line under the label. */
  subtitle?: string;
  value?: string | number | null;
  icon?: SFSymbol;
  tone?: Tone;
};

export type NavRowProps = {
  title: string;
  subtitle?: string;
  /** Short text shown before the chevron, e.g. a status. */
  detail?: string;
  icon?: SFSymbol;
  onPress: () => void;
  disabled?: boolean;
  /** Use for rows that open something outside the app (browser, share sheet). */
  external?: boolean;
};

export type ActionRowProps = {
  title: string;
  icon?: SFSymbol;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
  loading?: boolean;
};

export type TextFieldRowProps = {
  state: ObservableState<string>;
  onChangeText: (text: string) => void;
  placeholder: string;
  /** Leading label (iOS shows it as the row's title). */
  label?: string;
  secure?: boolean;
  keyboard?: 'default' | 'number-pad' | 'email-address' | 'phone-pad' | 'url';
  contentType?: 'username' | 'password' | 'newPassword' | 'oneTimeCode' | 'emailAddress' | 'telephoneNumber' | 'URL';
  autoCapitalize?: boolean;
  multiline?: boolean;
  maxLength?: number;
  submitLabel?: 'go' | 'next' | 'done';
  onSubmit?: () => void;
};

export type PickerRowProps<T extends string> = {
  label: string;
  icon?: SFSymbol;
  selection: T;
  options: readonly { label: string; value: T }[];
  onChange: (value: T) => void;
};

/** A question answered on a short scale: the text, then the choices side by side. */
export type ScaleRowProps<T extends string> = {
  title: string;
  /** `''` while unanswered. */
  selection: T | '';
  options: readonly { label: string; value: T }[];
  onChange: (value: T) => void;
  /** Choices too long to sit side by side: pick from a menu instead. */
  menu?: boolean;
};

export type ToggleRowProps = {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
};

export type TextRowProps = {
  /** Bold first line. */
  title?: string;
  /** Small secondary line under the title. */
  meta?: string;
  body?: string;
  tone?: Tone;
};

export type StatusProps = {
  title: string;
  message?: string;
  icon?: SFSymbol;
  actionTitle?: string;
  onAction?: () => void;
};

export type HeroRowProps = {
  /** SF Symbol shown in the app-icon-style badge (Android shows only the text). */
  icon: SFSymbol;
  title: string;
  subtitle?: string;
};

export type PrimaryButtonRowProps = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
};

export type ProfileRowProps = {
  name: string;
  /** e.g. `臺北城市科技大學 · 51234567` */
  subtitle?: string;
  /** Local file URI of the student's photo. */
  photo?: string | null;
};

export type SelectRowProps = {
  title: string;
  subtitle?: string;
  /** `mixed`: some of the row's items are selected (e.g. part of a class). */
  selected: boolean | 'mixed';
  onPress: () => void;
  /** Indented child row (e.g. one period under its class). */
  nested?: boolean;
};

export type StatsRowProps = {
  /** Two to four figures shown side by side, e.g. 學期平均 / 實得學分. */
  stats: { label: string; value: string; tone?: Tone }[];
};

export type ClassRowProps = {
  course: string;
  /** e.g. 09:20–12:10 · 成306 */
  detail: string;
  /** Course colour (stripe and status text). */
  color: string;
  /** Right-hand status, e.g. 上課中 / 35 分鐘後. */
  status?: string;
  /** Emphasise the status in the course colour (class in progress). */
  live?: boolean;
  /** Fade a class that has already ended. */
  dimmed?: boolean;
  onPress: () => void;
};

export type ChartRowProps = {
  type: 'line' | 'bar' | 'pie';
  data: { x: string; y: number; color?: string }[];
  /** Chart height in points. */
  height?: number;
  /** Horizontal rule(s), e.g. the passing score. */
  referenceLines?: { x: string; y: number }[];
  /** Line colour (line charts). */
  color?: string;
  /** Show the category legend (pie charts without per-point colours). */
  legend?: boolean;
};
