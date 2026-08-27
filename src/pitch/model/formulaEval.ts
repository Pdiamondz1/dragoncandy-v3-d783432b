/**
 * A tiny Excel evaluator, covering exactly the subset the generator emits.
 *
 * It exists to answer one question in a test: does this formula compute the number the
 * workbook displays? A general Excel engine would be a dependency and a liability; this
 * handles `SUM`, `IF` (including nested), `ROUND`, arithmetic, parentheses, the `=` and `>`
 * comparisons, defined names and `Sheet!A1` references, and throws on anything else rather
 * than guessing. If the generator ever needs another function or operator, add it here in
 * the same change — a formula the evaluator cannot read is a formula nothing checks.
 *
 * `>` was added with the `Metros live` row, which counts a metro only in the years it has
 * customers: `IF(toggle="NO",0,IF(Hoboken_Model!B8>0,1,0))`. `<` is still unimplemented and
 * throws, because nothing emits it.
 *
 * `ROUND` was added to the brief's original subset (SUM/IF/MAX/MIN) for one reason: "Customers
 * at year end" is `Math.round(addressableVenues * penetration)` in the model
 * (`metroModel.ts`'s `customersAtMonth`), and `addressableVenues * penetration` is essentially
 * never an integer — the cached value and the raw product differ by up to ~0.4 across the
 * live metros. `ROUND(x,0)` matches `Math.round` for every value this model produces (all
 * non-negative, and none sitting exactly on a .5 boundary), so the formula and the cache agree.
 *
 * Every reference in every formula this workbook emits is fully sheet-qualified
 * (`Sheet!A1`), even when the formula and the cell it references live on the same sheet.
 * That is deliberate, not decorative: `collectFormulaContext` below only ever produces
 * sheet-qualified keys, and this evaluator has no notion of "the sheet the formula is on" —
 * a bare `A1` would be an unresolvable reference. A same-sheet `Sheet!A1` is valid Excel
 * syntax (just redundant), so qualifying everything costs nothing when the file is opened
 * for real and buys internal consistency here.
 */
import type { SheetSpec } from './workbook';

export interface FormulaContext {
  readonly names: Record<string, number>;
  readonly cells: Record<string, number>;
}

type Token = { kind: 'num'; v: number } | { kind: 'str'; v: string } | { kind: 'op'; v: string }
  | { kind: 'ref'; v: string } | { kind: 'fn'; v: string };

const FUNCTIONS = new Set(['SUM', 'IF', 'MAX', 'MIN', 'ROUND']);

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i += 1; continue; }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j += 1;
      tokens.push({ kind: 'num', v: Number(src.slice(i, j)) });
      i = j;
      continue;
    }
    if (ch === '"') {
      const end = src.indexOf('"', i + 1);
      if (end < 0) throw new Error(`Unterminated string in "${src}"`);
      tokens.push({ kind: 'str', v: src.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_!$.]/.test(src[j])) j += 1;
      const word = src.slice(i, j).replace(/\$/g, '');
      if (src[j] === '(' && FUNCTIONS.has(word.toUpperCase())) {
        tokens.push({ kind: 'fn', v: word.toUpperCase() });
      } else if (src[j] === '(') {
        throw new Error(`Unsupported function "${word}" in "${src}". Add it to formulaEval.ts.`);
      } else {
        tokens.push({ kind: 'ref', v: word });
      }
      i = j;
      continue;
    }
    // `>` is here and `<` deliberately is not: the generator emits `>` (the `Metros live`
    // row's `IF(customers>0,...)` liveness test) and nothing emits `<`. An unimplemented
    // operator falls through to the `Unexpected character` throw below, which is the
    // intended behaviour — this evaluator refuses rather than guessing, so a formula it
    // cannot read fails loudly instead of going unchecked.
    //
    // The line this replaces read `if (ch === '<' || ch === '>') throw ...` INSIDE this
    // block, guarded by a set containing neither character. It could never fire; both
    // already threw one branch further down.
    if ('+-*/(),=>'.includes(ch)) {
      tokens.push({ kind: 'op', v: ch });
      i += 1;
      continue;
    }
    throw new Error(`Unexpected character "${ch}" in "${src}"`);
  }
  return tokens;
}

export function evaluateFormula(formula: string, ctx: FormulaContext): number {
  const tokens = tokenize(formula.replace(/^=/, ''));
  let pos = 0;

  const peek = () => tokens[pos];
  const eat = (v: string) => {
    const t = tokens[pos];
    if (!t || t.kind !== 'op' || t.v !== v) throw new Error(`Expected "${v}" in "${formula}"`);
    pos += 1;
  };

  function resolve(name: string): number | string {
    if (name in ctx.names) return ctx.names[name];
    if (name in ctx.cells) return ctx.cells[name] as number | string;
    throw new Error(`Unknown reference "${name}" in "${formula}"`);
  }

  // A value that may be a string, for IF's comparison. Arithmetic coerces to number.
  function primary(): number | string {
    const t = peek();
    if (!t) throw new Error(`Unexpected end of "${formula}"`);
    if (t.kind === 'num') { pos += 1; return t.v; }
    if (t.kind === 'str') { pos += 1; return t.v; }
    if (t.kind === 'ref') { pos += 1; return resolve(t.v); }
    if (t.kind === 'op' && t.v === '-') { pos += 1; return -Number(primary()); }
    if (t.kind === 'op' && t.v === '(') {
      pos += 1;
      const v = comparison();
      eat(')');
      return v;
    }
    if (t.kind === 'fn') {
      const name = t.v;
      pos += 1;
      eat('(');
      const args: Array<number | string> = [];
      if (!(peek()?.kind === 'op' && peek()?.v === ')')) {
        args.push(comparison());
        while (peek()?.kind === 'op' && peek()?.v === ',') { pos += 1; args.push(comparison()); }
      }
      eat(')');
      if (name === 'SUM') return args.reduce((s: number, a) => s + Number(a), 0);
      if (name === 'MAX') return Math.max(...args.map(Number));
      if (name === 'MIN') return Math.min(...args.map(Number));
      if (name === 'IF') return Number(args[0]) === 1 ? Number(args[1]) : Number(args[2]);
      if (name === 'ROUND') {
        const digits = Number(args[1]);
        const factor = 10 ** digits;
        return Math.round(Number(args[0]) * factor) / factor;
      }
      throw new Error(`Unsupported function "${name}"`);
    }
    throw new Error(`Unexpected token in "${formula}"`);
  }

  function term(): number | string {
    let left = primary();
    while (peek()?.kind === 'op' && (peek()!.v === '*' || peek()!.v === '/')) {
      const op = tokens[pos].v; pos += 1;
      const right = Number(primary());
      left = op === '*' ? Number(left) * right : Number(left) / right;
    }
    return left;
  }

  function sum(): number | string {
    let left = term();
    while (peek()?.kind === 'op' && (peek()!.v === '+' || peek()!.v === '-')) {
      const op = tokens[pos].v; pos += 1;
      const right = Number(term());
      left = op === '+' ? Number(left) + right : Number(left) - right;
    }
    return left;
  }

  /**
   * `=` and `>` compare; the result is 1 or 0 so IF's first argument reads as a boolean.
   *
   * `=` compares as STRINGS (that is how the `IF(B4="NO",...)` toggles work, where one side
   * is text) and `>` compares as NUMBERS, which is the only way it is ever emitted — the
   * `Metros live` row asks whether a metro's year-end customer count is above zero. Excel
   * would order text by collation; this refuses to pretend it does, and `Number("NO")` is
   * `NaN`, so every comparison against text is false rather than accidentally true.
   */
  function comparison(): number | string {
    const left = sum();
    const op = peek();
    if (op?.kind === 'op' && (op.v === '=' || op.v === '>')) {
      pos += 1;
      const right = sum();
      if (op.v === '=') return String(left) === String(right) ? 1 : 0;
      return Number(left) > Number(right) ? 1 : 0;
    }
    return left;
  }

  const result = comparison();
  if (pos !== tokens.length) throw new Error(`Trailing tokens in "${formula}"`);
  return Number(result);
}

/** Defined names and cell addresses, read out of the sheet spec. */
export function collectFormulaContext(spec: readonly SheetSpec[]): FormulaContext {
  const names: Record<string, number> = {};
  const cells: Record<string, number> = {};
  const colLetter = (c: number): string => {
    let s = '';
    let x = c;
    while (x > 0) { const r = (x - 1) % 26; s = String.fromCharCode(65 + r) + s; x = Math.floor((x - 1) / 26); }
    return s;
  };
  for (const sheet of spec) {
    sheet.rows.forEach((row, r) => {
      row.forEach((cell, c) => {
        const address = `${sheet.name}!${colLetter(c + 1)}${r + 1}`;
        if (cell.v !== null) cells[address] = cell.v as number;
        if (cell.name) names[cell.name] = cell.v as number;
      });
    });
  }
  return { names, cells };
}
