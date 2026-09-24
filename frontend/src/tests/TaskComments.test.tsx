import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TaskComments } from "@/components/TaskComments";
import { apiFetch } from "@/lib/api-client";

vi.mock("@/lib/api-client", () => ({ apiFetch: vi.fn() }));
const request = vi.mocked(apiFetch);
const comment = {
  id: "c1", author: { id: "u1", name: "Meera", email: "meera@example.com" },
  body: "First comment", created_at: "2026-09-24T10:00:00Z",
};

function showComments(canPost = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>
    <TaskComments taskId="t1" canPost={canPost} />
  </QueryClientProvider>);
}

afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe("task comments", () => {
  it("shows author, body and posted time in API order for viewers", async () => {
    request.mockResolvedValue({ comments: [comment, { ...comment, id: "c2", body: "Second comment" }] });
    showComments(false);
    expect(await screen.findByText("First comment")).toBeInTheDocument();
    expect(screen.getAllByText("Meera")).toHaveLength(2);
    expect(screen.getAllByRole("listitem").map(item => item.textContent)).toEqual([
      expect.stringContaining("First comment"), expect.stringContaining("Second comment"),
    ]);
    expect(document.querySelector("time")).toHaveAttribute("datetime", comment.created_at);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("posts a comment and refreshes the list", async () => {
    request.mockResolvedValueOnce({ comments: [] })
      .mockResolvedValueOnce({ comment })
      .mockResolvedValue({ comments: [comment] });
    showComments();
    await screen.findByText("no comments yet");
    expect(screen.getByRole("button", { name: "post comment" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("add a comment"), { target: { value: " First comment " } });
    fireEvent.click(screen.getByRole("button", { name: "post comment" }));
    expect(await screen.findByText("First comment")).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith("/api/tasks/t1/comments", {
      method: "POST", body: JSON.stringify({ body: "First comment" }),
    });
    expect(screen.getByLabelText("add a comment")).toHaveValue("");
  });

  it("keeps the draft and shows a posting error", async () => {
    request.mockResolvedValueOnce({ comments: [] }).mockRejectedValueOnce(new Error("forbidden"));
    showComments();
    await screen.findByText("no comments yet");
    fireEvent.change(screen.getByLabelText("add a comment"), { target: { value: "Draft" } });
    fireEvent.click(screen.getByRole("button", { name: "post comment" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("forbidden");
    expect(screen.getByLabelText("add a comment")).toHaveValue("Draft");
    await waitFor(() => expect(screen.getByRole("button", { name: "post comment" })).toBeEnabled());
  });
});
