// @boundary client
import type { JSX } from "preact";

import { adminStyles as styles } from "~/events/admin/ui/shared/styles/admin-styles";
import { MAX_NOTE_BULLETS_TEXT_LENGTH, MAX_NOTE_PARAGRAPH_LENGTH } from "~/events/domain/limits";
import type { EventNoteBlock } from "~/events/domain/types";

export interface NoteBlockConfig {
  noteParagraph: string;
  noteBullets: string;
  noteLink: string;
  moveUp: string;
  moveDown: string;
  removeNoteBlock: string;
  noteText: string;
  noteBulletsHelp: string;
  noteLabel: string;
  noteUrl: string;
}

function typeLabel(block: EventNoteBlock, config: NoteBlockConfig): string {
  if (block.type === "paragraph") {
    return config.noteParagraph;
  }

  if (block.type === "bullets") {
    return config.noteBullets;
  }

  return config.noteLink;
}

export function NoteBlockFields(props: {
  block: EventNoteBlock;
  config: NoteBlockConfig;
  onChange: (next: EventNoteBlock) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}): JSX.Element {
  const block = props.block;
  const link = block.type === "link" ? block : null;

  const renderEditor = (): JSX.Element | null => {
    switch (block.type) {
      case "paragraph": {
        return (
          <qui-field class={styles.field}>
            <qui-field-label>{props.config.noteText}</qui-field-label>
            <qui-textarea
              value={block.text}
              rows={3}
              maxLength={MAX_NOTE_PARAGRAPH_LENGTH}
              onvaluechange={(event) => {
                props.onChange({ type: "paragraph", text: event.detail.value });
              }}
            />
          </qui-field>
        );
      }
      case "bullets": {
        return (
          <qui-field class={styles.field}>
            <qui-field-label>{props.config.noteText}</qui-field-label>
            <qui-textarea
              value={block.items.join("\n")}
              rows={3}
              maxLength={MAX_NOTE_BULLETS_TEXT_LENGTH}
              onvaluechange={(event) => {
                props.onChange({
                  type: "bullets",
                  items: event.detail.value.split("\n").map((item) => item.trim()),
                });
              }}
            />
            <qui-field-helper-text>{props.config.noteBulletsHelp}</qui-field-helper-text>
          </qui-field>
        );
      }
      case "link": {
        return link === null ? null : (
          <div class={styles.fieldGrid}>
            <qui-field class={styles.field}>
              <qui-field-label>{props.config.noteLabel}</qui-field-label>
              <qui-input
                value={link.label}
                onvaluechange={(event) => {
                  props.onChange({ type: "link", label: event.detail.value, href: link.href });
                }}
              />
            </qui-field>
            <qui-field class={styles.field}>
              <qui-field-label>{props.config.noteUrl}</qui-field-label>
              <qui-input
                value={link.href}
                inputModeHint="url"
                onvaluechange={(event) => {
                  props.onChange({ type: "link", label: link.label, href: event.detail.value });
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
        <h3 class={styles.ticketTitle}>{typeLabel(block, props.config)}</h3>
        <div class={styles.noteBlockActions}>
          <qui-button variant="text" size="sm" onClick={props.onMoveUp}>
            {props.config.moveUp}
          </qui-button>
          <qui-button variant="text" size="sm" onClick={props.onMoveDown}>
            {props.config.moveDown}
          </qui-button>
          <qui-button variant="text" size="sm" onClick={props.onRemove}>
            {props.config.removeNoteBlock}
          </qui-button>
        </div>
      </div>

      {renderEditor()}
    </div>
  );
}
