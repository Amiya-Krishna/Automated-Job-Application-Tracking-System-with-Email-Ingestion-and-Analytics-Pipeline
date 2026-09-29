/** Small inline SVG icons (react-native-svg is already a dependency) — replaces emoji glyphs in the UI. */
import Svg, { Path } from 'react-native-svg';

interface IconProps {
  color: string;
  size?: number;
}

const base = (size: number) => ({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none' as const });
const stroke = { strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export function BellIcon({ color, size = 22 }: IconProps) {
  return (
    <Svg {...base(size)} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" stroke={color} {...stroke} />
      <Path d="M13.7 21a2 2 0 0 1-3.4 0" stroke={color} {...stroke} />
    </Svg>
  );
}

export function ChevronRightIcon({ color, size = 18 }: IconProps) {
  return (
    <Svg {...base(size)} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d="m9 6 6 6-6 6" stroke={color} {...stroke} />
    </Svg>
  );
}

export function PlusIcon({ color, size = 18 }: IconProps) {
  return (
    <Svg {...base(size)} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d="M12 5v14M5 12h14" stroke={color} {...stroke} />
    </Svg>
  );
}
