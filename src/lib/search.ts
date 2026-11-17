/**
 * Finding tasks by what people remember about them: words from the title,
 * the key ("SW-4"), the description, notes, checklist items, the group it is
 * for, or the name of someone on it. Every word typed has to appear
 * somewhere, in any order and any case, so "wheel kai" finds Kai's wheel
 * tasks.
 */
import type { TaskView } from "./project";

/** Lower case, accents and extra spaces dropped: "Café  CAD" -> "cafe cad". */
export function normaliseForSearch(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** The words of a search, or none for an empty one. */
export function searchTerms(query: string): string[] {
  return normaliseForSearch(query).split(" ").filter(Boolean);
}

type Searchable = Pick<TaskView, "key" | "title" | "description" | "notes" | "ownerLabel" | "assigneeIds" | "subtasks">;

/** Everything a search can match in a task, as one string. */
export function searchText(task: Searchable, memberName: (id: string) => string | undefined): string {
  return normaliseForSearch(
    [
      task.key,
      task.title,
      task.description ?? "",
      task.notes ?? "",
      task.ownerLabel ?? "",
      ...task.assigneeIds.map((id) => memberName(id) ?? ""),
      ...task.subtasks.map((item) => item.title),
    ].join(" \n "),
  );
}

/** A test for whether a task matches every word of the search. */
export function taskMatcher(
  query: string,
  memberName: (id: string) => string | undefined,
): ((task: Searchable) => boolean) | null {
  const terms = searchTerms(query);
  if (terms.length === 0) return null;
  return (task) => {
    const text = searchText(task, memberName);
    return terms.every((term) => text.includes(term));
  };
}
