export type RouteManifest = {
  title: string;
  faviconUrl?: string;
  meta: Record<string, { type: string; defaultValue: string }>;
  jsPayload: string;
  cssPayload?: string;
};

export type RoutesManifest = {
  loader: string;
  routes: Record<string, string>;
};
