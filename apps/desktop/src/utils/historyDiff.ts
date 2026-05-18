export type CommitFileStatus = "added" | "deleted" | "modified" | "renamed" | "binary";

export interface CommitFile {
  path: string;
  oldPath?: string;
  status: CommitFileStatus;
  diff: string;
  added: number;
  deleted: number;
}

export function buildCommitFiles(changedFiles: string[], rawDiff: string): CommitFile[] {
  const files = parseDiffFiles(rawDiff);
  const byPath = new Map(files.map((file) => [file.path, file]));

  for (const path of changedFiles) {
    if (!path.trim() || byPath.has(path)) continue;
    const file: CommitFile = { path, status: "modified", diff: "", added: 0, deleted: 0 };
    files.push(file);
    byPath.set(path, file);
  }

  return files;
}

export function parseDiffFiles(rawDiff: string): CommitFile[] {
  const chunks = rawDiff.split(/(?=^diff --git )/m);
  return chunks
    .filter((chunk) => chunk.startsWith("diff --git "))
    .map(parseDiffChunk);
}

function parseDiffChunk(chunk: string): CommitFile {
  const header = parseDiffHeader(chunk);
  const deletedPath = chunk.match(/^--- a\/(.+)$/m)?.[1];
  const addedPath = chunk.match(/^\+\+\+ b\/(.+)$/m)?.[1];
  const renameFrom = chunk.match(/^rename from (.+)$/m)?.[1];
  const renameTo = chunk.match(/^rename to (.+)$/m)?.[1];

  const oldPath = unquote(renameFrom ?? header?.[0] ?? deletedPath ?? "");
  const path = unquote(renameTo ?? addedPath ?? header?.[1] ?? oldPath) || "unknown";
  const isBinary = /^Binary files /m.test(chunk) || /^GIT binary patch/m.test(chunk);

  let status: CommitFileStatus = "modified";
  if (isBinary) status = "binary";
  else if (/^new file mode/m.test(chunk)) status = "added";
  else if (/^deleted file mode/m.test(chunk)) status = "deleted";
  else if (/^rename from /m.test(chunk) || /^rename to /m.test(chunk)) status = "renamed";

  let added = 0;
  let deleted = 0;
  for (const line of chunk.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) added++;
    else if (line.startsWith("-") && !line.startsWith("---")) deleted++;
  }

  return {
    path,
    oldPath: status === "renamed" && oldPath && oldPath !== path ? oldPath : undefined,
    status,
    diff: chunk,
    added,
    deleted,
  };
}

function parseDiffHeader(chunk: string): [string, string] | null {
  const line = chunk.split("\n")[0] ?? "";
  if (!line.startsWith("diff --git ")) return null;
  const body = line.slice("diff --git ".length);
  if (body.startsWith("a/")) {
    const separator = body.lastIndexOf(" b/");
    if (separator > -1) {
      return [body.slice(2, separator), body.slice(separator + 3)];
    }
  }
  const quoted = body.match(/^"a\/(.+)" "b\/(.+)"$/);
  return quoted ? [unquote(quoted[1]), unquote(quoted[2])] : null;
}

function unquote(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
    return trimmed.slice(1, -1).replace(/\\"/g, "\"");
  }
  return trimmed;
}
