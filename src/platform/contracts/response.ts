// @boundary shared
/** Shared JSON API response contract for event-engine and admin endpoints. */

export interface ApiIssue {
  code: string;
  message?: string | undefined;
  path?: string | undefined;
  ref?: string | undefined;
}

export interface ApiError {
  code: string;
  message?: string;
  fields?: string[];
  issues?: ApiIssue[];
}

export interface ApiPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Cursor-based pagination used by views that do not expose an exact total. */
export interface ApiKeysetPagination {
  pageSize: number;
  hasNext: boolean;
  hasPrev: boolean;
  nextCursor: string | null;
  prevCursor: string | null;
}

export interface ApiMeta {
  requestId?: string | undefined;
  warnings?: ApiIssue[] | undefined;
  pagination?: ApiPagination | undefined;
  keyset?: ApiKeysetPagination | undefined;
}

/** Meta contract for endpoints that always report an exact-page pagination block. */
export interface ApiPaginatedMeta extends ApiMeta {
  pagination: ApiPagination;
}

export type ApiResponse<TData> =
  | {
      status: "success";
      data: TData;
      error: null;
      meta: ApiMeta;
    }
  | {
      status: "partial";
      data: TData;
      error: ApiError;
      meta: ApiMeta;
    }
  | {
      status: "error";
      data: null;
      error: ApiError;
      meta: ApiMeta;
    };
