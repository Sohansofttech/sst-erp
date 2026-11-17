-- ============================================================================
-- SST-ERP MIGRATION DRAFT: BATCH 8 - INSTITUTION-LEVEL THEME CUSTOMIZATION
-- Schema extension for multi-tenant dynamic appearance, branding & WCAG tokens
-- DO NOT APPLY TO SHARED SUPABASE DIRECTLY
-- ============================================================================

-- Extend InstitutionBranding table with the 9 customizable theme properties
ALTER TABLE "InstitutionBranding"
  ADD COLUMN IF NOT EXISTS "sidebarBackground" VARCHAR(32) DEFAULT '#123B5A',
  ADD COLUMN IF NOT EXISTS "primaryButtonColor" VARCHAR(32) DEFAULT '#F5A000',
  ADD COLUMN IF NOT EXISTS "activeSidebarNav" VARCHAR(32) DEFAULT '#F5A000',
  ADD COLUMN IF NOT EXISTS "workspaceBackground" VARCHAR(32) DEFAULT '#EEF1F5',
  ADD COLUMN IF NOT EXISTS "cardBackground" VARCHAR(32) DEFAULT '#FFFFFF',
  ADD COLUMN IF NOT EXISTS "primaryTextColor" VARCHAR(32) DEFAULT '#1E293B',
  ADD COLUMN IF NOT EXISTS "secondaryTextColor" VARCHAR(32) DEFAULT '#64748B',
  ADD COLUMN IF NOT EXISTS "chartPalette" JSONB DEFAULT '["#123B5A", "#F5A000", "#14B8A6", "#3B82F6", "#8B5CF6"]'::jsonb,
  ADD COLUMN IF NOT EXISTS "accentColor" VARCHAR(32) DEFAULT '#F5A000',
  ADD COLUMN IF NOT EXISTS "themeConfig" JSONB DEFAULT '{
    "sidebarBackground": "#123B5A",
    "primaryButtonColor": "#F5A000",
    "activeSidebarNav": "#F5A000",
    "workspaceBackground": "#EEF1F5",
    "cardBackground": "#FFFFFF",
    "primaryTextColor": "#1E293B",
    "secondaryTextColor": "#64748B",
    "chartPalette": ["#123B5A", "#F5A000", "#14B8A6", "#3B82F6", "#8B5CF6"],
    "accentColor": "#F5A000"
  }'::jsonb;

-- Create index on institutionId for fast multi-tenant theme resolution
CREATE INDEX IF NOT EXISTS "idx_institution_branding_theme"
  ON "InstitutionBranding" ("institutionId");

-- Comments for documentation
COMMENT ON COLUMN "InstitutionBranding"."sidebarBackground" IS '1. Sidebar background color (default #123B5A)';
COMMENT ON COLUMN "InstitutionBranding"."primaryButtonColor" IS '2. Primary action button color (default #F5A000)';
COMMENT ON COLUMN "InstitutionBranding"."activeSidebarNav" IS '3. Active sidebar navigation link background (default #F5A000)';
COMMENT ON COLUMN "InstitutionBranding"."workspaceBackground" IS '4. Main workspace background color (default #EEF1F5)';
COMMENT ON COLUMN "InstitutionBranding"."cardBackground" IS '5. Card and panel container background (default #FFFFFF)';
COMMENT ON COLUMN "InstitutionBranding"."primaryTextColor" IS '6. Primary heading and body text color (default #1E293B)';
COMMENT ON COLUMN "InstitutionBranding"."secondaryTextColor" IS '7. Secondary text, metadata and subtitle color (default #64748B)';
COMMENT ON COLUMN "InstitutionBranding"."chartPalette" IS '8. Array of 5 hex color strings for data visualization charts';
COMMENT ON COLUMN "InstitutionBranding"."accentColor" IS '9. Institution branding accent color (default #F5A000)';
COMMENT ON COLUMN "InstitutionBranding"."themeConfig" IS 'Complete serialized theme object for fast client-side hydration';
