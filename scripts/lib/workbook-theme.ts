/**
 * How the workbook LOOKS. Nothing here knows what a number means; nothing in
 * `src/pitch/model/workbook.ts` knows what a colour is.
 *
 * The split is the point. The spec carries `role: 'section'` — a claim about the document's
 * structure that stays true in a PDF, in Google Sheets, or in a renderer with no colours at
 * all — and this file is the only place that decides a section is teal. Put the fill in the
 * spec instead and the model becomes a stylesheet: `workbookProvenance.test.ts` walks every
 * cell in it asserting each number traces to a registered assumption, and every colour added
 * there is another cell that walk has to learn to ignore.
 *
 * ## What this fixes, concretely
 *
 * The workbook shipped with two style rules: column A is 44 wide, and row 1 is bold. That is
 * enough to read and not enough to follow. Eleven sheets came out identical — the same grey
 * tabs, the same grid — so a reader could not tell the sheet they may edit from the sheet
 * that is a Census extract, could not see where a section began, and could not tell a
 * subtotal from the rows above it. The explanatory paragraphs are hand-wrapped one row per
 * line, which reads as data until you notice it is prose.
 *
 * ## The one rule to keep
 *
 * **Presentation may not change a value.** Every function here writes fonts, fills, widths,
 * merges and number formats, and never `cell.value`. `workbook-theme.test.ts` asserts that by
 * building a themed workbook and comparing every cell back to the spec — because "I only
 * touched the styling" is exactly the claim that needs a control, and a number format IS
 * capable of lying about a value (`0.029` shown as `3%`), which is why the formats live in
 * the spec and this file only extends them for negatives.
 */
import type ExcelJS from 'exceljs';
import type { CellRole, SheetSpec } from '../../src/pitch/model/workbook';

/**
 * DragonCandy's own tokens, in Excel's `AARRGGBB`. Taken from `tailwind.config.ts` via
 * `docs/DESIGN_SYSTEM.md` rather than picked to taste, so the model looks like the product.
 *
 * `teal-btn` (#0F766E) is the dark teal the design system reserves for FILLS, and it is the
 * one used behind white text here for the same reason it is used behind white text there:
 * the bright brand teal (#4DD9C0) is a 1.6:1 contrast against white and unreadable as a
 * header. The design system records this trap explicitly — "dark-fill-as-text" — and a
 * spreadsheet header is the same mistake one medium over.
 */
export const PALETTE = {
  ink: 'FF111111',
  inkMuted: 'FF555555',
  white: 'FFFFFFFF',
  tealDeep: 'FF0F766E',
  tealMid: 'FF157F76',
  tealTint: 'FFE6F5F2',
  tealHair: 'FFB7DED6',
  pinkDeep: 'FFDB2777',
  amberTint: 'FFFDF3D8',
  amberLine: 'FFE0B44A',
  headlineTint: 'FFD8EFE9',
} as const;

/** Excel wants `AARRGGBB` with no `#`; every colour above is already in that form. */
type Argb = (typeof PALETTE)[keyof typeof PALETTE];

export interface RoleStyle {
  readonly bold?: boolean;
  /** Horizontal alignment. Only ever set where the default would read badly. */
  readonly align?: 'left' | 'center' | 'right';
  readonly italic?: boolean;
  readonly size?: number;
  readonly color?: Argb;
  readonly fill?: Argb;
  /** Fill and font run to the sheet's used width, not just column A. */
  readonly band?: boolean;
  /** A hairline above the row — how a subtotal says what it is totalling. */
  readonly ruleAbove?: boolean;
  /** A box around the cell — used for the cells a reader is invited to type into. */
  readonly box?: Argb;
  readonly rowHeight?: number;
}

/**
 * Every role, styled. Exhaustive by TYPE — add a `CellRole` and this stops compiling, which
 * is the check that a new role cannot quietly render as plain text.
 */
export const ROLE_STYLE: Readonly<Record<CellRole, RoleStyle>> = {
  title: { bold: true, size: 14, color: PALETTE.white, fill: PALETTE.tealDeep, band: true, rowHeight: 22 },
  subtitle: { italic: true, color: PALETTE.inkMuted, band: true },
  header: { bold: true, color: PALETTE.white, fill: PALETTE.tealMid, band: true, align: 'center' },
  section: { bold: true, color: PALETTE.tealDeep, fill: PALETTE.tealTint, band: true, rowHeight: 18 },
  note: { italic: true, size: 10, color: PALETTE.inkMuted },
  input: { bold: true, color: PALETTE.ink, fill: PALETTE.amberTint, box: PALETTE.amberLine, align: 'center' },
  total: { bold: true, ruleAbove: true },
  headline: { bold: true, color: PALETTE.tealDeep, fill: PALETTE.headlineTint, band: true },
  provenance: { bold: true, align: 'center' },
};

/**
 * A provenance tag is the one cell whose COLOUR carries meaning, so it is decided from the
 * value rather than from the role alone: MEASURED is a fact, MODELED is ours, BENCHMARKED is
 * someone else's. Anything unrecognised stays plain — a new provenance kind should look
 * unfamiliar rather than borrow the confidence of one of these.
 */
export function provenanceColor(value: unknown): Argb | undefined {
  if (value === 'MEASURED') return PALETTE.tealDeep;
  if (value === 'BENCHMARKED') return PALETTE.pinkDeep;
  if (value === 'MODELED') return PALETTE.inkMuted;
  return undefined;
}

/**
 * A currency format that shows a loss as a red number in brackets.
 *
 * Costs on the metro sheets are stored NEGATIVE and added rather than subtracted (see
 * `metroSheet`), so a reader meets a column of minus signs. Accounting brackets are what that
 * audience reads without thinking about it.
 *
 * Applied only to `$` formats, and only where the spec did not already spell out its own
 * sections: a format string containing `;` has stated what it wants for negatives, and
 * overriding it here would make the spec's instruction silently inoperative.
 */
export function withNegativeStyle(fmt: string | undefined): string | undefined {
  if (!fmt) return fmt;
  if (fmt.includes(';')) return fmt;
  if (!fmt.startsWith('$')) return fmt;
  return `${fmt};[Red](${fmt})`;
}

/** Tabs, grouped so the twelve sheets read as four things rather than twelve. */
const TAB_COLOR: Readonly<Record<string, Argb>> = {
  README: PALETTE.tealDeep,
  Assumptions: PALETTE.amberLine,
  Sources: PALETTE.inkMuted,
  Shared_Costs: PALETTE.pinkDeep,
  Totals: PALETTE.tealDeep,
  Unit_Economics: PALETTE.tealMid,
  Financing: PALETTE.pinkDeep,
};
const METRO_TAB = PALETTE.tealMid;

/** Sheets that are prose first and a table second; they get one wide column and no grid. */
const PROSE_SHEETS = new Set(['README', 'Sources']);

/**
 * Column widths, measured from the content rather than fixed at 18.
 *
 * Note, title and subtitle rows are excluded from the measurement on purpose: they are merged
 * across the whole sheet, so letting a 90-character sentence set column A's width would push
 * every year column off the screen to make room for text that is not in that column.
 */
function widthsFor(sheet: SheetSpec): number[] {
  const widths: number[] = [];
  const MERGED: ReadonlySet<CellRole> = new Set<CellRole>(['note', 'title', 'subtitle']);
  for (const row of sheet.rows) {
    if (row[0]?.role && MERGED.has(row[0].role)) continue;
    row.forEach((cell, c) => {
      const text = cell.v === null || cell.v === undefined ? '' : String(cell.v);
      const len = typeof cell.v === 'number' ? Math.max(text.length, 12) : text.length;
      widths[c] = Math.max(widths[c] ?? 10, Math.min(len + 3, c === 0 ? 46 : 30));
    });
  }
  return widths;
}

/** The widest row on the sheet — how far a banded fill or a merged note should run. */
function usedWidth(sheet: SheetSpec): number {
  return sheet.rows.reduce((max, row) => Math.max(max, row.length), 1);
}

/**
 * Style one worksheet in place. The caller has already written every value, formula, number
 * format and defined name; this only decorates what is there.
 */
export function applyTheme(ws: ExcelJS.Worksheet, sheet: SheetSpec): void {
  const width = usedWidth(sheet);

  widthsFor(sheet).forEach((w, c) => {
    ws.getColumn(c + 1).width = w;
  });

  ws.properties.tabColor = { argb: TAB_COLOR[sheet.name] ?? METRO_TAB };
  ws.views = [
    {
      state: 'frozen',
      // Column A carries every row's label, so it is what must stay on screen when a reader
      // scrolls right. Prose sheets have nothing to scroll past and freeze nothing.
      xSplit: PROSE_SHEETS.has(sheet.name) ? 0 : 1,
      ySplit: PROSE_SHEETS.has(sheet.name) ? 0 : 1,
      showGridLines: !PROSE_SHEETS.has(sheet.name),
    },
  ];
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

  sheet.rows.forEach((row, r) => {
    const excelRow = ws.getRow(r + 1);
    const rowRole = row[0]?.role;

    // A note is prose that happens to live in a cell. Merging it across the sheet is what
    // stops it being clipped at column A's edge or overwritten by the column beside it.
    if (rowRole === 'note' && width > 1) {
      ws.mergeCells(r + 1, 1, r + 1, width);
    }

    row.forEach((cell, c) => {
      const target = ws.getCell(r + 1, c + 1);
      const role = cell.role ?? (isBanded(rowRole) ? rowRole : c === 0 ? rowRole : undefined);
      if (!role) return;
      paint(target, role, cell.v);
    });

    // A banded role fills the whole used width, including columns the row never wrote to —
    // otherwise a two-cell section heading paints a stripe that stops halfway across.
    if (isBanded(rowRole)) {
      for (let c = row.length; c < width; c += 1) paint(ws.getCell(r + 1, c + 1), rowRole!, null);
    }

    const height = rowRole ? ROLE_STYLE[rowRole].rowHeight : undefined;
    if (height) excelRow.height = height;
  });
}

function isBanded(role: CellRole | undefined): boolean {
  return role !== undefined && ROLE_STYLE[role].band === true;
}

function paint(cell: ExcelJS.Cell, role: CellRole, value: unknown): void {
  const style = ROLE_STYLE[role];
  const color = role === 'provenance' ? provenanceColor(value) ?? style.color : style.color;

  cell.font = {
    ...(cell.font ?? {}),
    bold: style.bold ?? false,
    italic: style.italic ?? false,
    ...(style.size ? { size: style.size } : {}),
    ...(color ? { color: { argb: color } } : {}),
  };
  if (style.fill) {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: style.fill } };
  }
  if (style.align) {
    cell.alignment = { ...(cell.alignment ?? {}), horizontal: style.align };
  }
  if (style.ruleAbove) {
    cell.border = { ...(cell.border ?? {}), top: { style: 'thin', color: { argb: PALETTE.tealHair } } };
  }
  if (style.box) {
    const edge = { style: 'thin' as const, color: { argb: style.box } };
    cell.border = { top: edge, left: edge, bottom: edge, right: edge };
  }
}
