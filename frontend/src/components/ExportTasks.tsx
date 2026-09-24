import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { Role } from "@/types";

type ExportResult = {
  attempted: number;
  exported: number;
  failed: number;
  skipped: number;
  failures: { task_id: string; error: string }[];
  error?: string;
};

export function ExportTasks({ projectId, role }: { projectId: string; role?: Role }) {
  const exportTasks = useMutation({
    mutationFn: () => apiFetch<ExportResult>(`/api/projects/${projectId}/export`, { method: "POST" }),
  });
  if (role !== "admin" && role !== "member") return null;
  return (
    <div className="text-sm max-w-md">
      <button disabled={exportTasks.isPending} onClick={() => exportTasks.mutate()}
        className="rounded-md bg-accent px-4 py-2 disabled:opacity-50">
        {exportTasks.isPending ? "Exporting…" : "Export to Airtable"}
      </button>
      {exportTasks.isPending && <p role="status">Large projects may take several minutes.</p>}
      {exportTasks.error && <p role="alert">{exportTasks.error.message}</p>}
      {exportTasks.data && !exportTasks.isPending && (
        <div role="status">
          <p>{exportTasks.data.exported} exported, {exportTasks.data.failed} failed, {exportTasks.data.skipped} skipped.</p>
          {exportTasks.data.error && <p>{exportTasks.data.error}</p>}
          {exportTasks.data.failed > 0 && <p>You can export again to retry failed tasks.</p>}
          <ul>{exportTasks.data.failures.map(failure => (
            <li key={failure.task_id}>{failure.task_id}: {failure.error}</li>
          ))}</ul>
        </div>
      )}
    </div>
  );
}
