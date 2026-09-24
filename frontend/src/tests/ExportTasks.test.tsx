import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ExportTasks } from "@/components/ExportTasks";
import { apiFetch } from "@/lib/api-client";
import type { Role } from "@/types";

vi.mock("@/lib/api-client", () => ({ apiFetch: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
function show(role: Role) {
  render(<QueryClientProvider client={new QueryClient()}>
    <ExportTasks projectId="p1" role={role} />
  </QueryClientProvider>);
}
it("hides export for viewers", () => {
  show("viewer");
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
it.each(["admin", "member"] as Role[])("exports for %s and shows partial failures", async role => {
  vi.mocked(apiFetch).mockResolvedValue({ exported: 2, failed: 1, skipped: 0,
    failures: [{ task_id: "t1", error: "INVALID_VALUE_FOR_COLUMN" }] });
  show(role);
  fireEvent.click(screen.getByRole("button"));
  expect(await screen.findByText("2 exported, 1 failed, 0 skipped.")).toBeInTheDocument();
  expect(apiFetch).toHaveBeenCalledWith("/api/projects/p1/export", { method: "POST" });
  expect(screen.getByText("t1: INVALID_VALUE_FOR_COLUMN")).toBeInTheDocument();
  expect(screen.getByRole("button")).toBeEnabled();
});
it("disables the button while waiting and displays errors", async () => {
  let rejectRequest!: (reason: Error) => void;
  vi.mocked(apiFetch).mockReturnValue(new Promise((_, reject) => { rejectRequest = reject; }));
  show("member");
  fireEvent.click(screen.getByRole("button"));
  expect(await screen.findByText("Exporting…")).toBeDisabled();
  rejectRequest(new Error("Export unavailable"));
  expect(await screen.findByRole("alert")).toHaveTextContent("Export unavailable");
});
