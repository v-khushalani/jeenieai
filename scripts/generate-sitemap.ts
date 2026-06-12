// Generates public/sitemap.xml at predev/prebuild time.
// Pulls active batches from Supabase to include dynamic /batch/<slug> URLs.

import { writeFileSync } from "fs";
import { resolve } from "path";

const BASE_URL = "https://www.jeenie.website";
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://ngduavjaiqyiqjzelfpl.supabase.co";
const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5nZHVhdmphaXF5aXFqemVsZnBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MTIwNzMsImV4cCI6MjA4NzE4ODA3M30.zuNey1ADktf5reHYO8Op8z_P9fN40tvBPqRMM5lD4fE";

interface SitemapEntry {
  path: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

const today = new Date().toISOString().slice(0, 10);

const staticEntries: SitemapEntry[] = [
  { path: "/", lastmod: today, changefreq: "weekly", priority: "1.0" },
  { path: "/why-us", lastmod: today, changefreq: "monthly", priority: "0.9" },
  { path: "/faq", lastmod: today, changefreq: "monthly", priority: "0.8" },
  { path: "/install", lastmod: today, changefreq: "monthly", priority: "0.6" },
  { path: "/login", lastmod: today, changefreq: "monthly", priority: "0.5" },
  { path: "/signup", lastmod: today, changefreq: "monthly", priority: "0.7" },
  { path: "/subscription-plans", lastmod: today, changefreq: "weekly", priority: "0.8" },
  { path: "/privacy-policy", lastmod: today, changefreq: "yearly", priority: "0.3" },
  { path: "/terms-of-service", lastmod: today, changefreq: "yearly", priority: "0.3" },
  { path: "/refund-policy", lastmod: today, changefreq: "yearly", priority: "0.3" },
];

async function fetchBatches(): Promise<SitemapEntry[]> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/batches?select=slug,updated_at&is_active=eq.true`,
      { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } },
    );
    if (!res.ok) return [];
    const rows = (await res.json()) as { slug: string | null; updated_at: string | null }[];
    return rows
      .filter((r) => r.slug)
      .map((r) => ({
        path: `/batch/${r.slug}`,
        lastmod: (r.updated_at ?? today).slice(0, 10),
        changefreq: "weekly" as const,
        priority: "0.7",
      }));
  } catch (e) {
    console.warn("[sitemap] could not fetch batches:", (e as Error).message);
    return [];
  }
}

function render(entries: SitemapEntry[]): string {
  const urls = entries.map((e) =>
    [
      "  <url>",
      `    <loc>${BASE_URL}${e.path}</loc>`,
      e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
      e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
      e.priority ? `    <priority>${e.priority}</priority>` : null,
      "  </url>",
    ].filter(Boolean).join("\n"),
  );
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...urls,
    `</urlset>`,
  ].join("\n");
}

(async () => {
  const dynamic = await fetchBatches();
  const all = [...staticEntries, ...dynamic];
  writeFileSync(resolve("public/sitemap.xml"), render(all));
  console.log(`[sitemap] ${all.length} URLs written (${dynamic.length} dynamic)`);
})();
