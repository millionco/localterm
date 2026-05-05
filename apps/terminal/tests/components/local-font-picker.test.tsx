import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  LocalFontPicker,
  resetLocalFontCacheForTests,
} from "../../src/components/local-font-picker";

interface FakeFontDataEntry {
  family: string;
  fullName: string;
  postscriptName: string;
  style: string;
}

const installQueryLocalFonts = (entries: FakeFontDataEntry[]) => {
  const queryLocalFonts = vi.fn(() => Promise.resolve(entries));
  vi.stubGlobal("queryLocalFonts", queryLocalFonts);
  return queryLocalFonts;
};

const installFailingQueryLocalFonts = () => {
  const queryLocalFonts = vi.fn(() => Promise.reject(new Error("permission denied")));
  vi.stubGlobal("queryLocalFonts", queryLocalFonts);
  return queryLocalFonts;
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetLocalFontCacheForTests();
});

describe("LocalFontPicker", () => {
  it("renders nothing visible when closed and the API is supported", () => {
    installQueryLocalFonts([
      { family: "Operator Mono", fullName: "", postscriptName: "", style: "" },
    ]);
    render(
      <LocalFontPicker
        open={false}
        onOpenChange={() => {}}
        selectedFamily=""
        onSelect={() => {}}
      />,
    );
    expect(screen.queryByLabelText("search local fonts")).toBeNull();
    expect(screen.queryByLabelText("installed font families")).toBeNull();
  });

  it("renders the manual-entry fallback when queryLocalFonts is unavailable", () => {
    render(
      <LocalFontPicker open={true} onOpenChange={() => {}} selectedFamily="" onSelect={() => {}} />,
    );
    expect(screen.getByLabelText("local font family")).toBeDefined();
  });

  it("loads installed font families and renders them as options when open", async () => {
    installQueryLocalFonts([
      { family: "Operator Mono", fullName: "", postscriptName: "", style: "" },
      { family: "JetBrainsMono Nerd Font", fullName: "", postscriptName: "", style: "" },
      { family: "Operator Mono", fullName: "", postscriptName: "", style: "Bold" },
    ]);
    render(
      <LocalFontPicker open={true} onOpenChange={() => {}} selectedFamily="" onSelect={() => {}} />,
    );

    await waitFor(() => {
      expect(screen.getByText("Operator Mono")).toBeDefined();
    });
    expect(screen.getByText("JetBrainsMono Nerd Font")).toBeDefined();
    expect(screen.getAllByText("Operator Mono").length).toBe(1);
  });

  it("filters families as the user types in the search input", async () => {
    installQueryLocalFonts([
      { family: "Operator Mono", fullName: "", postscriptName: "", style: "" },
      { family: "JetBrainsMono Nerd Font", fullName: "", postscriptName: "", style: "" },
      { family: "Comic Code", fullName: "", postscriptName: "", style: "" },
    ]);
    render(
      <LocalFontPicker open={true} onOpenChange={() => {}} selectedFamily="" onSelect={() => {}} />,
    );

    await waitFor(() => {
      expect(screen.getByText("Operator Mono")).toBeDefined();
    });
    const searchInput = screen.getByLabelText("search local fonts");
    fireEvent.change(searchInput, { target: { value: "nerd" } });

    expect(screen.queryByText("Operator Mono")).toBeNull();
    expect(screen.queryByText("Comic Code")).toBeNull();
    expect(screen.getByText("JetBrainsMono Nerd Font")).toBeDefined();
  });

  it("invokes onSelect and onOpenChange(false) after picking a family", async () => {
    installQueryLocalFonts([{ family: "Comic Code", fullName: "", postscriptName: "", style: "" }]);
    const onSelect = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <LocalFontPicker
        open={true}
        onOpenChange={onOpenChange}
        selectedFamily=""
        onSelect={onSelect}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Comic Code")).toBeDefined();
    });
    fireEvent.click(screen.getByText("Comic Code"));
    expect(onSelect).toHaveBeenCalledWith("Comic Code");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("falls back to the manual entry when queryLocalFonts rejects", async () => {
    installFailingQueryLocalFonts();
    render(
      <LocalFontPicker open={true} onOpenChange={() => {}} selectedFamily="" onSelect={() => {}} />,
    );
    await waitFor(() => {
      expect(screen.getByLabelText("local font family")).toBeDefined();
    });
  });
});
