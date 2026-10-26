import type { UserIdentity } from "../db/app/users";

declare global {
  namespace App {
    interface Locals {
      user: UserIdentity | null;
    }
  }
}
