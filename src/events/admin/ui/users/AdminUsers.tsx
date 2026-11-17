// @boundary client
/* oxlint-disable eslint/max-lines, eslint/max-lines-per-function -- User management keeps filters, form, list, and mutations in one workflow. */
import type { InferResponseType } from "hono/client";
import type { JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";

import { css } from "styled-system/css";
import { vstack } from "styled-system/patterns";
import { USER_ROLE, type UserRole } from "~/auth/roles";
import {
  adminRefresh,
  adminQueries,
  type AdminUsersFilters,
  type AdminUserSearchField,
} from "~/events/admin/ui/shared/queries";
import { adminStyles } from "~/events/admin/ui/shared/styles/admin-styles";
import { tableStyles } from "~/events/admin/ui/shared/table";
import { MAX_EMAIL_ADDRESS_LENGTH } from "~/events/domain/limits";
import { apiClient, apiErrorMessage, readApiJson } from "~/shared/client/api/client";
import { clientLogger } from "~/shared/client/logger";
import { useQuery } from "~/shared/client/query/use-query";
import { noticeStyles } from "~/shared/ui/notice-styles";
import { isRecord } from "~/shared/utils/records";

export interface AdminUsersConfig {
  locale: string;
  createUser: string;
  editUser: string;
  deleteUser: string;
  userName: string;
  userEmail: string;
  userPassword: string;
  newPassword: string;
  userRole: string;
  userSearch: string;
  userSearchPlaceholder: string;
  userSearchField: string;
  userSearchAction: string;
  userClearFilters: string;
  allRoles: string;
  previousPage: string;
  nextPage: string;
  pageOfParts: string[];
  userCreatedAt: string;
  userActions: string;
  userSave: string;
  userSaving: string;
  userCreated: string;
  userUpdated: string;
  userDeleted: string;
  deleteUserConfirm: string;
  noUsers: string;
  userRequired: string;
  passwordTooShort: string;
  passwordHelp: string;
  roleUser: string;
  roleAdmin: string;
  roleEventStaff: string;
  roleEventCheckin: string;
  userLoadFailed: string;
  userSaveFailed: string;
  userDeleteFailed: string;
  userEdit: string;
  userDelete: string;
  userCancel: string;
  userClose: string;
}

const getUsers = apiClient.api.admin.users.$get;
const createUser = apiClient.api.admin.users.$post;
const updateUser = apiClient.api.admin.users[":userId"].$patch;
const deleteUser = apiClient.api.admin.users[":userId"].$delete;

type UsersResponse = InferResponseType<typeof getUsers, 200>["data"];
type AdminUser = UsersResponse["users"][number];

const styles = {
  section: vstack({ alignItems: "stretch", gap: "5" }),
  panel: css({
    rounded: "2xl",
    borderWidth: "thin",
    borderStyle: "solid",
    borderColor: "outlineVariant",
    bgColor: "surfaceContainerLowest",
    px: "5",
    py: "5",
  }),
  formBody: vstack({ alignItems: "stretch", gap: "4" }),
  filters: css({
    display: "grid",
    gap: "3",
    gridTemplateColumns: { base: "1fr", md: "minmax(0, 2fr) 1fr 1fr auto" },
    alignItems: "end",
  }),
  filterActions: css({ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "2" }),
  pager: css({
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "3",
    paddingBlockStart: "4",
  }),
  pagerActions: css({ display: "flex", alignItems: "center", gap: "2" }),
  pagerNote: css({ fontSize: "xs", color: "onSurfaceVariant" }),
  toolbar: css({ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "3" }),
  formGrid: css({
    display: "grid",
    gap: "4",
    gridTemplateColumns: { base: "1fr", md: "1fr 1fr" },
  }),
  heading: css({ textStyle: "title-md", paddingBlockEnd: "3" }),
  actions: css({ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "3" }),
  dialogActions: css({
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: "3",
  }),
  dialogHeader: css({
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "3",
    paddingBlockEnd: "3",
  }),
  notice: noticeStyles.notice,
  error: noticeStyles.error,
};

interface UserDraft {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

function userRole(value: string | undefined): UserRole {
  if (
    value === USER_ROLE.user ||
    value === USER_ROLE.admin ||
    value === USER_ROLE.event_staff ||
    value === USER_ROLE.event_checkin
  ) {
    return value;
  }

  return USER_ROLE.user;
}

function roleLabel(role: string, config: AdminUsersConfig): string {
  switch (role) {
    case USER_ROLE.user: {
      return config.roleUser;
    }
    case USER_ROLE.admin: {
      return config.roleAdmin;
    }
    case USER_ROLE.event_staff: {
      return config.roleEventStaff;
    }
    case USER_ROLE.event_checkin: {
      return config.roleEventCheckin;
    }
    default: {
      return role;
    }
  }
}

function formatDate(locale: string, value: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(value));
}

function UserForm(props: {
  mode: "create" | "edit";
  user: AdminUser | null;
  roles: UserRole[];
  config: AdminUsersConfig;
  busy: boolean;
  onSubmit: (draft: UserDraft) => void;
  onCancel: () => void;
}): JSX.Element {
  const [name, setName] = useState(props.user?.name ?? "");
  const [email, setEmail] = useState(props.user?.email ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>(userRole(props.user?.role));

  return (
    <form
      class={styles.formBody}
      onSubmit={(event) => {
        event.preventDefault();
        props.onSubmit({ name, email, password, role });
      }}
    >
      <div class={styles.formGrid}>
        <qui-field class={adminStyles.field}>
          <qui-field-label>{props.config.userName}</qui-field-label>
          <qui-input
            required
            aria-label={props.config.userName}
            defaultValue={name}
            onvaluechange={(event) => {
              setName(event.detail.value);
            }}
          />
        </qui-field>
        <qui-field class={adminStyles.field}>
          <qui-field-label>{props.config.userEmail}</qui-field-label>
          <qui-input
            required
            aria-label={props.config.userEmail}
            inputType="text"
            inputModeHint="email"
            defaultValue={email}
            onvaluechange={(event) => {
              setEmail(event.detail.value);
            }}
          />
        </qui-field>
        <qui-field class={adminStyles.field}>
          <qui-field-label>
            {props.mode === "create" ? props.config.userPassword : props.config.newPassword}
          </qui-field-label>
          <qui-input
            aria-label={
              props.mode === "create" ? props.config.userPassword : props.config.newPassword
            }
            inputType="password"
            autocomplete="new-password"
            required={props.mode === "create"}
            defaultValue={password}
            onvaluechange={(event) => {
              setPassword(event.detail.value);
            }}
          />
          <qui-field-helper-text>{props.config.passwordHelp}</qui-field-helper-text>
        </qui-field>
        <qui-field class={adminStyles.field}>
          <qui-field-label>{props.config.userRole}</qui-field-label>
          <qui-select
            aria-label={props.config.userRole}
            defaultValue={[role]}
            onvaluechange={(event) => {
              const value = event.detail.value[0];

              if (
                value === USER_ROLE.user ||
                value === USER_ROLE.admin ||
                value === USER_ROLE.event_staff ||
                value === USER_ROLE.event_checkin
              ) {
                setRole(value);
              }
            }}
          >
            {props.roles.map((value) => (
              <qui-option key={value} value={value}>
                {roleLabel(value, props.config)}
              </qui-option>
            ))}
          </qui-select>
        </qui-field>
      </div>
      <div class={styles.dialogActions}>
        <qui-button type="button" variant="text" disabled={props.busy} onClick={props.onCancel}>
          {props.config.userCancel}
        </qui-button>
        <qui-button type="submit" variant="filled" disabled={props.busy}>
          {props.busy ? props.config.userSaving : props.config.userSave}
        </qui-button>
      </div>
    </form>
  );
}

export default function AdminUsers(props: { config: AdminUsersConfig }): JSX.Element {
  const [filters, setFilters] = useState<AdminUsersFilters>({
    query: "",
    field: "email",
    role: "",
    page: 1,
  });
  const [queryValue, setQueryValue] = useState("");
  const [fieldValue, setFieldValue] = useState<AdminUserSearchField>("email");
  const [roleValue, setRoleValue] = useState<"" | UserRole>("");
  const [filterKey, setFilterKey] = useState(0);
  const [mounted, setMounted] = useState(false);
  const { data, error, loading } = useQuery(adminQueries.users(filters));
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [formKey, setFormKey] = useState(0);
  const dialogRef = useRef<HTMLQuiDialogElement>(null);

  useEffect((): (() => void) | undefined => {
    const dialog = dialogRef.current;

    if (dialog === null) {
      return undefined;
    }

    dialog.closeOnInteractOutside = false;

    const onOpenChange = (event: Event): void => {
      if (event.target !== dialog) {
        return;
      }

      const detail: unknown = event instanceof CustomEvent ? event.detail : null;

      if (isRecord(detail) && detail.open === false) {
        setFormMode(null);
        setEditing(null);
      }
    };

    dialog.addEventListener("openchange", onOpenChange);

    return () => {
      dialog.removeEventListener("openchange", onOpenChange);
    };
  }, []);

  function openCreate(): void {
    setEditing(null);
    setFormMode("create");
    setFormKey((current) => current + 1);
  }

  function openEdit(user: AdminUser): void {
    setEditing(user);
    setFormMode("edit");
    setFormKey((current) => current + 1);
  }

  function closeForm(): void {
    setFormMode(null);
    setEditing(null);
  }
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ message: string; tone: "success" | "error" } | null>(null);

  const roles = Object.values(USER_ROLE) as UserRole[];
  const totalPages = data?.totalPages ?? 1;
  const currentPage = data?.page ?? filters.page;
  const [before = "", between = "", after = ""] = props.config.pageOfParts;

  useEffect(() => {
    // Qui select controls fail their form-value sync when mounted during the
    // hydration render, so mount the filter form after the first client render.
    setMounted(true);
  }, []);

  useEffect(() => {
    if (data !== null && filters.page > data.totalPages) {
      setFilters((current) => ({ ...current, page: data.totalPages }));
    }
  }, [data, filters.page]);

  function search(event?: Event): void {
    event?.preventDefault();
    setFilters({
      query: queryValue.trim().slice(0, MAX_EMAIL_ADDRESS_LENGTH),
      field: fieldValue,
      role: roleValue,
      page: 1,
    });
  }

  function clearFilters(): void {
    setQueryValue("");
    setFieldValue("email");
    setRoleValue("");
    setFilters({ query: "", field: "email", role: "", page: 1 });
    setFilterKey((current) => current + 1);
  }

  async function saveUser(draft: UserDraft): Promise<void> {
    const name = draft.name.trim();
    const email = draft.email.trim();

    if (
      name.length === 0 ||
      email.length === 0 ||
      (editing === null && draft.password.length === 0)
    ) {
      setNotice({ message: props.config.userRequired, tone: "error" });
      return;
    }

    if (draft.password.length > 0 && draft.password.length < 8) {
      setNotice({ message: props.config.passwordTooShort, tone: "error" });
      return;
    }

    setBusy(true);
    setNotice(null);

    try {
      if (editing === null) {
        await readApiJson(
          await createUser({
            json: {
              name,
              email,
              password: draft.password,
              role: draft.role,
            },
          }),
        );
        setNotice({ message: props.config.userCreated, tone: "success" });
      } else {
        await readApiJson(
          await updateUser({
            param: { userId: editing.id },
            json: {
              name,
              email,
              role: draft.role,
              ...(draft.password.length > 0 ? { password: draft.password } : {}),
            },
          }),
        );
        setNotice({ message: props.config.userUpdated, tone: "success" });
      }

      adminRefresh.afterUserWrite();
      closeForm();
      setFormKey((current) => current + 1);
    } catch (error_) {
      clientLogger.error(error_);
      setNotice({
        message: apiErrorMessage(error_, props.config.userSaveFailed),
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function removeUser(user: AdminUser): Promise<void> {
    // oxlint-disable-next-line eslint/no-alert -- Deleting a user requires confirmation.
    if (!globalThis.confirm(props.config.deleteUserConfirm)) {
      return;
    }

    setBusy(true);
    setNotice(null);

    try {
      await readApiJson(await deleteUser({ param: { userId: user.id } }));
      setNotice({ message: props.config.userDeleted, tone: "success" });
      adminRefresh.afterUserWrite();
    } catch (error_) {
      clientLogger.error(error_);
      setNotice({
        message: apiErrorMessage(error_, props.config.userDeleteFailed),
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  const users = data?.users ?? [];

  return (
    <div class={styles.section}>
      {notice === null ? null : (
        <p
          class={styles.notice}
          data-tone={notice.tone === "error" ? "error" : undefined}
          role="status"
        >
          {notice.message}
        </p>
      )}

      <div class={styles.toolbar}>
        <qui-button variant="filled" onClick={openCreate}>
          {props.config.createUser}
        </qui-button>
      </div>

      {mounted ? (
        <form key={filterKey} class={styles.filters} onSubmit={search}>
          <qui-field class={adminStyles.field}>
            <qui-field-label>{props.config.userSearch}</qui-field-label>
            <qui-input
              id="engine-users-query"
              name="q"
              maxLength={MAX_EMAIL_ADDRESS_LENGTH}
              placeholder={props.config.userSearchPlaceholder}
              defaultValue={filters.query}
              onvaluechange={(event) => {
                setQueryValue(event.detail.value);
              }}
            />
          </qui-field>
          <qui-field class={adminStyles.field}>
            <qui-field-label>{props.config.userSearchField}</qui-field-label>
            <qui-select
              id="engine-users-field"
              name="field"
              defaultValue={[filters.field]}
              onvaluechange={(event) => {
                const value = event.detail.value[0];

                if (value === "email" || value === "name") {
                  setFieldValue(value);
                }
              }}
            >
              <qui-option value="email">{props.config.userEmail}</qui-option>
              <qui-option value="name">{props.config.userName}</qui-option>
            </qui-select>
          </qui-field>
          <qui-field class={adminStyles.field}>
            <qui-field-label>{props.config.userRole}</qui-field-label>
            <qui-select
              id="engine-users-role"
              name="role"
              defaultValue={[filters.role]}
              onvaluechange={(event) => {
                const value = event.detail.value[0] ?? "";

                if (
                  value === "" ||
                  value === USER_ROLE.user ||
                  value === USER_ROLE.admin ||
                  value === USER_ROLE.event_staff ||
                  value === USER_ROLE.event_checkin
                ) {
                  setRoleValue(value);
                }
              }}
            >
              <qui-option value="">{props.config.allRoles}</qui-option>
              {roles.map((value) => (
                <qui-option key={value} value={value}>
                  {roleLabel(value, props.config)}
                </qui-option>
              ))}
            </qui-select>
          </qui-field>
          <div class={styles.filterActions}>
            <qui-button type="submit" variant="filled">
              {props.config.userSearchAction}
            </qui-button>
            <qui-button type="button" variant="outlined" onClick={clearFilters}>
              {props.config.userClearFilters}
            </qui-button>
          </div>
        </form>
      ) : null}

      <qui-dialog ref={dialogRef} open={formMode !== null}>
        <qui-dialog-content>
          <div class={styles.dialogHeader}>
            <qui-dialog-title>
              {formMode === "edit" ? props.config.editUser : props.config.createUser}
            </qui-dialog-title>
            <qui-dialog-close onClick={closeForm}>
              <qui-icon
                label={props.config.userClose}
                path="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
              />
            </qui-dialog-close>
          </div>
          {formMode === null ? null : (
            <UserForm
              key={`${formMode}:${editing?.id ?? "new"}:${formKey}`}
              mode={formMode}
              user={editing}
              roles={roles}
              config={props.config}
              busy={busy}
              onSubmit={(draft) => void saveUser(draft)}
              onCancel={closeForm}
            />
          )}
        </qui-dialog-content>
      </qui-dialog>

      <div class={styles.panel}>
        {error === null ? null : (
          <p class={styles.error}>{apiErrorMessage(error, props.config.userLoadFailed)}</p>
        )}
        {!loading && error === null && users.length === 0 ? (
          <p class={tableStyles.empty}>{props.config.noUsers}</p>
        ) : null}
        {users.length > 0 ? (
          <table class={tableStyles.table}>
            <thead>
              <tr>
                <th class={tableStyles.th}>{props.config.userName}</th>
                <th class={tableStyles.th}>{props.config.userEmail}</th>
                <th class={tableStyles.th}>{props.config.userRole}</th>
                <th class={tableStyles.th}>{props.config.userCreatedAt}</th>
                <th class={tableStyles.th}>{props.config.userActions}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td class={tableStyles.td}>{user.name}</td>
                  <td class={tableStyles.td}>{user.email}</td>
                  <td class={tableStyles.td}>{roleLabel(user.role, props.config)}</td>
                  <td class={tableStyles.td}>{formatDate(props.config.locale, user.createdAt)}</td>
                  <td class={tableStyles.td}>
                    <div class={styles.actions}>
                      <qui-button
                        type="button"
                        size="sm"
                        variant="outlined"
                        aria-label={`${props.config.userEdit}: ${user.name}`}
                        disabled={busy}
                        onClick={() => {
                          openEdit(user);
                        }}
                      >
                        {props.config.userEdit}
                      </qui-button>
                      <qui-button
                        type="button"
                        size="sm"
                        variant="text"
                        aria-label={`${props.config.userDelete}: ${user.name}`}
                        disabled={busy}
                        onClick={() => void removeUser(user)}
                      >
                        {props.config.userDelete}
                      </qui-button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {totalPages > 1 ? (
          <div class={styles.pager}>
            <div class={styles.pagerActions}>
              <qui-button
                type="button"
                variant="outlined"
                size="sm"
                disabled={currentPage <= 1 || loading}
                onClick={() => {
                  setFilters((current) => ({ ...current, page: Math.max(1, current.page - 1) }));
                }}
              >
                {props.config.previousPage}
              </qui-button>
              <qui-button
                type="button"
                variant="outlined"
                size="sm"
                disabled={currentPage >= totalPages || loading}
                onClick={() => {
                  setFilters((current) => ({
                    ...current,
                    page: Math.min(totalPages, current.page + 1),
                  }));
                }}
              >
                {props.config.nextPage}
              </qui-button>
            </div>
            <span class={styles.pagerNote}>
              {before}
              {currentPage}
              {between}
              {totalPages}
              {after}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
