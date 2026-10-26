import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import type { UserRole } from "~/shared/constants/roles";

import { users } from "./schema";

export interface UserIdentity {
  id: string;
  email: string;
  role: UserRole;
}

export interface UserRepository {
  findIdentityByEmail: (email: string) => Promise<UserIdentity | null>;
}

/** Typed data access for staff identities. */
export function createUserRepository(db: D1Database): UserRepository {
  const orm = drizzle(db, { schema: { users } });

  return {
    async findIdentityByEmail(email) {
      const row = await orm
        .select({ id: users.id, email: users.email, role: users.role })
        .from(users)
        .where(sql`lower(${users.email}) = ${email.trim().toLowerCase()}`)
        .get();

      return row ?? null;
    },
  };
}
