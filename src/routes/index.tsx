import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "JEEnie" },
      { name: "description", content: "JEEnie — a fresh start." },
      { property: "og:title", content: "JEEnie" },
      { property: "og:description", content: "JEEnie — a fresh start." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <h1 className="text-5xl font-bold tracking-tight">JEEnie</h1>
    </div>
  );
}
