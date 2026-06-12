import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
	if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

	const json = (body: unknown, status = 200) =>
		new Response(JSON.stringify(body), {
			status,
			headers: { ...corsHeaders, "Content-Type": "application/json" },
		});

	try {
		const authHeader = req.headers.get("Authorization") || "";
		if (!authHeader.startsWith("Bearer ")) return json({ error: "Missing Authorization header" }, 401);

		const token = authHeader.slice("Bearer ".length);

		const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
		const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
		const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

		const authClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
		const { data: userData, error: userErr } = await authClient.auth.getUser(token);
		if (userErr || !userData?.user) return json({ error: 'Invalid session' }, 401);
		const userId = userData.user.id;

		const admin = createClient(SUPABASE_URL, SERVICE_KEY);

		// verify admin role
		const { data: roles, error: roleErr } = await admin.from('user_roles').select('role').eq('user_id', userId);
		if (roleErr) return json({ error: 'Role lookup failed' }, 500);
		const isAdmin = (roles || []).some((r: any) => r.role === 'admin' || r.role === 'super_admin');
		if (!isAdmin) return json({ error: 'Forbidden' }, 403);

		let body: any;
		try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

		const action = body?.action;
		if (action !== 'revert_import') return json({ error: 'unknown action' }, 400);

		const sourceTag = body?.sourceTag;
		if (!sourceTag) return json({ error: 'sourceTag required' }, 400);

		// Delete questions that came from this sourceTag
		const { error: delErr, count } = await admin
			.from('questions')
			.delete({ count: 'exact' })
			.eq('source', sourceTag);

		if (delErr) return json({ error: delErr.message }, 500);

		// Mark related import job(s) as reverted for audit
		try {
			await admin
				.from('import_jobs')
				.update({ status: 'reverted', error: 'reverted by admin', finished_at: new Date().toISOString() })
				.filter("options->>sourceTag", 'eq', String(sourceTag));
		} catch (_e) {
			// non-fatal
		}

		return json({ ok: true, deleted: count ?? 0 });
	} catch (e) {
		return json({ error: (e as Error).message }, 500);
	}
});
