import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { PANEL_ANIMATION_CLASSES, TRANSLUCENT_PANEL_CLASSES } from "@/lib/animation-classes";
import {
  LOCAL_FONT_PICKER_LIST_MAX_ROWS,
  LOCAL_FONT_PICKER_LIST_ROW_HEIGHT_PX,
  LOCAL_FONT_PICKER_SIDE_OFFSET_PX,
  TERMINAL_LOCAL_FONT_FAMILY_MAX_LENGTH,
} from "@/lib/constants";
import { buildFamily } from "@/lib/terminal-fonts";
import { cn } from "@/lib/utils";
import { isLocalFontsApiSupported, queryLocalFontFamilies } from "@/utils/query-local-fonts";

interface LocalFontPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedFamily: string;
  onSelect: (family: string) => void;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "loaded"; families: string[] }
  | { kind: "denied" }
  | { kind: "unsupported" };

const ANCHOR_HIDDEN_CLASSES = "pointer-events-none absolute right-0 top-1/2 h-0 w-0 opacity-0";

let cachedLocalFontFamilies: string[] | null = null;

export const resetLocalFontCacheForTests = (): void => {
  cachedLocalFontFamilies = null;
};

export const LocalFontPicker = ({
  open,
  onOpenChange,
  selectedFamily,
  onSelect,
}: LocalFontPickerProps) => {
  const [loadState, setLoadState] = useState<LoadState>(() =>
    cachedLocalFontFamilies
      ? { kind: "loaded", families: cachedLocalFontFamilies }
      : { kind: "loading" },
  );
  const [filterText, setFilterText] = useState("");

  useEffect(() => {
    if (!isLocalFontsApiSupported()) {
      setLoadState({ kind: "unsupported" });
      return;
    }
    if (cachedLocalFontFamilies) return;
    let cancelled = false;
    queryLocalFontFamilies()
      .then((families) => {
        cachedLocalFontFamilies = families;
        if (cancelled) return;
        setLoadState({ kind: "loaded", families });
      })
      .catch(() => {
        if (cancelled) return;
        setLoadState({ kind: "denied" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredFamilies = useMemo(() => {
    if (loadState.kind !== "loaded") return [];
    const needle = filterText.trim().toLowerCase();
    if (!needle) return loadState.families;
    return loadState.families.filter((family) => family.toLowerCase().includes(needle));
  }, [loadState, filterText]);

  const handleManualFamilyChange = (event: ChangeEvent<HTMLInputElement>) => {
    onSelect(event.target.value);
  };

  const handleSelectFamily = (family: string) => {
    onSelect(family);
    onOpenChange(false);
    setFilterText("");
  };

  if (loadState.kind === "unsupported" || loadState.kind === "denied") {
    if (!open) return null;
    return (
      <Input
        aria-label="local font family"
        placeholder="e.g. JetBrainsMono Nerd Font"
        value={selectedFamily}
        maxLength={TERMINAL_LOCAL_FONT_FAMILY_MAX_LENGTH}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        onChange={handleManualFamilyChange}
        className="h-7 px-2 text-xs"
      />
    );
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        nativeButton={false}
        render={<span aria-hidden="true" tabIndex={-1} className={ANCHOR_HIDDEN_CLASSES} />}
      />
      <PopoverContent
        side="right"
        align="start"
        sideOffset={LOCAL_FONT_PICKER_SIDE_OFFSET_PX}
        className={cn(
          "flex w-64 flex-col gap-2 p-2",
          TRANSLUCENT_PANEL_CLASSES,
          PANEL_ANIMATION_CLASSES,
        )}
      >
        <Input
          aria-label="search local fonts"
          placeholder="Search installed fonts"
          value={filterText}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          onChange={(event) => setFilterText(event.target.value)}
          className="h-7 px-2 text-xs"
        />
        <div
          role="listbox"
          aria-label="installed font families"
          className="overflow-y-auto rounded-md border border-border/40 bg-background/40 [&::-webkit-scrollbar]:hidden"
          style={{
            maxHeight: LOCAL_FONT_PICKER_LIST_ROW_HEIGHT_PX * LOCAL_FONT_PICKER_LIST_MAX_ROWS,
          }}
        >
          {loadState.kind === "loading" ? (
            <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
              <Spinner aria-hidden="true" role="presentation" aria-label={undefined} />
              Loading installed fonts…
            </div>
          ) : filteredFamilies.length === 0 ? (
            <div className="px-2 py-2 text-xs text-muted-foreground">No matching fonts.</div>
          ) : (
            filteredFamilies.map((family) => {
              const isSelected = family === selectedFamily;
              return (
                <button
                  key={family}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelectFamily(family)}
                  style={{ fontFamily: buildFamily(family) }}
                  className={cn(
                    "flex w-full items-center px-2 text-left text-xs leading-none hover:bg-foreground/10 focus:bg-foreground/10 focus:outline-none aria-selected:bg-foreground/15 aria-selected:text-foreground",
                  )}
                >
                  <span
                    className="truncate"
                    style={{
                      minHeight: LOCAL_FONT_PICKER_LIST_ROW_HEIGHT_PX,
                      lineHeight: `${LOCAL_FONT_PICKER_LIST_ROW_HEIGHT_PX}px`,
                    }}
                  >
                    {family}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
