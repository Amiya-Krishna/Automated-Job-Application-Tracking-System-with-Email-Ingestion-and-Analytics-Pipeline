import { Platform, StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';

import { FontFamily, Fonts, ThemeColor, Typography, fontFamilyForWeight } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?:
    | 'default'
    | 'title'
    | 'display'
    | 'headline'
    | 'small'
    | 'smallBold'
    | 'caption'
    | 'overline'
    | 'subtitle'
    | 'link'
    | 'linkPrimary'
    | 'code';
  themeColor?: ThemeColor;
};

/**
 * The single text primitive. Applies the Inter type scale (constants/theme.ts),
 * then picks the Inter file that matches the FINAL fontWeight — including one a
 * screen overrides in its own style — so weights render correctly on Android
 * and iOS. `maxFontSizeMultiplier` keeps layouts intact at the largest system
 * text sizes while still honouring the user's setting (accessibility).
 */
export function ThemedText({ style, type = 'default', themeColor, maxFontSizeMultiplier = 1.4, ...rest }: ThemedTextProps) {
  const theme = useTheme();

const merged = StyleSheet.flatten([
  { color: theme[themeColor ?? 'text'] },
  type === 'default' && styles.default,
  type === 'title' && styles.title,
  type === 'display' && styles.display,
  type === 'headline' && styles.headline,
  type === 'small' && styles.small,
  type === 'smallBold' && styles.smallBold,
  type === 'caption' && styles.caption,
  type === 'overline' && styles.overline,
  type === 'subtitle' && styles.subtitle,
  type === 'link' && styles.link,
  type === 'linkPrimary' && styles.linkPrimary,
  type === 'code' && styles.code,
  style,
]) as TextStyle;

  // Custom fonts are per-weight: choose the family from the resolved weight and
  // drop fontWeight so Android does not synthesise bold on top of it.
  const resolved =
    type === 'code' || merged.fontFamily
      ? merged
      : { ...merged, fontFamily: fontFamilyForWeight(merged.fontWeight), fontWeight: undefined };

  return <Text maxFontSizeMultiplier={maxFontSizeMultiplier} style={resolved} {...rest} />;
}

const styles = StyleSheet.create({
  default: Typography.body,
  title: Typography.title,
  display: Typography.display,
  headline: Typography.headline,
  small: Typography.small,
  smallBold: Typography.smallBold,
  caption: Typography.caption,
  overline: { ...Typography.overline, textTransform: 'uppercase' },
  subtitle: Typography.subtitle,
  link: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  linkPrimary: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: '#2563eb' },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: '700' }) ?? '500',
    fontSize: 12,
  },
});

export { FontFamily };
