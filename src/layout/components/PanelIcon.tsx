import {
  Code2, Music, LayoutGrid, SlidersHorizontal, Grid3x3,
  Sliders, Clock, ListMusic, HelpCircle, type LucideProps,
} from 'lucide-react';

const ICON_MAP: Record<string, React.ComponentType<LucideProps>> = {
  Code2,
  Music,
  LayoutGrid,
  SlidersHorizontal,
  Sliders,
  Clock,
  ListMusic,
  Grid3x3,
};

interface PanelIconProps extends LucideProps {
  name: string;
}

export function PanelIcon({ name, size = 13, ...props }: PanelIconProps) {
  const Icon = ICON_MAP[name] ?? HelpCircle;
  return <Icon size={size} {...props} />;
}
