import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { ApiTaskComment } from "@/types";

export function TaskComments({ taskId, canPost }: { taskId: string; canPost: boolean }) {
  const [body, setBody] = useState("");
  const queryClient = useQueryClient();
  const queryKey = ["task-comments", taskId];
  const { data, isPending, error } = useQuery({
    queryKey,
    queryFn: () => apiFetch<{ comments: ApiTaskComment[] }>(`/api/tasks/${taskId}/comments`),
  });
  const postComment = useMutation({
    mutationFn: () => apiFetch<{ comment: ApiTaskComment }>(`/api/tasks/${taskId}/comments`, {
      method: "POST",
      body: JSON.stringify({ body: body.trim() }),
    }),
    onSuccess: () => {
      setBody("");
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return (
    <section className="border-t border-border pt-4 mb-4" aria-label="Task comments">
      <h3 className="font-medium mb-3">comments</h3>
      {isPending && <p>loading comments…</p>}
      {error && <p role="alert">{error.message}</p>}
      {data?.comments.length === 0 && <p className="text-sm text-muted">no comments yet</p>}
      <ol className="space-y-3 mb-3">
        {data?.comments.map((comment) => (
          <li key={comment.id} className="text-sm">
            <span className="font-medium">{comment.author.name}</span>{" "}
            <time dateTime={comment.created_at} className="text-xs text-muted">
              {new Date(comment.created_at).toLocaleString()}
            </time>
            <p className="whitespace-pre-wrap break-words">{comment.body}</p>
          </li>
        ))}
      </ol>
      {canPost && (
        <form onSubmit={(event) => {
          event.preventDefault();
          if (body.trim() && !postComment.isPending) postComment.mutate();
        }}>
          <label className="block text-sm">
            add a comment
            <textarea value={body} onChange={(event) => setBody(event.target.value)}
              disabled={postComment.isPending} rows={3}
              className="block w-full mt-1 mb-2 rounded-md bg-bg border border-border p-2" />
          </label>
          <button type="submit" disabled={!body.trim() || postComment.isPending}
            className="rounded-md bg-accent px-3 py-2 text-sm disabled:opacity-50">
            {postComment.isPending ? "posting…" : "post comment"}
          </button>
          {postComment.error && <p role="alert">{postComment.error.message}</p>}
        </form>
      )}
    </section>
  );
}
