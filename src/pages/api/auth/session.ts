import type { APIRoute } from "astro";

import { json } from "~/events/server/http";
import { withStaffRoute } from "~/shared/server/api/route-decorators";

export const prerender = false;

export const GET: APIRoute = withStaffRoute(({ locals }) => json({ user: locals.user }, 200));
