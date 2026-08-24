/**
 * The notes have to stay paired with the right slides.
 *
 * Two consumers read them by different routes: the deck pairs them by id, and
 * `scripts/emit-pitch-notes.ts` reads `NOTES` directly and relies on its key order being
 * the deck order (it cannot import the deck without importing React). If those ever
 * disagree, the PDF prints the wrong note facing the wrong slide — a failure that looks
 * fine in every automated check and is only caught by a human reading a page aloud.
 */
import { describe, expect, it } from 'vitest';

import { deck } from './index';
import { NOTES } from './notes';

describe('speaker notes', () => {
  it('exist for every slide, with nothing left over', () => {
    expect(Object.keys(NOTES).sort()).toEqual(deck.map((s) => s.id).sort());
  });

  it('are declared in deck order, which the notes emitter depends on', () => {
    expect(Object.keys(NOTES)).toEqual(deck.map((s) => s.id));
  });

  it('pairs each slide with its own note', () => {
    deck.forEach((slide) => {
      expect(slide.notes).toBe(NOTES[slide.id].notes);
      expect(slide.title).toBe(NOTES[slide.id].title);
    });
  });

  it('says something on every slide — a blank note is an unwritten one', () => {
    deck.forEach((slide) => {
      expect(slide.notes.trim().length).toBeGreaterThan(40);
    });
  });
});
