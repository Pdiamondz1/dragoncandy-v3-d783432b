import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { IntakeField } from '@/types/packages';

// Answers are keyed by field id. Most fields store a string; text_list + reference_examples store string[].
export type IntakeAnswers = Record<string, string | string[]>;

interface Props {
  schema: IntakeField[];
  answers: IntakeAnswers;
  onChange: (fieldId: string, value: string | string[]) => void;
}

/**
 * Generic renderer for a package's intake schema — turns the creator's format into a concrete brief the buyer
 * fills at checkout. reference_examples (1–2 links to work the buyer likes) is how taste is specified by
 * example, not adjectives (F2).
 */
export const IntakeForm = ({ schema, answers, onChange }: Props) => {
  const asString = (id: string) => (typeof answers[id] === 'string' ? (answers[id] as string) : '');
  const asList = (id: string) => (Array.isArray(answers[id]) ? (answers[id] as string[]) : []);

  return (
    <div className="space-y-4">
      {schema.map((f) => {
        const req = f.required ? <span className="ml-1 text-landing-pink-ink">*</span> : null;

        if (f.type === 'reference_examples') {
          const links = asList(f.id).length ? asList(f.id) : [''];
          const setLink = (i: number, v: string) => {
            const next = [...(asList(f.id).length ? asList(f.id) : [''])];
            next[i] = v;
            onChange(f.id, next);
          };
          return (
            <div key={f.id} className="space-y-1.5">
              <Label>{f.label}{req}</Label>
              <p className="text-xs text-muted-foreground">Paste 1–2 links to posts whose style you love — it’s the clearest way to say what you want.</p>
              {links.map((v, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    inputMode="url"
                    placeholder="https://instagram.com/reel/…"
                    value={v}
                    onChange={(e) => setLink(i, e.target.value)}
                  />
                  {links.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => onChange(f.id, asList(f.id).filter((_, j) => j !== i))}>
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              {links.length < 2 && (
                <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={() => onChange(f.id, [...links, ''])}>
                  <Plus className="h-3.5 w-3.5" /> Add another
                </Button>
              )}
            </div>
          );
        }

        if (f.type === 'text_list') {
          return (
            <div key={f.id} className="space-y-1.5">
              <Label htmlFor={`intake-${f.id}`}>{f.label}{req}</Label>
              <Textarea
                id={`intake-${f.id}`}
                rows={3}
                placeholder="One per line"
                value={asList(f.id).join('\n')}
                onChange={(e) => onChange(f.id, e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))}
              />
            </div>
          );
        }

        if (f.type === 'textarea' || f.type === 'address') {
          return (
            <div key={f.id} className="space-y-1.5">
              <Label htmlFor={`intake-${f.id}`}>{f.label}{req}</Label>
              <Textarea id={`intake-${f.id}`} rows={f.type === 'address' ? 2 : 3} value={asString(f.id)} onChange={(e) => onChange(f.id, e.target.value)} />
            </div>
          );
        }

        if (f.type === 'single_select') {
          return (
            <div key={f.id} className="space-y-1.5">
              <Label htmlFor={`intake-${f.id}`}>{f.label}{req}</Label>
              <select
                id={`intake-${f.id}`}
                value={asString(f.id)}
                onChange={(e) => onChange(f.id, e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Choose…</option>
                {(f.options ?? []).map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
          );
        }

        // text, date
        return (
          <div key={f.id} className="space-y-1.5">
            <Label htmlFor={`intake-${f.id}`}>{f.label}{req}</Label>
            <Input
              id={`intake-${f.id}`}
              type={f.type === 'date' ? 'date' : 'text'}
              value={asString(f.id)}
              onChange={(e) => onChange(f.id, e.target.value)}
            />
          </div>
        );
      })}
    </div>
  );
};

/** Returns the label of the first unmet required field, or null if the answers satisfy the schema. */
export const validateIntake = (schema: IntakeField[], answers: IntakeAnswers): string | null => {
  for (const f of schema) {
    if (!f.required) continue;
    const v = answers[f.id];
    const empty = Array.isArray(v) ? v.filter((s) => s && s.trim()).length === 0 : !v || !String(v).trim();
    if (empty) return f.label;
  }
  return null;
};
