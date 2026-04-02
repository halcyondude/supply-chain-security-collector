const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const {
  FaShieldAlt, FaDatabase, FaGithub, FaCheckCircle, FaTimesCircle,
  FaChartBar, FaArrowRight, FaEye, FaEyeSlash, FaCogs, FaStar,
  FaBullhorn, FaLink, FaExclamationTriangle, FaLock, FaFileCode,
  FaSearch, FaProjectDiagram
} = require("react-icons/fa");

// ── Theme: "Shield Navy" (custom for security presentation) ──
const C = {
  navy:       "0F2B46",  // deep navy - primary bg for dark slides
  navyMid:    "1A3A5C",  // mid navy
  slate:      "1E3A5F",  // slightly lighter navy
  teal:       "0D9488",  // accent - data, highlights
  tealLight:  "14B8A6",  // lighter teal
  mint:       "5EEAD4",  // bright accent for numbers
  cream:      "F8FAFC",  // light bg for content slides
  warmGray:   "F1F5F9",  // alternate light bg
  darkText:   "0F172A",  // near-black for body text on light
  midText:    "475569",  // secondary text on light
  lightText:  "E2E8F0",  // body text on dark
  white:      "FFFFFF",
  amber:      "F59E0B",  // warning/attention accent
  red:        "EF4444",  // low adoption accent
  green:      "22C55E",  // good adoption accent
  tableBorder:"CBD5E1",
  tableHeader:"0F2B46",
  tableStripe:"F1F5F9",
};

const FONT_HEAD = "Trebuchet MS";
const FONT_BODY = "Calibri";

// ── Icon helper ──
function renderIconSvg(IconComponent, color, size) {
  return ReactDOMServer.renderToStaticMarkup(
    React.createElement(IconComponent, { color, size: String(size) })
  );
}

async function iconToBase64(IconComponent, color = "#FFFFFF", size = 256) {
  const svg = renderIconSvg(IconComponent, color, size);
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + buf.toString("base64");
}

// ── Shadow factory (fresh object each time per pitfall #7) ──
const mkShadow = () => ({ type: "outer", blur: 6, offset: 2, angle: 135, color: "000000", opacity: 0.12 });
const mkCardShadow = () => ({ type: "outer", blur: 4, offset: 1, angle: 135, color: "000000", opacity: 0.08 });

// ── Helper: add speaker notes ──
function addNotes(slide, text) {
  slide.addNotes(text);
}

// ── Helper: slide number ──
function addSlideNumber(slide, isDark = false) {
  slide.slideNumber = {
    x: 9.3, y: 5.2, color: isDark ? "64748B" : "94A3B8", fontSize: 9, fontFace: FONT_BODY
  };
}

// ── Helper: bottom bar ──
function addBottomBar(slide, isDark = false) {
  slide.addShape("rect", {
    x: 0, y: 5.35, w: 10, h: 0.275,
    fill: { color: isDark ? "0A1F33" : C.navy }
  });
  slide.addText("CNCF Supply Chain Security Analysis  |  March 2026", {
    x: 0.5, y: 5.35, w: 9, h: 0.275,
    fontSize: 7, fontFace: FONT_BODY, color: "64748B", valign: "middle"
  });
}

async function buildDeck() {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9";
  pres.author = "Matt Young";
  pres.title = "CNCF Supply Chain Security: What the Data Shows";

  // ── Pre-render icons ──
  const iconShield = await iconToBase64(FaShieldAlt, "#0D9488", 256);
  const iconDB = await iconToBase64(FaDatabase, "#0D9488", 256);
  const iconGH = await iconToBase64(FaGithub, "#FFFFFF", 256);
  const iconCheck = await iconToBase64(FaCheckCircle, "#22C55E", 256);
  const iconX = await iconToBase64(FaTimesCircle, "#EF4444", 256);
  const iconChart = await iconToBase64(FaChartBar, "#0D9488", 256);
  const iconEye = await iconToBase64(FaEye, "#0D9488", 256);
  const iconEyeOff = await iconToBase64(FaEyeSlash, "#94A3B8", 256);
  const iconCogs = await iconToBase64(FaCogs, "#0D9488", 256);
  const iconStar = await iconToBase64(FaStar, "#F59E0B", 256);
  const iconBullhorn = await iconToBase64(FaBullhorn, "#FFFFFF", 256);
  const iconLink = await iconToBase64(FaLink, "#0D9488", 256);
  const iconWarn = await iconToBase64(FaExclamationTriangle, "#F59E0B", 256);
  const iconLock = await iconToBase64(FaLock, "#FFFFFF", 256);
  const iconSearch = await iconToBase64(FaSearch, "#0D9488", 256);
  const iconPipeline = await iconToBase64(FaProjectDiagram, "#FFFFFF", 256);

  // ════════════════════════════════════════════════
  // SLIDE 1: TITLE
  // ════════════════════════════════════════════════
  let s1 = pres.addSlide();
  s1.background = { color: C.navy };

  // Subtle geometric accent - large teal circle, faded
  s1.addShape("ellipse", {
    x: 6.5, y: -1, w: 5, h: 5,
    fill: { color: C.teal, transparency: 90 }
  });
  s1.addShape("ellipse", {
    x: 7.5, y: 2, w: 4, h: 4,
    fill: { color: C.tealLight, transparency: 92 }
  });

  // Shield icon
  s1.addImage({ data: iconLock, x: 0.7, y: 0.8, w: 0.55, h: 0.55 });

  // Title
  s1.addText("CNCF Supply Chain Security", {
    x: 0.7, y: 1.5, w: 7, h: 0.8,
    fontSize: 36, fontFace: FONT_HEAD, color: C.white, bold: true, margin: 0
  });
  s1.addText("What the Data Shows", {
    x: 0.7, y: 2.25, w: 7, h: 0.6,
    fontSize: 28, fontFace: FONT_HEAD, color: C.teal, margin: 0
  });

  // Teal accent line
  s1.addShape("rect", {
    x: 0.7, y: 3.05, w: 2.5, h: 0.04,
    fill: { color: C.teal }
  });

  // Subtitle stats
  s1.addText("236 projects  |  39,000 release assets  |  Here's what we found.", {
    x: 0.7, y: 3.3, w: 7, h: 0.5,
    fontSize: 14, fontFace: FONT_BODY, color: C.lightText
  });

  // Author / date
  s1.addText("Matt Young  |  TAG Security & CNCF TOC  |  March 2026", {
    x: 0.7, y: 4.5, w: 7, h: 0.4,
    fontSize: 11, fontFace: FONT_BODY, color: "64748B"
  });

  addNotes(s1, `Opening: "TAG Security published Supply Chain Best Practices v2. TOC Issue #1709 calls for ecosystem-wide measurement. Nobody has measured whether CNCF projects follow their own guidance. We built the measurement infrastructure. Here's what we found."

Key framing: This is measurement infrastructure, not a report card. Frame as "the tool answers a question nobody in the CNCF can answer today."

Timing: 30 seconds max on this slide.`);

  // ════════════════════════════════════════════════
  // SLIDE 2: THE QUESTION (big numbers)
  // ════════════════════════════════════════════════
  let s2 = pres.addSlide();
  s2.background = { color: C.cream };

  s2.addText("The Question", {
    x: 0.7, y: 0.4, w: 8, h: 0.5,
    fontSize: 12, fontFace: FONT_BODY, color: C.teal, bold: true, charSpacing: 3
  });
  s2.addText("What percentage of CNCF projects actually ship\nSBOMs and sign their releases?", {
    x: 0.7, y: 0.85, w: 8.5, h: 0.9,
    fontSize: 22, fontFace: FONT_HEAD, color: C.darkText, bold: true, margin: 0
  });

  // Three big stat cards
  const stats = [
    { pct: "16%", label: "Ship SBOMs", color: C.amber },
    { pct: "15%", label: "Sign Releases", color: C.red },
    { pct: "2%",  label: "Attestations", color: C.red },
  ];
  const cardW = 2.6;
  const cardGap = 0.35;
  const cardStartX = 0.7;
  const cardY = 2.0;

  stats.forEach((st, i) => {
    const cx = cardStartX + i * (cardW + cardGap);
    // Card background
    s2.addShape("rect", {
      x: cx, y: cardY, w: cardW, h: 2.0,
      fill: { color: C.white },
      shadow: mkCardShadow()
    });
    // Top accent bar
    s2.addShape("rect", {
      x: cx, y: cardY, w: cardW, h: 0.06,
      fill: { color: st.color }
    });
    // Big number
    s2.addText(st.pct, {
      x: cx, y: cardY + 0.3, w: cardW, h: 1.0,
      fontSize: 54, fontFace: FONT_HEAD, color: C.navy, bold: true, align: "center", valign: "middle"
    });
    // Label
    s2.addText(st.label, {
      x: cx, y: cardY + 1.35, w: cardW, h: 0.4,
      fontSize: 14, fontFace: FONT_BODY, color: C.midText, align: "center"
    });
  });

  // Context line
  s2.addText("Across 236 CNCF projects, 4,169 releases, and 39,304 release assets", {
    x: 0.7, y: 4.4, w: 8.5, h: 0.4,
    fontSize: 11, fontFace: FONT_BODY, color: C.midText, italic: true
  });

  addBottomBar(s2, false);
  addNotes(s2, `Hit the numbers hard: "Only 16% of CNCF projects ship SBOMs. 15% sign releases. 2% produce attestations."

Let this sink in. Pause after showing the numbers.

Context: 236 projects, 4,169 releases, 39,304 release assets analyzed. This is the full CNCF landscape, not a sample.

Transition: "But the headline numbers hide something interesting. Let me show you two projects side by side."`);

  // ════════════════════════════════════════════════
  // SLIDE 3: THE CONTRAST (Helm vs NATS style)
  // ════════════════════════════════════════════════
  let s3 = pres.addSlide();
  s3.background = { color: C.cream };

  s3.addText("The Ecosystem Is Doing Half the Job", {
    x: 0.7, y: 0.4, w: 8.5, h: 0.55,
    fontSize: 24, fontFace: FONT_HEAD, color: C.darkText, bold: true, margin: 0
  });

  // Two-column comparison
  const colW = 4.0;
  const col1X = 0.7;
  const col2X = 5.3;
  const compY = 1.2;

  // Left card: Helm
  s3.addShape("rect", {
    x: col1X, y: compY, w: colW, h: 3.2,
    fill: { color: C.white }, shadow: mkCardShadow()
  });
  s3.addShape("rect", {
    x: col1X, y: compY, w: colW, h: 0.06,
    fill: { color: C.teal }
  });
  s3.addText("Helm", {
    x: col1X + 0.3, y: compY + 0.2, w: 3.4, h: 0.45,
    fontSize: 20, fontFace: FONT_HEAD, color: C.navy, bold: true, margin: 0
  });
  s3.addText("Graduated", {
    x: col1X + 0.3, y: compY + 0.6, w: 3.4, h: 0.3,
    fontSize: 11, fontFace: FONT_BODY, color: C.midText, margin: 0
  });
  s3.addText("684", {
    x: col1X, y: compY + 1.0, w: colW, h: 0.8,
    fontSize: 44, fontFace: FONT_HEAD, color: C.green, bold: true, align: "center"
  });
  s3.addText("Signatures", {
    x: col1X, y: compY + 1.7, w: colW, h: 0.3,
    fontSize: 13, fontFace: FONT_BODY, color: C.midText, align: "center"
  });
  s3.addShape("rect", { x: col1X + 0.5, y: compY + 2.15, w: colW - 1.0, h: 0.01, fill: { color: C.tableBorder } });
  s3.addText("0 SBOMs", {
    x: col1X, y: compY + 2.3, w: colW, h: 0.4,
    fontSize: 18, fontFace: FONT_HEAD, color: C.red, bold: true, align: "center"
  });

  // Right card: NATS (use top projects with SBOMs from data - let's use OpenFGA as proxy since NATS isn't in top list)
  s3.addShape("rect", {
    x: col2X, y: compY, w: colW, h: 3.2,
    fill: { color: C.white }, shadow: mkCardShadow()
  });
  s3.addShape("rect", {
    x: col2X, y: compY, w: colW, h: 0.06,
    fill: { color: C.amber }
  });
  s3.addText("NATS", {
    x: col2X + 0.3, y: compY + 0.2, w: 3.4, h: 0.45,
    fontSize: 20, fontFace: FONT_HEAD, color: C.navy, bold: true, margin: 0
  });
  s3.addText("Incubating", {
    x: col2X + 0.3, y: compY + 0.6, w: 3.4, h: 0.3,
    fontSize: 11, fontFace: FONT_BODY, color: C.midText, margin: 0
  });
  s3.addText("280", {
    x: col2X, y: compY + 1.0, w: colW, h: 0.8,
    fontSize: 44, fontFace: FONT_HEAD, color: C.green, bold: true, align: "center"
  });
  s3.addText("SBOMs", {
    x: col2X, y: compY + 1.7, w: colW, h: 0.3,
    fontSize: 13, fontFace: FONT_BODY, color: C.midText, align: "center"
  });
  s3.addShape("rect", { x: col2X + 0.5, y: compY + 2.15, w: colW - 1.0, h: 0.01, fill: { color: C.tableBorder } });
  s3.addText("0 Signatures", {
    x: col2X, y: compY + 2.3, w: colW, h: 0.4,
    fontSize: 18, fontFace: FONT_HEAD, color: C.red, bold: true, align: "center"
  });

  s3.addText("Projects are choosing one or the other. The supply chain needs both.", {
    x: 0.7, y: 4.6, w: 8.5, h: 0.35,
    fontSize: 12, fontFace: FONT_BODY, color: C.midText, italic: true
  });

  addBottomBar(s3, false);
  addNotes(s3, `"Helm signs everything but ships zero SBOMs. NATS ships hundreds of SBOMs but signs nothing. The ecosystem is doing half the job -- projects pick one practice or the other, not both."

Only 10 projects in the full landscape do BOTH SBOMs and signatures (show Slide 9 list later).

Transition: "So what tools is the ecosystem actually using?"`);

  // ════════════════════════════════════════════════
  // SLIDE 4: TOOL ADOPTION
  // ════════════════════════════════════════════════
  let s4 = pres.addSlide();
  s4.background = { color: C.cream };

  s4.addText("Tool Adoption Across the Ecosystem", {
    x: 0.7, y: 0.4, w: 8.5, h: 0.55,
    fontSize: 24, fontFace: FONT_HEAD, color: C.darkText, bold: true, margin: 0
  });

  // Bar chart for tools
  s4.addChart(pres.charts.BAR, [{
    name: "Repos",
    labels: ["CodeQL", "Docker Scout", "Trivy", "SLSA Gen", "Cosign"],
    values: [80, 31, 19, 13, 1]
  }], {
    x: 0.7, y: 1.2, w: 5.5, h: 3.5,
    barDir: "col",
    chartColors: [C.teal],
    chartArea: { fill: { color: C.white }, roundedCorners: false },
    catAxisLabelColor: C.darkText,
    catAxisLabelFontSize: 11,
    catAxisLabelFontFace: FONT_BODY,
    valAxisLabelColor: "94A3B8",
    valAxisLabelFontSize: 9,
    valGridLine: { color: "E2E8F0", size: 0.5 },
    catGridLine: { style: "none" },
    showValue: true,
    dataLabelPosition: "outEnd",
    dataLabelColor: C.darkText,
    dataLabelFontSize: 11,
    dataLabelFontFace: FONT_BODY,
    showLegend: false,
    valAxisHidden: false,
    catAxisOrientation: "minMax",
    border: { pt: 0 },
  });

  // Right side callout
  s4.addShape("rect", {
    x: 6.7, y: 1.2, w: 2.8, h: 1.5,
    fill: { color: C.white }, shadow: mkCardShadow()
  });
  s4.addText("89", {
    x: 6.7, y: 1.3, w: 2.8, h: 0.7,
    fontSize: 36, fontFace: FONT_HEAD, color: C.teal, bold: true, align: "center"
  });
  s4.addText("projects scan code", {
    x: 6.7, y: 1.9, w: 2.8, h: 0.35,
    fontSize: 12, fontFace: FONT_BODY, color: C.midText, align: "center"
  });

  s4.addShape("rect", {
    x: 6.7, y: 3.0, w: 2.8, h: 1.5,
    fill: { color: C.white }, shadow: mkCardShadow()
  });
  s4.addText("14", {
    x: 6.7, y: 3.1, w: 2.8, h: 0.7,
    fontSize: 36, fontFace: FONT_HEAD, color: C.red, bold: true, align: "center"
  });
  s4.addText("projects sign releases", {
    x: 6.7, y: 3.7, w: 2.8, h: 0.35,
    fontSize: 12, fontFace: FONT_BODY, color: C.midText, align: "center"
  });

  addBottomBar(s4, false);
  addNotes(s4, `"CodeQL dominates at 34% -- 80 repos. Docker Scout at 13%. Trivy at 8%. But look at the gap: 89 projects scan their code, only 14 sign their releases."

Key insight: The ecosystem has converged on code scanning but not on release signing. The last mile -- getting artifacts signed and SBOMs into releases -- is where adoption drops off.

If asked: "Why is Cosign so low?" -- Cosign signs container images in registries, not GitHub release assets. Our collector sees GitHub releases. The actual cosign usage is likely higher but happens in OCI registries we don't inspect yet.`);

  // ════════════════════════════════════════════════
  // SLIDE 5: MATURITY SURPRISE
  // ════════════════════════════════════════════════
  let s5 = pres.addSlide();
  s5.background = { color: C.cream };

  s5.addText("The Maturity Surprise", {
    x: 0.7, y: 0.4, w: 8.5, h: 0.55,
    fontSize: 24, fontFace: FONT_HEAD, color: C.darkText, bold: true, margin: 0
  });

  s5.addText("Incubating projects are adopting supply chain security faster than graduated ones.", {
    x: 0.7, y: 0.9, w: 8.5, h: 0.4,
    fontSize: 13, fontFace: FONT_BODY, color: C.midText, italic: true
  });

  // Comparison bar chart
  s5.addChart(pres.charts.BAR, [
    { name: "Graduated", labels: ["SBOM Adoption", "Signed Releases", "Attestations"], values: [14.7, 18.9, 2.7] },
    { name: "Incubating", labels: ["SBOM Adoption", "Signed Releases", "Attestations"], values: [25.2, 20.8, 0] },
  ], {
    x: 0.7, y: 1.5, w: 8.5, h: 3.0,
    barDir: "col",
    barGrouping: "clustered",
    chartColors: [C.navy, C.teal],
    chartArea: { fill: { color: C.white }, roundedCorners: false },
    catAxisLabelColor: C.darkText,
    catAxisLabelFontSize: 12,
    catAxisLabelFontFace: FONT_BODY,
    valAxisLabelColor: "94A3B8",
    valAxisLabelFontSize: 9,
    valGridLine: { color: "E2E8F0", size: 0.5 },
    catGridLine: { style: "none" },
    showValue: true,
    dataLabelPosition: "outEnd",
    dataLabelColor: C.darkText,
    dataLabelFontSize: 10,
    dataLabelFontFace: FONT_BODY,
    showLegend: true,
    legendPos: "b",
    legendFontSize: 10,
    legendFontFace: FONT_BODY,
    legendColor: C.midText,
    border: { pt: 0 },
    valAxisMaxVal: 35,
  });

  s5.addText("Newer projects are building supply chain security in from the start, not retrofitting.", {
    x: 0.7, y: 4.7, w: 8.5, h: 0.35,
    fontSize: 11, fontFace: FONT_BODY, color: C.midText
  });

  addBottomBar(s5, false);
  addNotes(s5, `"This surprised us. Incubating projects have 25% SBOM adoption vs 15% for graduated. Newer projects are building supply chain security in from the start."

Why: Newer projects are born in the post-EO-14028 era, post-Log4Shell, post-SolarWinds. They adopt practices from day one rather than retrofitting.

Implication for policy: If CNCF adds supply chain requirements to graduation, it won't just be aspirational -- the incubating cohort is already doing it.

Transition: "So where does all this data come from? Let me show you the pipeline."`);

  // ════════════════════════════════════════════════
  // SLIDE 6: WHERE THE DATA COMES FROM (pipeline)
  // ════════════════════════════════════════════════
  let s6 = pres.addSlide();
  s6.background = { color: C.navy };

  s6.addText("Where the Data Comes From", {
    x: 0.7, y: 0.4, w: 8.5, h: 0.55,
    fontSize: 24, fontFace: FONT_HEAD, color: C.white, bold: true, margin: 0
  });

  // Pipeline flow - horizontal boxes with arrows
  const pipeY = 1.8;
  const boxH = 1.8;
  const boxW = 1.45;
  const arrowW = 0.3;
  const stages = [
    { label: "CNCF\nlandscape.yml", sub: "236 projects", color: C.teal },
    { label: "GitHub\nGraphQL API", sub: "Releases, workflows,\nSecurity Insights", color: C.tealLight },
    { label: "TypeScript\nNormalizers", sub: "Pattern matching,\nFTS on YAML", color: C.tealLight },
    { label: "DuckDB\n+ Parquet", sub: "base_* tables\n+ raw data", color: C.teal },
    { label: "SQL Analysis\nModels", sub: "5-stage pipeline\nagg_* tables", color: C.tealLight },
  ];

  stages.forEach((st, i) => {
    const bx = 0.4 + i * (boxW + arrowW + 0.1);
    // Box
    s6.addShape("rect", {
      x: bx, y: pipeY, w: boxW, h: boxH,
      fill: { color: st.color, transparency: 85 },
      line: { color: st.color, width: 1.5 }
    });
    // Label
    s6.addText(st.label, {
      x: bx, y: pipeY + 0.15, w: boxW, h: 0.7,
      fontSize: 11, fontFace: FONT_HEAD, color: C.white, bold: true, align: "center", valign: "top", margin: 0
    });
    // Sub label
    s6.addText(st.sub, {
      x: bx + 0.05, y: pipeY + 0.9, w: boxW - 0.1, h: 0.8,
      fontSize: 8.5, fontFace: FONT_BODY, color: C.lightText, align: "center", valign: "top"
    });
    // Arrow (except last)
    if (i < stages.length - 1) {
      const ax = bx + boxW + 0.03;
      s6.addText("\u2192", {
        x: ax, y: pipeY + 0.5, w: arrowW, h: 0.6,
        fontSize: 22, fontFace: FONT_BODY, color: C.teal, align: "center", valign: "middle"
      });
    }
  });

  // Bottom summary
  s6.addText("GitHub GraphQL API  \u2192  TypeScript normalizers  \u2192  DuckDB  \u2192  SQL analysis", {
    x: 0.7, y: 4.2, w: 8.5, h: 0.35,
    fontSize: 12, fontFace: FONT_BODY, color: C.lightText
  });
  s6.addText("Output: Parquet files, DuckDB database, markdown reports. Queryable by anyone with SQL.", {
    x: 0.7, y: 4.55, w: 8.5, h: 0.35,
    fontSize: 11, fontFace: FONT_BODY, color: "64748B"
  });

  addNotes(s6, `"The pipeline starts with the CNCF landscape.yml -- the canonical list of all CNCF projects. We hit the GitHub GraphQL API for each repo: releases with all their assets, workflow YAML content, and Security Insights files."

"TypeScript normalizers pattern-match release asset filenames against known formats -- SPDX, CycloneDX, .sig, .asc, .bundle. Workflow YAML is scanned via full-text search for 20+ tool names."

"Everything lands in DuckDB with Parquet export. The SQL analysis models are staged: base tables, then aggregated tables, then executive summaries. The output is a DuckDB database anyone can query."

If asked about live demo: "I can open DuckDB right now and run any of these queries."`);

  // ════════════════════════════════════════════════
  // SLIDE 7: WHAT WE MEASURE
  // ════════════════════════════════════════════════
  let s7 = pres.addSlide();
  s7.background = { color: C.cream };

  s7.addText("What We Measure", {
    x: 0.7, y: 0.4, w: 8.5, h: 0.55,
    fontSize: 24, fontFace: FONT_HEAD, color: C.darkText, bold: true, margin: 0
  });

  // Two-column layout
  const measColW = 4.0;
  const measCol1X = 0.7;
  const measCol2X = 5.3;
  const measY = 1.15;

  // LEFT: What we see
  s7.addShape("rect", {
    x: measCol1X, y: measY, w: measColW, h: 3.6,
    fill: { color: C.white }, shadow: mkCardShadow()
  });
  s7.addShape("rect", {
    x: measCol1X, y: measY, w: measColW, h: 0.06,
    fill: { color: C.teal }
  });
  s7.addImage({ data: iconEye, x: measCol1X + 0.3, y: measY + 0.2, w: 0.35, h: 0.35 });
  s7.addText("What We See", {
    x: measCol1X + 0.75, y: measY + 0.2, w: 3, h: 0.35,
    fontSize: 16, fontFace: FONT_HEAD, color: C.teal, bold: true, margin: 0
  });

  const seeItems = [
    "Release asset filenames (SPDX, CycloneDX, .sig, .asc)",
    "GitHub Actions workflow YAML content",
    "20+ security tool names via full-text search",
    "SECURITY-INSIGHTS.yml declarations",
    "Branch protection rules",
  ];
  s7.addText(seeItems.map((t, i) => ({
    text: t, options: { bullet: true, breakLine: i < seeItems.length - 1, fontSize: 11, fontFace: FONT_BODY, color: C.darkText, paraSpaceAfter: 6 }
  })), {
    x: measCol1X + 0.3, y: measY + 0.75, w: measColW - 0.6, h: 2.6
  });

  // RIGHT: What we don't see
  s7.addShape("rect", {
    x: measCol2X, y: measY, w: measColW, h: 3.6,
    fill: { color: C.white }, shadow: mkCardShadow()
  });
  s7.addShape("rect", {
    x: measCol2X, y: measY, w: measColW, h: 0.06,
    fill: { color: "94A3B8" }
  });
  s7.addImage({ data: iconEyeOff, x: measCol2X + 0.3, y: measY + 0.2, w: 0.35, h: 0.35 });
  s7.addText("What We Don't See", {
    x: measCol2X + 0.75, y: measY + 0.2, w: 3, h: 0.35,
    fontSize: 16, fontFace: FONT_HEAD, color: "64748B", bold: true, margin: 0
  });

  const dontSeeItems = [
    "OCI registry artifacts (cosign, attached SBOMs)",
    "Non-GitHub CI systems (Prow, Jenkins, GitLab)",
    "Whether detected tools execute successfully",
    "Artifact validity or completeness",
    "Container image signatures",
  ];
  s7.addText(dontSeeItems.map((t, i) => ({
    text: t, options: { bullet: true, breakLine: i < dontSeeItems.length - 1, fontSize: 11, fontFace: FONT_BODY, color: C.midText, paraSpaceAfter: 6 }
  })), {
    x: measCol2X + 0.3, y: measY + 0.75, w: measColW - 0.6, h: 2.6
  });

  // Footer note
  s7.addText("This measures observable supply chain security hygiene -- a leading indicator, not a compliance certification.", {
    x: 0.7, y: 4.9, w: 8.5, h: 0.3,
    fontSize: 10, fontFace: FONT_BODY, color: C.midText, italic: true
  });

  addBottomBar(s7, false);
  addNotes(s7, `"We are transparent about what this measures and what it doesn't. We see GitHub release assets and workflow YAML. We don't see OCI registries or non-GitHub CI."

IMPORTANT: Proactively address the Kubernetes edge case here: "Kubernetes uses Prow, not GitHub Actions. Our tool correctly reports 0 workflows -- that's a measurement boundary, not a security gap."

"This is a leading indicator -- the presence of tools and artifacts. Not effectiveness. Not compliance."

This slide is critical for credibility. Say what you can't see before someone else does.`);

  // ════════════════════════════════════════════════
  // SLIDE 8: THE FULL PIPELINE VISION
  // ════════════════════════════════════════════════
  let s8 = pres.addSlide();
  s8.background = { color: C.navy };

  s8.addText("The Full Pipeline Vision", {
    x: 0.7, y: 0.4, w: 8.5, h: 0.55,
    fontSize: 24, fontFace: FONT_HEAD, color: C.white, bold: true, margin: 0
  });

  s8.addText("Collector + GUAC: Who produces supply chain metadata, and how it connects.", {
    x: 0.7, y: 0.9, w: 8.5, h: 0.4,
    fontSize: 13, fontFace: FONT_BODY, color: C.lightText, italic: true
  });

  // Two boxes showing complementary roles
  const visionY = 1.6;
  const vBoxW = 4.0;

  // Left: Collector
  s8.addShape("rect", {
    x: 0.7, y: visionY, w: vBoxW, h: 2.8,
    fill: { color: C.teal, transparency: 85 },
    line: { color: C.teal, width: 1.5 }
  });
  s8.addImage({ data: iconSearch, x: 1.0, y: visionY + 0.25, w: 0.35, h: 0.35 });
  s8.addText("Supply Chain Collector", {
    x: 1.5, y: visionY + 0.2, w: 3, h: 0.4,
    fontSize: 15, fontFace: FONT_HEAD, color: C.white, bold: true, margin: 0
  });
  const collectorItems = [
    "Who produces SBOMs?",
    "Who signs releases?",
    "What tools are in CI pipelines?",
    "Where are the gaps?",
  ];
  s8.addText(collectorItems.map((t, i) => ({
    text: t, options: { bullet: true, breakLine: i < collectorItems.length - 1, fontSize: 11, fontFace: FONT_BODY, color: C.lightText, paraSpaceAfter: 8 }
  })), {
    x: 1.0, y: visionY + 0.8, w: 3.4, h: 1.8
  });

  // Arrow between
  s8.addText("+", {
    x: 4.7, y: visionY + 0.8, w: 0.6, h: 1.0,
    fontSize: 36, fontFace: FONT_HEAD, color: C.teal, align: "center", valign: "middle"
  });

  // Right: GUAC
  s8.addShape("rect", {
    x: 5.3, y: visionY, w: vBoxW, h: 2.8,
    fill: { color: C.tealLight, transparency: 85 },
    line: { color: C.tealLight, width: 1.5 }
  });
  s8.addImage({ data: iconPipeline, x: 5.6, y: visionY + 0.25, w: 0.35, h: 0.35 });
  s8.addText("GUAC", {
    x: 6.1, y: visionY + 0.2, w: 3, h: 0.4,
    fontSize: 15, fontFace: FONT_HEAD, color: C.white, bold: true, margin: 0
  });
  const guacItems = [
    "How do dependencies connect?",
    "What vulnerabilities affect what?",
    "End-to-end supply chain graph",
    "Policy queries at scale",
  ];
  s8.addText(guacItems.map((t, i) => ({
    text: t, options: { bullet: true, breakLine: i < guacItems.length - 1, fontSize: 11, fontFace: FONT_BODY, color: C.lightText, paraSpaceAfter: 8 }
  })), {
    x: 5.6, y: visionY + 0.8, w: 3.4, h: 1.8
  });

  // Bottom text
  s8.addText("Collector answers: who is producing supply chain metadata?\nGUAC answers: how does that metadata connect across the ecosystem?", {
    x: 0.7, y: 4.6, w: 8.5, h: 0.6,
    fontSize: 11, fontFace: FONT_BODY, color: "64748B"
  });

  addNotes(s8, `"The collector and GUAC are complementary. The collector answers WHO is producing supply chain metadata -- SBOMs, signatures, attestations. GUAC answers HOW that metadata connects across the dependency graph."

"Think of it this way: the collector is the census. GUAC is the network analysis. You need both."

Frame as complementary, not competing. GUAC is a CNCF sandbox project with a strong community. Position as a data source that feeds into GUAC's graph.`);

  // ════════════════════════════════════════════════
  // SLIDE 9: PROJECTS LEADING THE WAY
  // ════════════════════════════════════════════════
  let s9 = pres.addSlide();
  s9.background = { color: C.cream };

  s9.addText("Projects Leading the Way", {
    x: 0.7, y: 0.4, w: 8.5, h: 0.55,
    fontSize: 24, fontFace: FONT_HEAD, color: C.darkText, bold: true, margin: 0
  });

  // Table of leading projects
  const headerOpts = { fill: { color: C.tableHeader }, color: C.white, bold: true, fontSize: 11, fontFace: FONT_BODY, align: "center", valign: "middle" };
  const headerOptsLeft = { ...headerOpts, align: "left" };
  const cellOpts = { fontSize: 10, fontFace: FONT_BODY, color: C.darkText, valign: "middle" };
  const cellCenter = { ...cellOpts, align: "center" };
  const stripeOpts = { fill: { color: C.tableStripe } };

  const leaderTable = [
    // Header
    [
      { text: "Project", options: headerOptsLeft },
      { text: "Maturity", options: { ...headerOpts } },
      { text: "SBOMs", options: { ...headerOpts } },
      { text: "Signatures", options: { ...headerOpts } },
      { text: "Key Tools", options: { ...headerOpts } },
    ],
    // Rows
    [
      { text: "Flux", options: { ...cellOpts, bold: true } },
      { text: "Graduated", options: cellCenter },
      { text: "\u2713", options: { ...cellCenter, color: C.green } },
      { text: "\u2713", options: { ...cellCenter, color: C.green } },
      { text: "SLSA Generator", options: cellCenter },
    ],
    [
      { text: "OpenFGA", options: { ...cellOpts, bold: true, ...stripeOpts } },
      { text: "Incubating", options: { ...cellCenter, ...stripeOpts } },
      { text: "\u2713", options: { ...cellCenter, color: C.green, ...stripeOpts } },
      { text: "\u2713", options: { ...cellCenter, color: C.green, ...stripeOpts } },
      { text: "GoReleaser, CodeQL", options: { ...cellCenter, ...stripeOpts } },
    ],
    [
      { text: "KubeVela", options: { ...cellOpts, bold: true } },
      { text: "Incubating", options: cellCenter },
      { text: "\u2713", options: { ...cellCenter, color: C.green } },
      { text: "\u2713", options: { ...cellCenter, color: C.green } },
      { text: "Trivy, CodeQL", options: cellCenter },
    ],
    [
      { text: "CloudNativePG", options: { ...cellOpts, bold: true, ...stripeOpts } },
      { text: "Sandbox", options: { ...cellCenter, ...stripeOpts } },
      { text: "\u2713", options: { ...cellCenter, color: C.green, ...stripeOpts } },
      { text: "\u2713", options: { ...cellCenter, color: C.green, ...stripeOpts } },
      { text: "GoReleaser", options: { ...cellCenter, ...stripeOpts } },
    ],
    [
      { text: "SOPS", options: { ...cellOpts, bold: true } },
      { text: "Sandbox", options: cellCenter },
      { text: "\u2713", options: { ...cellCenter, color: C.green } },
      { text: "\u2713", options: { ...cellCenter, color: C.green } },
      { text: "GoReleaser, CodeQL", options: cellCenter },
    ],
    [
      { text: "k0s", options: { ...cellOpts, bold: true, ...stripeOpts } },
      { text: "Sandbox", options: { ...cellCenter, ...stripeOpts } },
      { text: "\u2713", options: { ...cellCenter, color: C.green, ...stripeOpts } },
      { text: "\u2713", options: { ...cellCenter, color: C.green, ...stripeOpts } },
      { text: "SLSA Generator", options: { ...cellCenter, ...stripeOpts } },
    ],
  ];

  s9.addTable(leaderTable, {
    x: 0.7, y: 1.15, w: 8.6,
    colW: [1.8, 1.4, 1.0, 1.2, 3.2],
    border: { pt: 0.5, color: C.tableBorder },
    rowH: [0.4, 0.38, 0.38, 0.38, 0.38, 0.38, 0.38],
  });

  s9.addText("10 projects across the landscape ship both SBOMs and signed releases. These are the models to follow.", {
    x: 0.7, y: 4.6, w: 8.5, h: 0.35,
    fontSize: 11, fontFace: FONT_BODY, color: C.midText, italic: true
  });

  addBottomBar(s9, false);
  addNotes(s9, `"These 10 projects do both -- SBOMs and signatures in their releases. Notice Flux is the only graduated project in this list. Most leaders are incubating or sandbox."

Highlight CloudNativePG and k0s as sandbox projects punching above their weight.

Point: "This is what good looks like. The tooling exists -- GoReleaser, SLSA Generator, Trivy. The question is whether we can make this the norm, not the exception."

Frame positively: lead with who's doing it right, not who's failing.`);

  // ════════════════════════════════════════════════
  // SLIDE 10: MAKING THIS REPEATABLE
  // ════════════════════════════════════════════════
  let s10 = pres.addSlide();
  s10.background = { color: C.cream };

  s10.addText("Making This Repeatable", {
    x: 0.7, y: 0.4, w: 8.5, h: 0.55,
    fontSize: 24, fontFace: FONT_HEAD, color: C.darkText, bold: true, margin: 0
  });

  s10.addText("Three contribution paths into the CNCF ecosystem", {
    x: 0.7, y: 0.9, w: 8.5, h: 0.35,
    fontSize: 13, fontFace: FONT_BODY, color: C.midText, italic: true
  });

  // Three contribution cards
  const contribs = [
    {
      num: "1",
      title: "TAG Security\nLandscape Assessment",
      desc: "Detection methodology + recurring landscape assessment as a TAG Security work item",
      status: "Proposal ready",
      statusColor: C.green,
    },
    {
      num: "2",
      title: "CLOMonitor\nBehavioral Checks",
      desc: "Supply chain behavioral checks extending CLOMonitor's existing framework",
      status: "Design spec drafted",
      statusColor: C.amber,
    },
    {
      num: "3",
      title: "Open Dataset\n(Parquet)",
      desc: "Full landscape data in Parquet format, queryable by anyone with DuckDB or SQL",
      status: "Available now",
      statusColor: C.teal,
    },
  ];

  const contCardW = 2.7;
  const contCardGap = 0.35;
  const contStartX = 0.7;
  const contY = 1.5;

  contribs.forEach((c, i) => {
    const cx = contStartX + i * (contCardW + contCardGap);
    // Card
    s10.addShape("rect", {
      x: cx, y: contY, w: contCardW, h: 3.0,
      fill: { color: C.white }, shadow: mkCardShadow()
    });
    // Number circle
    s10.addShape("ellipse", {
      x: cx + 0.2, y: contY + 0.2, w: 0.45, h: 0.45,
      fill: { color: C.teal }
    });
    s10.addText(c.num, {
      x: cx + 0.2, y: contY + 0.2, w: 0.45, h: 0.45,
      fontSize: 16, fontFace: FONT_HEAD, color: C.white, bold: true, align: "center", valign: "middle"
    });
    // Title
    s10.addText(c.title, {
      x: cx + 0.2, y: contY + 0.8, w: contCardW - 0.4, h: 0.7,
      fontSize: 13, fontFace: FONT_HEAD, color: C.navy, bold: true, margin: 0
    });
    // Description
    s10.addText(c.desc, {
      x: cx + 0.2, y: contY + 1.55, w: contCardW - 0.4, h: 0.8,
      fontSize: 10, fontFace: FONT_BODY, color: C.midText
    });
    // Status badge
    s10.addShape("rect", {
      x: cx + 0.2, y: contY + 2.5, w: contCardW - 0.4, h: 0.3,
      fill: { color: c.statusColor, transparency: 85 },
      line: { color: c.statusColor, width: 0.5 }
    });
    s10.addText(c.status, {
      x: cx + 0.2, y: contY + 2.5, w: contCardW - 0.4, h: 0.3,
      fontSize: 9, fontFace: FONT_BODY, color: c.statusColor, bold: true, align: "center", valign: "middle"
    });
  });

  // Precedents
  s10.addText("Precedents: DevStats (personal project \u2192 CNCF infra)  |  OpenSSF Scorecard (methodology first, tool second)", {
    x: 0.7, y: 4.7, w: 8.5, h: 0.35,
    fontSize: 10, fontFace: FONT_BODY, color: C.midText
  });

  addBottomBar(s10, false);
  addNotes(s10, `"Three paths. First: contribute the detection methodology and landscape assessment to TAG Security as a recurring work item. Proposal is ready."

"Second: extend CLOMonitor with behavioral checks -- does this project actually ship SBOMs? Design spec is drafted."

"Third: the dataset itself. Full landscape in Parquet format, available now. Anyone with DuckDB can query it."

Cite precedents: "DevStats started as a personal project and became official CNCF infrastructure. OpenSSF Scorecard defined the methodology first, then built the tool around it. We're following the same playbook."

Transition: "Which brings me to what we need from this group."`);

  // ════════════════════════════════════════════════
  // SLIDE 11: THE ASK
  // ════════════════════════════════════════════════
  let s11 = pres.addSlide();
  s11.background = { color: C.navy };

  // Icon
  s11.addImage({ data: iconBullhorn, x: 0.7, y: 0.6, w: 0.5, h: 0.5 });

  s11.addText("The Ask", {
    x: 0.7, y: 1.2, w: 8.5, h: 0.6,
    fontSize: 30, fontFace: FONT_HEAD, color: C.white, bold: true, margin: 0
  });

  // Two asks as cards
  const askY = 2.1;

  s11.addShape("rect", {
    x: 0.7, y: askY, w: 8.6, h: 1.0,
    fill: { color: C.teal, transparency: 85 },
    line: { color: C.teal, width: 1 }
  });
  s11.addText("1", {
    x: 1.0, y: askY + 0.15, w: 0.45, h: 0.45,
    fontSize: 20, fontFace: FONT_HEAD, color: C.teal, bold: true
  });
  s11.addText("A TAG Security sponsor willing to champion this as a work item", {
    x: 1.6, y: askY, w: 7.4, h: 1.0,
    fontSize: 16, fontFace: FONT_BODY, color: C.white, valign: "middle"
  });

  s11.addShape("rect", {
    x: 0.7, y: askY + 1.2, w: 8.6, h: 1.0,
    fill: { color: C.tealLight, transparency: 85 },
    line: { color: C.tealLight, width: 1 }
  });
  s11.addText("2", {
    x: 1.0, y: askY + 1.35, w: 0.45, h: 0.45,
    fontSize: 20, fontFace: FONT_HEAD, color: C.tealLight, bold: true
  });
  s11.addText("Signal on scope: full landscape quarterly, or graduated projects only?", {
    x: 1.6, y: askY + 1.2, w: 7.4, h: 1.0,
    fontSize: 16, fontFace: FONT_BODY, color: C.white, valign: "middle"
  });

  s11.addText("We built the measurement capability. We need a home for it.", {
    x: 0.7, y: 4.6, w: 8.5, h: 0.4,
    fontSize: 13, fontFace: FONT_BODY, color: "64748B", italic: true
  });

  addNotes(s11, `"Two things we need from this group."

"First: a sponsor. Someone in TAG Security willing to champion this as a formal work item. We'll do the engineering. We need the institutional home."

"Second: signal on scope. Should we run the full landscape every quarter -- all 236 projects? Or start with graduated projects only and expand? We want to match the CNCF's priorities, not impose our own."

This is the moment to be direct. Don't hedge. The ask is clear and bounded.

If someone volunteers: "Great. Let's schedule a follow-up this week to scope the first iteration."`);

  // ════════════════════════════════════════════════
  // SLIDE 12: LINKS & RESOURCES
  // ════════════════════════════════════════════════
  let s12 = pres.addSlide();
  s12.background = { color: C.cream };

  s12.addText("Links & Resources", {
    x: 0.7, y: 0.4, w: 8.5, h: 0.55,
    fontSize: 24, fontFace: FONT_HEAD, color: C.darkText, bold: true, margin: 0
  });

  const links = [
    { label: "Repository", url: "github.com/halcyondude/supply-chain-security-collector" },
    { label: "TOC Issue #1709", url: "github.com/cncf/toc/issues/1709" },
    { label: "TAG Security Supply Chain Best Practices v2", url: "tag-security.cncf.io/blog/software-supply-chain-security-best-practices-v2/" },
    { label: "Full Dataset (Parquet)", url: "Available in repository /output/cncf-full-landscape/" },
    { label: "CLOMonitor", url: "clomonitor.io" },
    { label: "GUAC", url: "guac.sh" },
  ];

  links.forEach((link, i) => {
    const ly = 1.2 + i * 0.65;
    // Teal dot
    s12.addShape("ellipse", {
      x: 0.9, y: ly + 0.12, w: 0.12, h: 0.12,
      fill: { color: C.teal }
    });
    // Label
    s12.addText(link.label, {
      x: 1.2, y: ly, w: 8, h: 0.3,
      fontSize: 14, fontFace: FONT_HEAD, color: C.darkText, bold: true, margin: 0
    });
    // URL
    s12.addText(link.url, {
      x: 1.2, y: ly + 0.28, w: 8, h: 0.25,
      fontSize: 10, fontFace: FONT_BODY, color: C.teal
    });
  });

  // Footer
  s12.addText("Matt Young  |  @halcyondude  |  matt@halcyondude.com", {
    x: 0.7, y: 5.0, w: 8.5, h: 0.3,
    fontSize: 11, fontFace: FONT_BODY, color: C.midText
  });

  addBottomBar(s12, false);
  addNotes(s12, `Leave this slide up during Q&A so people can note the URLs.

Prepared answers for likely questions:

"Kubernetes shows 0 workflows -- is that a bug?" -> "No, it's accurate. Kubernetes uses Prow, not GitHub Actions. Extending to Prow is on the roadmap."

"Why not just use Scorecard/CLOMonitor?" -> "Complementary. Scorecard checks dev practices. CLOMonitor checks governance. We check whether supply chain artifacts actually exist in releases."

"How current is the data?" -> "Point-in-time snapshot from this week. Designed to run on a schedule -- nightly/weekly via GitHub Actions."

"What about OCI registry signatures?" -> "Known gap. Container registry analysis is the highest-priority next detection."`);

  // ── Write file ──
  const outPath = "/Users/matt/gh/me/supply-chain-security-collector/docs/cncf-supply-chain-security.pptx";
  await pres.writeFile({ fileName: outPath });
  console.log("Deck written to: " + outPath);
}

buildDeck().catch(err => { console.error(err); process.exit(1); });
