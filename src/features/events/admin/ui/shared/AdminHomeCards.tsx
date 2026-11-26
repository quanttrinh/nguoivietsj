// @boundary client
import type { JSX } from "preact";
import { useEffect, useState } from "preact/hooks";

import { css } from "styled-system/css";
import { grid, vstack, wrap } from "styled-system/patterns";
import { getSharedSession } from "~/features/auth/client/session";
import { can } from "~/features/auth/permissions";
import { isRecord } from "~/platform/utils/records";

interface AdminHomeCard {
  href: string;
  title: string;
  help: string;
  action: string;
  permission: "users" | "events";
}

const styles = {
  cards: grid({ gap: "4", gridTemplateColumns: { base: "1fr", md: "1fr 1fr" } }),
  card: vstack({
    alignItems: "stretch",
    gap: "3",
    rounded: "xl",
    borderWidth: "thin",
    borderStyle: "solid",
    borderColor: "outlineVariant",
    bgColor: "surfaceContainerLowest",
    p: "5",
    textDecoration: "none",
    color: "inherit",
    _hover: { borderColor: "primary", bgColor: "surfaceContainerLow" },
    _focusVisible: {
      ringWidth: "thick",
      outlineStyle: "solid",
      ringColor: "primary",
      ringOffset: "1",
    },
  }),
  cardTitle: css({ textStyle: "title-md", color: "onSurface" }),
  cardHelp: css({ fontSize: "sm", color: "onSurfaceVariant" }),
  cardAction: wrap({ align: "center", gap: "2", color: "primary", textStyle: "body-md-strong" }),
  empty: css({ fontSize: "sm", color: "onSurfaceVariant" }),
};

function readRole(user: unknown) {
  if (!isRecord(user) || typeof user.role !== "string") {
    return null;
  }

  return user.role;
}

export default function AdminHomeCards({
  cards: allCards,
  empty,
}: {
  cards: AdminHomeCard[];
  empty: string;
}): JSX.Element | null {
  const [role, setRole] = useState<string | null | undefined>();

  useEffect(() => {
    let cancelled = false;

    async function loadRole(): Promise<void> {
      try {
        const result = await getSharedSession();

        if (!cancelled) {
          setRole(readRole(result.data?.user));
        }
      } catch {
        if (!cancelled) {
          setRole(null);
        }
      }
    }

    void loadRole();

    return () => {
      cancelled = true;
    };
  }, []);

  if (role === undefined) {
    return null;
  }

  const cards = allCards.filter((card) =>
    card.permission === "users" ? can(role, { user: ["list"] }) : can(role, { event: ["list"] }),
  );

  if (cards.length === 0) {
    return <p class={styles.empty}>{empty}</p>;
  }

  return (
    <div class={styles.cards}>
      {cards.map((card) => (
        <a key={card.href} class={styles.card} href={card.href}>
          <span class={styles.cardTitle}>{card.title}</span>
          <span class={styles.cardHelp}>{card.help}</span>
          <span class={styles.cardAction}>{card.action} →</span>
        </a>
      ))}
    </div>
  );
}
