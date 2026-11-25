export interface MontessoriMilestoneDefinition {
  id: string;
  domain: "PRACTICAL_LIFE" | "SENSORIAL" | "LANGUAGE" | "MATHEMATICS" | "SOCIAL_GRACE";
  domainLabel: string;
  title: string;
  description: string;
  recommendedStage: "Toddler" | "Primary" | "Elementary";
}

export const MONTESSORI_MILESTONES: MontessoriMilestoneDefinition[] = [
  // 1. Practical Life
  {
    id: "pl-01",
    domain: "PRACTICAL_LIFE",
    domainLabel: "Practical Life",
    title: "Spooning & Pouring (Liquid/Dry)",
    description: "Refining fine motor control, bilateral coordination, and wrist flexibility.",
    recommendedStage: "Toddler",
  },
  {
    id: "pl-02",
    domain: "PRACTICAL_LIFE",
    domainLabel: "Practical Life",
    title: "Dressing Frames (Buttoning & Zipping)",
    description: "Developing personal self-care, finger strength, and independence.",
    recommendedStage: "Primary",
  },
  {
    id: "pl-03",
    domain: "PRACTICAL_LIFE",
    domainLabel: "Practical Life",
    title: "Table Washing & Care of Environment",
    description: "Multi-step sequencing, sustained concentration, and classroom stewardship.",
    recommendedStage: "Primary",
  },

  // 2. Sensorial
  {
    id: "sen-01",
    domain: "SENSORIAL",
    domainLabel: "Sensorial Development",
    title: "Pink Tower & Broad Stair Grading",
    description: "Visual discrimination of three-dimensional dimensions and spatial volume.",
    recommendedStage: "Primary",
  },
  {
    id: "sen-02",
    domain: "SENSORIAL",
    domainLabel: "Sensorial Development",
    title: "Knobbed Cylinder Blocks",
    description: "Pincer grasp refinement and discrimination of height and diameter.",
    recommendedStage: "Toddler",
  },
  {
    id: "sen-03",
    domain: "SENSORIAL",
    domainLabel: "Sensorial Development",
    title: "Color Tablets Box 2 & 3",
    description: "Chromatics discrimination, pairing, and progressive color gradation.",
    recommendedStage: "Primary",
  },

  // 3. Language
  {
    id: "lang-01",
    domain: "LANGUAGE",
    domainLabel: "Language & Literacy",
    title: "Sandpaper Letters (Phonetic Sounds)",
    description: "Tactile-muscular memory of letter shapes linked to phonetic letter sounds.",
    recommendedStage: "Primary",
  },
  {
    id: "lang-02",
    domain: "LANGUAGE",
    domainLabel: "Language & Literacy",
    title: "Movable Alphabet Word Composition",
    description: "Constructing three-letter CVC words phonetically prior to mechanical writing.",
    recommendedStage: "Primary",
  },
  {
    id: "lang-03",
    domain: "LANGUAGE",
    domainLabel: "Language & Literacy",
    title: "Classified Nomenclature Cards (3-Part)",
    description: "Vocabulary enrichment, scientific classification, and visual matching.",
    recommendedStage: "Primary",
  },

  // 4. Mathematics
  {
    id: "math-01",
    domain: "MATHEMATICS",
    domainLabel: "Mathematical Mind",
    title: "Number Rods (Quantities 1–10)",
    description: "Concrete realization of quantity, length progression, and numeric magnitude.",
    recommendedStage: "Primary",
  },
  {
    id: "math-02",
    domain: "MATHEMATICS",
    domainLabel: "Mathematical Mind",
    title: "Spindle Box (Concept of Zero)",
    description: "Association of loose quantities with numerals and understanding zero as empty set.",
    recommendedStage: "Primary",
  },
  {
    id: "math-03",
    domain: "MATHEMATICS",
    domainLabel: "Mathematical Mind",
    title: "Golden Beads Decimal System Presentation",
    description: "Concrete introduction to units, tens, hundreds, and thousands place value.",
    recommendedStage: "Primary",
  },

  // 5. Social & Grace
  {
    id: "soc-01",
    domain: "SOCIAL_GRACE",
    domainLabel: "Grace & Courtesy",
    title: "Greeting & Welcoming Visitors",
    description: "Demonstrating polite acknowledgment, eye contact, and situational awareness.",
    recommendedStage: "Toddler",
  },
  {
    id: "soc-02",
    domain: "SOCIAL_GRACE",
    domainLabel: "Grace & Courtesy",
    title: "Autonomous Work Choice & Restoration",
    description: "Selecting activity independently, rolling work mat, and returning to shelf complete.",
    recommendedStage: "Primary",
  },
];
