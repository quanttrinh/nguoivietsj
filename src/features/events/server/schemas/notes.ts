// @boundary server
import { type } from "arktype";

import { LIMITS } from "~/features/events/domain/limits";
import { SUPPORTED_LOCALES } from "~/platform/i18n";

const noteBulletSchema = type(`1 <= string <= ${LIMITS.event.noteBullet}`);

const paragraphBlockSchema = type({
  type: type("'paragraph'"),
  text: type(`1 <= string <= ${LIMITS.event.noteParagraph}`),
});

const bulletsBlockSchema = type({
  type: type("'bullets'"),
  items: noteBulletSchema.array().atLeastLength(1).atMostLength(LIMITS.event.noteBlocks),
});

const linkBlockSchema = type({
  type: type("'link'"),
  label: type(`1 <= string <= ${LIMITS.event.noteLinkLabel}`),
  href: type(`1 <= string.url <= ${LIMITS.event.url}`),
});

export const noteBlockSchema = paragraphBlockSchema.or(bulletsBlockSchema).or(linkBlockSchema);
export type EventNoteBlock = typeof noteBlockSchema.infer;

export const eventNotesSchema = type
  .Record(type.string, noteBlockSchema.array().atMostLength(LIMITS.event.noteBlocks))
  .narrow((value) => Object.keys(value).every((key) => SUPPORTED_LOCALES.has(key)));
export type EventNotes = typeof eventNotesSchema.infer;
