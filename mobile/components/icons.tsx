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

export function SearchIcon({ color, size = 20 }: IconProps) {
  return (
    <Svg {...base(size)} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" stroke={color} {...stroke} />
      <Path d="m21 21-4.3-4.3" stroke={color} {...stroke} />
    </Svg>
  );
}

export function CloseIcon({ color, size = 18 }: IconProps) {
  return (
    <Svg {...base(size)} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d="M18 6 6 18M6 6l12 12" stroke={color} {...stroke} />
    </Svg>
  );
}

export function MenuIcon({ color, size = 22 }: IconProps) {
  return (
    <Svg {...base(size)} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d="M4 7h16M4 12h16M4 17h10" stroke={color} {...stroke} />
    </Svg>
  );
}

export function ChevronLeftIcon({ color, size = 22 }: IconProps) {
  return (
    <Svg {...base(size)} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d="m15 6-6 6 6 6" stroke={color} {...stroke} />
    </Svg>
  );
}

export function UserIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg {...base(size)} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d="M20 21a8 8 0 1 0-16 0" stroke={color} {...stroke} />
      <Path d="M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke={color} {...stroke} />
    </Svg>
  );
}

export function ShieldIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg {...base(size)} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d="M12 3 4 6v5c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V6l-8-3Z" stroke={color} {...stroke} />
      <Path d="m9 12 2 2 4-4" stroke={color} {...stroke} />
    </Svg>
  );
}
