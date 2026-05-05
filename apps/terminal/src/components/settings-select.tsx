import type { CSSProperties, ReactNode } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PANEL_ANIMATION_CLASSES, TRANSLUCENT_PANEL_CLASSES } from "@/lib/animation-classes";
import { cn } from "@/lib/utils";

export interface SettingsSelectItem {
  id: string;
  label: ReactNode;
  itemStyle?: CSSProperties;
  onSelect?: () => void;
}

interface SettingsSelectProps {
  value: string;
  items: readonly SettingsSelectItem[];
  ariaLabel: string;
  placeholder: string;
  onValueChange: (next: string | null) => void;
  onOpenChange?: (open: boolean) => void;
  onItemHover?: (id: string) => void;
  triggerClassName?: string;
  triggerStyle?: CSSProperties;
}

const TRIGGER_BASE_CLASSES =
  "h-7 justify-between gap-1.5 rounded-md border-border/60 bg-transparent px-2 text-xs font-normal text-foreground shadow-none focus-visible:border-ring/40 focus-visible:ring-1 focus-visible:ring-ring/40 dark:bg-transparent";

const CONTENT_CLASSES =
  "max-h-72 w-(--anchor-width) origin-(--transform-origin) gap-0 overflow-y-auto p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

// `*:first:*` overrides shadcn `SelectItem`'s child `ItemText` (vendored, can't
// edit), which ships with `shrink-0 whitespace-nowrap` — that lets long labels
// (e.g. local font names) overflow the row. min-w-0 + shrink make truncate work.
const ITEM_CLASSES =
  "rounded-sm py-1.5 pr-9 pl-2 text-xs hover:bg-foreground/10 hover:text-foreground focus:bg-foreground/10 focus:text-foreground *:first:min-w-0 *:first:shrink *:first:overflow-hidden";

export const SettingsSelect = ({
  value,
  items,
  ariaLabel,
  placeholder,
  onValueChange,
  onOpenChange,
  onItemHover,
  triggerClassName,
  triggerStyle,
}: SettingsSelectProps) => {
  // Without our own label rendering, Base UI's <SelectValue> falls back to the raw
  // value (e.g. "vesper") instead of the human-readable label ("Vesper").
  const activeItem = items.find((item) => item.id === value);
  // Auto-merge the active item's itemStyle into the trigger so per-item visuals
  // (e.g. font-family on the Font picker) appear on the trigger too. Caller's
  // explicit `triggerStyle` still wins.
  const mergedTriggerStyle = activeItem?.itemStyle
    ? { ...activeItem.itemStyle, ...triggerStyle }
    : triggerStyle;
  return (
    <Select value={value} onValueChange={onValueChange} onOpenChange={onOpenChange}>
      <SelectTrigger
        size="sm"
        aria-label={ariaLabel}
        className={cn(TRIGGER_BASE_CLASSES, "w-full", triggerClassName)}
        style={mergedTriggerStyle}
      >
        <SelectValue placeholder={placeholder}>
          {/* Function form is the documented Base UI contract; static-node form
              works today but isn't guaranteed across versions. */}
          {() => activeItem?.label || placeholder}
        </SelectValue>
      </SelectTrigger>
      <SelectContent
        alignItemWithTrigger={false}
        sideOffset={4}
        className={cn(CONTENT_CLASSES, TRANSLUCENT_PANEL_CLASSES, PANEL_ANIMATION_CLASSES)}
      >
        {items.map((item) => (
          <SelectItem
            key={item.id}
            value={item.id}
            className={ITEM_CLASSES}
            style={item.itemStyle}
            onPointerEnter={onItemHover ? () => onItemHover(item.id) : undefined}
            onFocus={onItemHover ? () => onItemHover(item.id) : undefined}
            onClick={item.onSelect}
          >
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
