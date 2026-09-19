/**
 * Status-distribution donut. Pure SVG path math (no extra charting
 * dependency) — see bar-chart.tsx's comment for why.
 */
import { View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  segments: DonutSegment[];
  size?: number;
  strokeWidth?: number;
}

export function DonutChart({ segments, size = 140, strokeWidth = 18 }: DonutChartProps) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  let cumulative = 0;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.four }}>
      <Svg width={size} height={size}>
        <G rotation={-90} origin={`${center}, ${center}`}>
          {total === 0 ? (
            <Circle
              cx={center}
              cy={center}
              r={radius}
              stroke="#E0E1E6"
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

      <View style={{ gap: Spacing.two }}>
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
