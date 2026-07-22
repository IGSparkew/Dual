import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { HelpCircle, type LucideProps } from 'lucide-react';

interface PanelIconProps extends LucideProps {
  name: string;
}

// Icon names follow lucide-react's kebab-case registry (e.g. "grid-3x3") and
// are code-split per icon via lucide-react's DynamicIcon — no static map to
// maintain when a module declares a new icon in its manifest.
export function PanelIcon({ name, size = 13, ...props }: PanelIconProps) {
  return (
    <DynamicIcon
      name={name as IconName}
      size={size}
      fallback={() => <HelpCircle size={size} {...props} />}
      {...props}
    />
  );
}
