import { Clip } from "@core/types/clip";

export interface ClipCellProps {
    clip: Clip;
    isSelected: boolean;
    onSelect: () => void;
    onRename: (name: string) => void;
}