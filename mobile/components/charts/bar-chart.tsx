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
}

export function BarChart({ data, height = 160 }: BarChartProps) {
  const theme = useTheme();
  const width = 320;
  const paddingBottom = 28;
  const paddingTop = 16;
  const chartHeight = height - paddingBottom - paddingTop;
  const maxValue = Math.max(1, ...data.map((d) => d.value));
  const barGap = 12;
  const barWidth = (width - barGap * (data.length - 1)) / data.length;

  return (
    <View>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
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
                fill={theme.textSecondary}
                textAnchor="middle">
                {d.label}
              </SvgText>
              {d.value > 0 ? (
                <SvgText
                  x={x + barWidth / 2}
                  y={y - 6}
                  fontSize="11"
                  fontWeight="700"
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
