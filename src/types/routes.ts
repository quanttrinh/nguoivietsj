export type RoutesManifest = Record<string, RouteConfig>;

export type RouteConfig = {
  file: string;
  title: string;
  faviconUrl?: string;
  meta: Record<string, { type: string; defaultValue: string }>;
};

export type RoutePayload = {
  loader: {
    mainLoader: string;
    cssPayload?: string;
    JSPayload: string;
  };
};
