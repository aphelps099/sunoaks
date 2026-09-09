export type StudioView = "create" | "calendar" | "promo" | "motion" | "ingester" | "library" | "campaigns";
export type StudioRoute = { view: StudioView; campaignId?: string; recordId?: string; itemId?: string; origin?: "create" | "campaigns" | "library" };
const VIEWS: StudioView[] = ["create", "calendar", "promo", "motion", "ingester", "library", "campaigns"];
export function parseStudioRoute(search: string): StudioRoute {
  const params = new URLSearchParams(search);
  const view = params.get("view") as StudioView;
  const origin = params.get("origin");
  return {
    view: VIEWS.includes(view) ? view : "create",
    campaignId: params.get("campaign") || undefined,
    recordId: params.get("record") || undefined,
    itemId: params.get("item") || undefined,
    origin: origin === "campaigns" || origin === "library" ? origin : "create",
  };
}
export function studioSearch(route: StudioRoute) {
  const params = new URLSearchParams();
  if (route.view !== "create") params.set("view", route.view);
  if (route.campaignId) params.set("campaign", route.campaignId);
  if (route.recordId) params.set("record", route.recordId);
  if (route.itemId) params.set("item", route.itemId);
  if (route.origin) params.set("origin", route.origin);
  return params.size ? `?${params}` : "";
}
