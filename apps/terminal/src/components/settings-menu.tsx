import { ChevronDown, Settings } from "lucide-react";
import { useMemo, useState, type CSSProperties } from "react";
import { LocalFontPicker } from "@/components/local-font-picker";
import { NumberStepper } from "@/components/number-stepper";
import { SettingsSelect, type SettingsSelectItem } from "@/components/settings-select";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PANEL_ANIMATION_CLASSES, TRANSLUCENT_PANEL_CLASSES } from "@/lib/animation-classes";
import {
  TERMINAL_FONT_SIZE_MAX_PX,
  TERMINAL_FONT_SIZE_MIN_PX,
  TERMINAL_FONT_SIZE_STEP_PX,
  TERMINAL_LINE_HEIGHT_MAX,
  TERMINAL_LINE_HEIGHT_MIN,
  TERMINAL_LINE_HEIGHT_STEP,
  TOOLTIP_SIDE_OFFSET_PX,
} from "@/lib/constants";
import {
  TERMINAL_CURSOR_STYLES,
  isTerminalCursorStyle,
  type TerminalCursorStyle,
} from "@/lib/terminal-cursor";
import { LOCAL_FONT_ID, TERMINAL_FONTS, buildLocalFont } from "@/lib/terminal-fonts";
import { TERMINAL_SCROLLBACK_PRESETS, isTerminalScrollbackValue } from "@/lib/terminal-scrollback";
import { TERMINAL_THEMES } from "@/lib/terminal-themes";
import type { TerminalSessionInfo } from "@/lib/terminal-session-info";
import { cn } from "@/lib/utils";

interface SettingsMenuProps {
  themeId: string;
  onThemeChange: (themeId: string) => void;
  onThemePreview?: (themeId: string | null) => void;
  fontId: string;
  onFontChange: (fontId: string) => void;
  onFontPreview?: (fontId: string | null) => void;
  localFontFamily: string;
  onLocalFontFamilyChange: (family: string) => void;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  lineHeight: number;
  onLineHeightChange: (lineHeight: number) => void;
  cursorStyle: TerminalCursorStyle;
  onCursorStyleChange: (style: TerminalCursorStyle) => void;
  onCursorStylePreview?: (style: TerminalCursorStyle | null) => void;
  cursorBlink: boolean;
  onCursorBlinkChange: (blink: boolean) => void;
  scrollback: number;
  onScrollbackChange: (scrollback: number) => void;
  scrollOnUserInput: boolean;
  onScrollOnUserInputChange: (scrollOnUserInput: boolean) => void;
  sessionInfo?: TerminalSessionInfo | null;
}

const SECTION_LABEL_CLASSES =
  "text-[10px] font-medium tracking-wide text-muted-foreground/70 uppercase";

const ROW_LABEL_CLASSES = "text-xs font-normal text-muted-foreground";

const FONT_ITEM_STYLE_BY_ID: Record<string, CSSProperties> = Object.fromEntries(
  TERMINAL_FONTS.map((font) => [font.id, { fontFamily: font.family }]),
);

const THEME_ITEMS: readonly SettingsSelectItem[] = TERMINAL_THEMES.map((theme) => ({
  id: theme.id,
  label: theme.name,
}));

const LOCAL_BADGE_CLASSES =
  "shrink-0 rounded-sm border border-border/50 px-1 py-0 text-[9px] font-medium tracking-wide text-muted-foreground/80 uppercase";

const buildLocalLabel = (rawFamily: string, isActive: boolean) => {
  const trimmed = rawFamily.trim();
  const displayName = trimmed && isActive ? trimmed : "Local Font";
  return (
    <span className="flex w-full min-w-0 items-center gap-2">
      <span className="min-w-0 flex-1 truncate">{displayName}</span>
      <span className={LOCAL_BADGE_CLASSES}>Local</span>
    </span>
  );
};

const buildFontItems = (
  localFontFamily: string,
  activeFontId: string,
  openLocalPicker: () => void,
): readonly SettingsSelectItem[] =>
  TERMINAL_FONTS.map((font) => {
    if (font.id !== LOCAL_FONT_ID) {
      return {
        id: font.id,
        label: font.name,
        itemStyle: FONT_ITEM_STYLE_BY_ID[font.id],
      };
    }
    const trimmedLocal = localFontFamily.trim();
    const isActive = activeFontId === LOCAL_FONT_ID;
    const itemStyle = trimmedLocal
      ? { fontFamily: buildLocalFont(trimmedLocal).family }
      : FONT_ITEM_STYLE_BY_ID[font.id];
    return {
      id: font.id,
      label: buildLocalLabel(localFontFamily, isActive),
      itemStyle,
      onSelect: openLocalPicker,
    };
  });

const CURSOR_STYLE_ITEMS: readonly SettingsSelectItem[] = TERMINAL_CURSOR_STYLES.map((option) => ({
  id: option.id,
  label: option.name,
}));

const SCROLLBACK_ITEMS: readonly SettingsSelectItem[] = TERMINAL_SCROLLBACK_PRESETS.map(
  (preset) => ({
    id: String(preset.value),
    label: preset.label,
  }),
);

const formatLineHeight = (value: number): string => value.toFixed(1);

interface SessionInfoRowProps {
  label: string;
  value: string;
  title?: string;
  valueClassName?: string;
}

const SessionInfoRow = ({ label, value, title, valueClassName }: SessionInfoRowProps) => (
  <div className="flex items-baseline justify-between gap-3">
    <dt className={ROW_LABEL_CLASSES}>{label}</dt>
    <dd
      title={title ?? value}
      className={cn("min-w-0 truncate text-right text-foreground/90", valueClassName)}
    >
      {value}
    </dd>
  </div>
);

export const SettingsMenu = ({
  themeId,
  onThemeChange,
  onThemePreview,
  fontId,
  onFontChange,
  onFontPreview,
  localFontFamily,
  onLocalFontFamilyChange,
  fontSize,
  onFontSizeChange,
  lineHeight,
  onLineHeightChange,
  cursorStyle,
  onCursorStyleChange,
  onCursorStylePreview,
  cursorBlink,
  onCursorBlinkChange,
  scrollback,
  onScrollbackChange,
  scrollOnUserInput,
  onScrollOnUserInputChange,
  sessionInfo,
}: SettingsMenuProps) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [isLocalPickerOpen, setIsLocalPickerOpen] = useState(false);
  const fontItems = useMemo(
    () => buildFontItems(localFontFamily, fontId, () => setIsLocalPickerOpen(true)),
    [localFontFamily, fontId],
  );

  const handlePopoverOpenChange = (open: boolean) => {
    setIsPopoverOpen(open);
    if (!open) {
      onThemePreview?.(null);
      onFontPreview?.(null);
      onCursorStylePreview?.(null);
    }
  };

  const handleThemeChange = (next: string | null) => {
    if (next) onThemeChange(next);
  };

  const handleFontChange = (next: string | null) => {
    if (next) onFontChange(next);
  };

  const handleCursorStyleChange = (next: string | null) => {
    if (isTerminalCursorStyle(next)) onCursorStyleChange(next);
  };

  const handleScrollbackChange = (next: string | null) => {
    if (next === null) return;
    const parsed = Number(next);
    if (isTerminalScrollbackValue(parsed)) onScrollbackChange(parsed);
  };

  const handleThemeSelectOpenChange = (open: boolean) => {
    if (!open) onThemePreview?.(null);
  };

  const handleFontSelectOpenChange = (open: boolean) => {
    if (!open) onFontPreview?.(null);
  };

  const handleCursorStyleSelectOpenChange = (open: boolean) => {
    if (!open) onCursorStylePreview?.(null);
  };

  const handleCursorStyleHover = (next: string) => {
    if (isTerminalCursorStyle(next)) onCursorStylePreview?.(next);
  };

  return (
    <Popover open={isPopoverOpen} onOpenChange={handlePopoverOpenChange}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="terminal settings"
                  className="hover:text-foreground"
                />
              }
            />
          }
        >
          <Settings />
        </TooltipTrigger>
        {/* Suppress the tooltip while the popover is open — both float over the same trigger and would visually fight. */}
        {isPopoverOpen ? null : (
          <TooltipContent side="bottom" sideOffset={TOOLTIP_SIDE_OFFSET_PX}>
            Settings
          </TooltipContent>
        )}
      </Tooltip>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={TOOLTIP_SIDE_OFFSET_PX}
        className={cn(
          "w-64 gap-0 overflow-hidden p-3",
          TRANSLUCENT_PANEL_CLASSES,
          PANEL_ANIMATION_CLASSES,
        )}
      >
        <FieldGroup className="gap-3">
          <Field orientation="vertical" className="gap-1.5">
            <FieldLabel className={SECTION_LABEL_CLASSES}>Theme</FieldLabel>
            <SettingsSelect
              value={themeId}
              items={THEME_ITEMS}
              ariaLabel="select theme"
              placeholder="Theme"
              onValueChange={handleThemeChange}
              onOpenChange={handleThemeSelectOpenChange}
              onItemHover={onThemePreview ? (id) => onThemePreview(id) : undefined}
            />
          </Field>

          <Separator className="bg-border/40" />

          <Field orientation="vertical" className="gap-1.5">
            <FieldLabel className={SECTION_LABEL_CLASSES}>Font</FieldLabel>
            <SettingsSelect
              value={fontId}
              items={fontItems}
              ariaLabel="select font"
              placeholder="Font"
              onValueChange={handleFontChange}
              onOpenChange={handleFontSelectOpenChange}
              onItemHover={onFontPreview ? (id) => onFontPreview(id) : undefined}
            />
            <div className="relative">
              <LocalFontPicker
                open={isLocalPickerOpen}
                onOpenChange={setIsLocalPickerOpen}
                selectedFamily={localFontFamily}
                onSelect={onLocalFontFamilyChange}
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className={ROW_LABEL_CLASSES}>Size</span>
              <NumberStepper
                value={fontSize}
                min={TERMINAL_FONT_SIZE_MIN_PX}
                max={TERMINAL_FONT_SIZE_MAX_PX}
                step={TERMINAL_FONT_SIZE_STEP_PX}
                ariaLabel="terminal font size"
                decrementAriaLabel="decrease font size"
                incrementAriaLabel="increase font size"
                onValueChange={onFontSizeChange}
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className={ROW_LABEL_CLASSES}>Line height</span>
              <NumberStepper
                value={lineHeight}
                min={TERMINAL_LINE_HEIGHT_MIN}
                max={TERMINAL_LINE_HEIGHT_MAX}
                step={TERMINAL_LINE_HEIGHT_STEP}
                ariaLabel="terminal line height"
                decrementAriaLabel="decrease line height"
                incrementAriaLabel="increase line height"
                formatDisplay={formatLineHeight}
                onValueChange={onLineHeightChange}
              />
            </div>
          </Field>

          <Separator className="bg-border/40" />

          <Field orientation="vertical" className="gap-1.5">
            <FieldLabel className={SECTION_LABEL_CLASSES}>Cursor</FieldLabel>
            <div className="flex items-center justify-between gap-2">
              <span className={ROW_LABEL_CLASSES}>Style</span>
              <SettingsSelect
                value={cursorStyle}
                items={CURSOR_STYLE_ITEMS}
                ariaLabel="select cursor style"
                placeholder="Cursor style"
                triggerClassName="w-fit min-w-[7rem]"
                onValueChange={handleCursorStyleChange}
                onOpenChange={handleCursorStyleSelectOpenChange}
                onItemHover={onCursorStylePreview ? handleCursorStyleHover : undefined}
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className={ROW_LABEL_CLASSES}>Blink</span>
              <Switch
                aria-label="toggle cursor blink"
                checked={cursorBlink}
                onCheckedChange={onCursorBlinkChange}
              />
            </div>
          </Field>

          <Separator className="bg-border/40" />

          <Field orientation="vertical" className="gap-1.5">
            <FieldLabel className={SECTION_LABEL_CLASSES}>Scrollback</FieldLabel>
            <SettingsSelect
              value={String(scrollback)}
              items={SCROLLBACK_ITEMS}
              ariaLabel="select scrollback"
              placeholder="Scrollback"
              onValueChange={handleScrollbackChange}
            />
            <div className="flex items-center justify-between gap-2">
              <Tooltip>
                <TooltipTrigger render={<span className={ROW_LABEL_CLASSES} />}>
                  Pin to bottom on input
                </TooltipTrigger>
                <TooltipContent
                  side="bottom"
                  sideOffset={TOOLTIP_SIDE_OFFSET_PX}
                  className="max-w-xs"
                >
                  When on, typing scrolls the viewport back to the bottom. When off, the viewport
                  stays where you scrolled — useful for reading history while typing.
                </TooltipContent>
              </Tooltip>
              <Switch
                aria-label="toggle pin to bottom on input"
                checked={scrollOnUserInput}
                onCheckedChange={onScrollOnUserInputChange}
              />
            </div>
          </Field>

          {sessionInfo ? (
            <>
              <Separator className="bg-border/40" />
              <Collapsible defaultOpen={false}>
                <CollapsibleTrigger
                  render={
                    <button
                      type="button"
                      className="group/shell flex w-full items-center justify-between gap-2 rounded-sm py-1 text-left transition-colors outline-none hover:text-foreground/90 focus-visible:text-foreground/90"
                    >
                      <span className={SECTION_LABEL_CLASSES}>Shell</span>
                      <ChevronDown className="size-3 text-muted-foreground/60 transition-transform duration-200 ease-snappy will-change-transform group-aria-expanded/shell:rotate-180" />
                    </button>
                  }
                />
                <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-200 ease-snappy data-closed:h-0">
                  <dl className="flex flex-col gap-1 pt-2 text-xs">
                    <SessionInfoRow label="Name" value={sessionInfo.shellName} />
                    <SessionInfoRow
                      label="Path"
                      value={sessionInfo.shell}
                      title={sessionInfo.shell}
                    />
                    <SessionInfoRow
                      label="PID"
                      value={String(sessionInfo.pid)}
                      valueClassName="tabular-nums"
                    />
                    <SessionInfoRow label="Cwd" value={sessionInfo.cwd} title={sessionInfo.cwd} />
                  </dl>
                </CollapsibleContent>
              </Collapsible>
            </>
          ) : null}
        </FieldGroup>
      </PopoverContent>
    </Popover>
  );
};
