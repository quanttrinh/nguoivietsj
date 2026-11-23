// @boundary client
import type { JSX } from "preact";

import { adminStyles as styles } from "~/events/admin/ui/shared/styles/admin-styles";
import { MAX_NOTE_BULLETS_TEXT_LENGTH, MAX_NOTE_PARAGRAPH_LENGTH } from "~/events/domain/limits";
import type { EventNoteBlock } from "~/events/domain/types";

import type { NoteBlockLabels } from "./form-labels";

function typeLabel(block: EventNoteBlock, labels: NoteBlockLabels) {
  if (block.type === "paragraph") {
    return labels.noteParagraph;
  }

  if (block.type === "bullets") {
    return labels.noteBullets;
  }

  return labels.noteLink;
}

export function NoteBlockFields({
  block,
  labels,
  onChange,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  block: EventNoteBlock;
  labels: NoteBlockLabels;
  onChange: (next: EventNoteBlock) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}): JSX.Element {
  const link = block.type === "link" ? block : null;

  const renderEditor = (): JSX.Element | null => {
    switch (block.type) {
      case "paragraph": {
        return (
          <qui-field class={styles.field}>
            <qui-field-label>{labels.noteText}</qui-field-label>
            <qui-textarea
              value={block.text}
              rows={3}
              maxLength={MAX_NOTE_PARAGRAPH_LENGTH}
              onvaluechange={(event) => {
                onChange({ type: "paragraph", text: event.detail.value });
              }}
            />
          </qui-field>
        );
      }
      case "bullets": {
        return (
          <qui-field class={styles.field}>
            <qui-field-label>{labels.noteText}</qui-field-label>
            <qui-textarea
              value={block.items.join("\n")}
              rows={3}
              maxLength={MAX_NOTE_BULLETS_TEXT_LENGTH}
              onvaluechange={(event) => {
                onChange({
                  type: "bullets",
                  items: event.detail.value.split("\n").map((item) => item.trim()),
                });
              }}
            />
            <qui-field-helper-text>{labels.noteBulletsHelp}</qui-field-helper-text>
          </qui-field>
        );
      }
      case "link": {
        return link === null ? null : (
          <div class={styles.fieldGrid}>
            <qui-field class={styles.field}>
              <qui-field-label>{labels.noteLabel}</qui-field-label>
              <qui-input
                value={link.label}
                onvaluechange={(event) => {
                  onChange({ type: "link", label: event.detail.value, href: link.href });
                }}
              />
            </qui-field>
            <qui-field class={styles.field}>
              <qui-field-label>{labels.noteUrl}</qui-field-label>
              <qui-input
                value={link.href}
                inputModeHint="url"
                onvaluechange={(event) => {
                  onChange({ type: "link", label: link.label, href: event.detail.value });
                }}
              />
            </qui-field>
          </div>
        );
      }
      default: {
        return null;
      }
    }
  };

  return (
    <div class={styles.ticketCard} data-note-block data-note-type={block.type}>
      <div class={styles.noteBlockHeader}>
        <h3 class={styles.ticketTitle}>{typeLabel(block, labels)}</h3>
        <div class={styles.noteBlockActions}>
          <qui-button variant="text" size="sm" onClick={onMoveUp}>
            {labels.moveUp}
          </qui-button>
          <qui-button variant="text" size="sm" onClick={onMoveDown}>
            {labels.moveDown}
          </qui-button>
          <qui-button variant="text" size="sm" onClick={onRemove}>
            {labels.removeNoteBlock}
          </qui-button>
        </div>
      </div>

      {renderEditor()}
    </div>
  );
}
