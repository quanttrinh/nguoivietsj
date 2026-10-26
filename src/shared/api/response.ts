// @boundary shared
/** Shared JSON API response contract for event-engine and admin endpoints. */

export type ApiStatus = "success" | "partial" | "error";

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

export interface ApiMeta {
  requestId?: string | undefined;
  warnings?: ApiIssue[] | undefined;
  pagination?: ApiPagination | undefined;
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
