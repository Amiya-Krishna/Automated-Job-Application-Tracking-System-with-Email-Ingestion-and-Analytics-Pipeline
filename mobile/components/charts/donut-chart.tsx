/**
 * Status-distribution donut. Pure SVG path math (no extra charting
 * dependency) — see bar-chart.tsx's comment for why.
 */
import { View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  segments: DonutSegment[];
  size?: number;
  strokeWidth?: number;
  /** Spoken name of the chart, e.g. "Applications by status". */
  title?: string;
}

/** Screen-reader text for the ring (the legend below it is already real text). */
export function describeDonut(segments: DonutSegment[], title = 'Chart'): string {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) return `${title}: no data yet.`;
  return `${title}. Total ${total}. ${segments
    .filter((s) => s.value > 0)
    .map((s) => `${s.label} ${s.value}, ${Math.round((s.value / total) * 100)} percent`)
    .join('; ')}.`;
}

export function DonutChart({ segments, size = 140, strokeWidth = 18, title }: DonutChartProps) {
  const theme = useTheme();
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  let cumulative = 0;

  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.four, flexWrap: 'wrap' }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={describeDonut(segments, title)}>
      <Svg width={size} height={size} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <G rotation={-90} origin={`${center}, ${center}`}>
          {total === 0 ? (
            <Circle
              cx={center}
              cy={center}
              r={radius}
              stroke={theme.border}
              strokeWidth={strokeWidth}
              fill="none"
            />
          ) : (
            segments
              .filter((s) => s.value > 0)
              .map((segment) => {
                const fraction = segment.value / total;
                const dashLength = fraction * circumference;
                const offset = -cumulative * circumference;
                cumulative += fraction;
                return (
                  <Circle
                    key={segment.label}
                    cx={center}
                    cy={center}
                    r={radius}
                    stroke={segment.color}
                    strokeWidth={strokeWidth}
                    strokeDasharray={`${dashLength} ${circumference - dashLength}`}
                    strokeDashoffset={offset}
                    strokeLinecap="butt"
                    fill="none"
                  />
                );
              })
          )}
        </G>
      </Svg>

      <View style={{ gap: Spacing.two }} importantForAccessibility="no-hide-descendants">
        {segments.map((segment) => (
          <View key={segment.label} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
            <View
              style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: segment.color }}
            />
            <ThemedText type="small" themeColor="textSecondary">
              {segment.label} · {segment.value}
            </ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
}
