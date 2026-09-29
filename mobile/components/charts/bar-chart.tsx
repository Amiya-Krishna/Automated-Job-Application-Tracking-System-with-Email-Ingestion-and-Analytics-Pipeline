/**
 * Minimal weekly bar chart, built on react-native-svg rather than a full
 * charting library — the app only needs two chart types total (this and
 * DonutChart), so a small hand-rolled SVG keeps the dependency footprint
 * down instead of pulling in a large library for two shapes.
 */
import { Fragment } from 'react';
import { View } from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';

export interface BarChartDatum {
  label: string;
  value: number;
}

interface BarChartProps {
  data: BarChartDatum[];
  height?: number;
  /** Spoken name of the chart, e.g. "Applications per day, last 7 days". */
  title?: string;
}

/** Screen-reader text: the chart is drawn as SVG (invisible to assistive tech), so the same data is spoken instead. */
export function describeBars(data: BarChartDatum[], title = 'Bar chart'): string {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) return `${title}: no data yet.`;
  return `${title}. Total ${total}. ${data.map((d) => `${d.label} ${d.value}`).join(', ')}.`;
}

export function BarChart({ data, height = 160, title }: BarChartProps) {
  const theme = useTheme();
  const width = 320;
  const paddingBottom = 28;
  const paddingTop = 16;
  const chartHeight = height - paddingBottom - paddingTop;
  const maxValue = Math.max(1, ...data.map((d) => d.value));
  const barGap = 12;
  const barWidth = (width - barGap * (data.length - 1)) / data.length;

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={describeBars(data, title)}>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {data.map((d, index) => {
          const barHeight = maxValue > 0 ? (d.value / maxValue) * chartHeight : 0;
          const x = index * (barWidth + barGap);
          const y = paddingTop + (chartHeight - barHeight);

          return (
            <Fragment key={d.label}>
              <Rect
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(barHeight, 2)}
                rx={6}
                fill={theme.tint}
              />
              <SvgText
                x={x + barWidth / 2}
                y={height - 8}
                fontSize="11"
                fontFamily="Inter_500Medium"
                fill={theme.textSecondary}
                textAnchor="middle">
                {d.label}
              </SvgText>
              {d.value > 0 ? (
                <SvgText
                  x={x + barWidth / 2}
                  y={y - 6}
                  fontSize="11"
                  fontFamily="Inter_700Bold"
                  fill={theme.text}
                  textAnchor="middle">
                  {d.value}
                </SvgText>
              ) : null}
            </Fragment>
          );
        })}
      </Svg>
    </View>
  );
}
