// @boundary client
import type { JSX } from "preact";

import { adminStyles as styles } from "~/features/events/admin/ui/shared/styles/admin-styles";
import {
  MAX_NOTE_BULLETS_TEXT_LENGTH,
  MAX_NOTE_PARAGRAPH_LENGTH,
} from "~/features/events/domain/limits";
import type { EventNoteBlock } from "~/features/events/domain/types";
import type { EventFormLabels } from "~/generated/client/EventForm";

function typeLabel(block: EventNoteBlock, labels: EventFormLabels) {
  if (block.type === "paragraph") {
    return labels.engineAdmin.noteParagraph;
  }

  if (block.type === "bullets") {
    return labels.engineAdmin.noteBullets;
  }

  return labels.engineAdmin.noteLink;
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
  labels: EventFormLabels;
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
            <qui-field-label>{labels.engineAdmin.noteText}</qui-field-label>
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
            <qui-field-label>{labels.engineAdmin.noteText}</qui-field-label>
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
            <qui-field-helper-text>{labels.engineAdmin.noteBulletsHelp}</qui-field-helper-text>
          </qui-field>
        );
      }
      case "link": {
        return link === null ? null : (
          <div class={styles.fieldGrid}>
            <qui-field class={styles.field}>
              <qui-field-label>{labels.engineAdmin.noteLabel}</qui-field-label>
              <qui-input
                value={link.label}
                onvaluechange={(event) => {
                  onChange({ type: "link", label: event.detail.value, href: link.href });
                }}
              />
            </qui-field>
            <qui-field class={styles.field}>
              <qui-field-label>{labels.engineAdmin.noteUrl}</qui-field-label>
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
            {labels.engineAdmin.moveUp}
          </qui-button>
          <qui-button variant="text" size="sm" onClick={onMoveDown}>
            {labels.engineAdmin.moveDown}
          </qui-button>
          <qui-button variant="text" size="sm" onClick={onRemove}>
            {labels.shared.remove}
          </qui-button>
        </div>
      </div>

      {renderEditor()}
    </div>
  );
}
