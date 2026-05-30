import { createFileRoute } from "@tanstack/react-router";
import { PapersAdmin } from "@/components/admin/papers-admin";

export const Route = createFileRoute("/admin/papers")({
  component: PapersAdmin,
});
