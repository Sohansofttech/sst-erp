// ============================================================================
// SST-ERP THEME UTILITIES & ACCESSIBILITY (WCAG 2.1 AA) CONTRAST CALCULATOR
// ============================================================================

export interface InstitutionThemeConfig {
  sidebarBackground: string;      // 1. Sidebar background
  primaryButtonColor: string;     // 2. Primary / action button
  activeSidebarNav: string;       // 3. Active sidebar nav
  workspaceBackground: string;    // 4. Main workspace background
  cardBackground: string;         // 5. Card background
  primaryTextColor: string;       // 6. Primary text
  secondaryTextColor: string;     // 7. Secondary text
  chartPalette: string[];         // 8. Chart color palette (5 colors)
  accentColor: string;            // 9. Institution branding / accent
}

export const DEFAULT_INSTITUTION_THEME: InstitutionThemeConfig = {
  sidebarBackground: "#123B5A",
  primaryButtonColor: "#F5A000",
  activeSidebarNav: "#F5A000",
  workspaceBackground: "#EEF1F5",
  cardBackground: "#FFFFFF",
  primaryTextColor: "#1E293B",
  secondaryTextColor: "#64748B",
  chartPalette: ["#123B5A", "#F5A000", "#14B8A6", "#3B82F6", "#8B5CF6"],
  accentColor: "#F5A000",
};

export const PRESET_THEMES: Record<string, { name: string; description: string; theme: InstitutionThemeConfig }> = {
  default: {
    name: "Apex Standard (Navy & Amber)",
    description: "Official finalized SST-ERP institutional theme with Deep Navy sidebar and vibrant Amber actions.",
    theme: DEFAULT_INSTITUTION_THEME,
  },
  horizon: {
    name: "Horizon Campus (Royal Blue & Emerald)",
    description: "Modern collegiate style with rich Royal Blue sidebar and Emerald Green accents.",
    theme: {
      sidebarBackground: "#1E3A8A",
      primaryButtonColor: "#10B981",
      activeSidebarNav: "#10B981",
      workspaceBackground: "#F1F5F9",
      cardBackground: "#FFFFFF",
      primaryTextColor: "#0F172A",
      secondaryTextColor: "#475569",
      chartPalette: ["#1E3A8A", "#10B981", "#06B6D4", "#F59E0B", "#6366F1"],
      accentColor: "#10B981",
    },
  },
  crimson: {
    name: "Imperial Academy (Crimson & Gold)",
    description: "Traditional prestigious university theme with Deep Crimson sidebar and Gold action highlights.",
    theme: {
      sidebarBackground: "#581C87",
      primaryButtonColor: "#D97706",
      activeSidebarNav: "#D97706",
      workspaceBackground: "#F8FAFC",
      cardBackground: "#FFFFFF",
      primaryTextColor: "#1E1B4B",
      secondaryTextColor: "#64748B",
      chartPalette: ["#581C87", "#D97706", "#2563EB", "#059669", "#DC2626"],
      accentColor: "#D97706",
    },
  },
  slate: {
    name: "Tech Institute (Dark Slate & Cyan)",
    description: "Sleek STEM & polytechnic theme with Dark Slate sidebar and high-visibility Cyan buttons.",
    theme: {
      sidebarBackground: "#0F172A",
      primaryButtonColor: "#0284C7",
      activeSidebarNav: "#0284C7",
      workspaceBackground: "#F8FAFC",
      cardBackground: "#FFFFFF",
      primaryTextColor: "#0F172A",
      secondaryTextColor: "#64748B",
      chartPalette: ["#0F172A", "#0284C7", "#10B981", "#F59E0B", "#8B5CF6"],
      accentColor: "#0284C7",
    },
  },
};

/**
 * Validates a 3-character or 6-character hex color string.
 */
export function isValidHex(hex: string): boolean {
  if (!hex || typeof hex !== "string") return false;
  return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(hex.trim());
}

/**
 * Normalizes hex colors to 6-digit lowercase format with leading #
 */
export function normalizeHex(hex: string): string {
  if (!isValidHex(hex)) return "#000000";
  let clean = hex.trim().replace("#", "");
  if (clean.length === 3) {
    clean = clean.split("").map((c) => c + c).join("");
  }
  return `#${clean.toUpperCase()}`;
}

/**
 * Converts a hex string to sRGB components (0 - 255)
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  if (!isValidHex(hex)) return null;
  const clean = normalizeHex(hex).replace("#", "");
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16),
  };
}

/**
 * Calculates WCAG 2.1 relative luminance for an sRGB component
 */
function sRgbLuminanceChannel(c: number): number {
  const norm = c / 255;
  return norm <= 0.03928 ? norm / 12.92 : Math.pow((norm + 0.055) / 1.055, 2.4);
}

/**
 * Calculates relative luminance L for an sRGB color (0.0 to 1.0)
 */
export function getRelativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  return (
    0.2126 * sRgbLuminanceChannel(rgb.r) +
    0.7152 * sRgbLuminanceChannel(rgb.g) +
    0.0722 * sRgbLuminanceChannel(rgb.b)
  );
}

/**
 * Calculates the WCAG contrast ratio between two hex colors (1:1 to 21:1)
 */
export function getContrastRatio(hex1: string, hex2: string): number {
  const l1 = getRelativeLuminance(hex1);
  const l2 = getRelativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  const ratio = (lighter + 0.05) / (darker + 0.05);
  return Math.round(ratio * 100) / 100;
}

export interface ContrastWarning {
  fieldA: string;
  fieldB: string;
  colorA: string;
  colorB: string;
  ratio: number;
  minRequired: number;
  message: string;
}

/**
 * Checks WCAG AA compliance across key UI element combinations in the theme.
 */
export function checkThemeAccessibility(theme: InstitutionThemeConfig): {
  isAccessible: boolean;
  warnings: ContrastWarning[];
} {
  const warnings: ContrastWarning[] = [];

  // 1. Primary Text on Card Background (Min 4.5:1)
  const cardTextRatio = getContrastRatio(theme.primaryTextColor, theme.cardBackground);
  if (cardTextRatio < 4.5) {
    warnings.push({
      fieldA: "Primary Text",
      fieldB: "Card Background",
      colorA: theme.primaryTextColor,
      colorB: theme.cardBackground,
      ratio: cardTextRatio,
      minRequired: 4.5,
      message: `Card text contrast (${cardTextRatio}:1) is below WCAG AA recommended 4.5:1. Text may be hard to read.`,
    });
  }

  // 2. Primary Text on Workspace Background (Min 4.5:1)
  const workspaceTextRatio = getContrastRatio(theme.primaryTextColor, theme.workspaceBackground);
  if (workspaceTextRatio < 4.5) {
    warnings.push({
      fieldA: "Primary Text",
      fieldB: "Workspace Background",
      colorA: theme.primaryTextColor,
      colorB: theme.workspaceBackground,
      ratio: workspaceTextRatio,
      minRequired: 4.5,
      message: `Workspace text contrast (${workspaceTextRatio}:1) is below WCAG AA recommended 4.5:1.`,
    });
  }

  // 3. White Text on Primary Button (Min 3.0:1 for large/bold text, 4.5:1 for standard)
  const btnTextRatio = getContrastRatio("#FFFFFF", theme.primaryButtonColor);
  if (btnTextRatio < 3.0) {
    warnings.push({
      fieldA: "Button Text (White)",
      fieldB: "Primary Button",
      colorA: "#FFFFFF",
      colorB: theme.primaryButtonColor,
      ratio: btnTextRatio,
      minRequired: 3.0,
      message: `Button text contrast (${btnTextRatio}:1) is very low. Consider a darker button color or dark text.`,
    });
  }

  // 4. White Text on Sidebar Background (Min 4.5:1)
  const sidebarTextRatio = getContrastRatio("#FFFFFF", theme.sidebarBackground);
  if (sidebarTextRatio < 4.5) {
    warnings.push({
      fieldA: "Sidebar Text (White)",
      fieldB: "Sidebar Background",
      colorA: "#FFFFFF",
      colorB: theme.sidebarBackground,
      ratio: sidebarTextRatio,
      minRequired: 4.5,
      message: `Sidebar navigation contrast (${sidebarTextRatio}:1) is below 4.5:1. Navigation links may be illegible.`,
    });
  }

  // 5. Active Nav Background vs Sidebar Background
  const navContrast = getContrastRatio(theme.activeSidebarNav, theme.sidebarBackground);
  if (navContrast < 1.5) {
    warnings.push({
      fieldA: "Active Nav Item",
      fieldB: "Sidebar Background",
      colorA: theme.activeSidebarNav,
      colorB: theme.sidebarBackground,
      ratio: navContrast,
      minRequired: 1.5,
      message: `Active navigation highlight has low contrast against the sidebar background (${navContrast}:1).`,
    });
  }

  return {
    isAccessible: warnings.length === 0,
    warnings,
  };
}
