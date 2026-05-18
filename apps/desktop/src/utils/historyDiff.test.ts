import { describe, expect, it } from "vitest";
import { buildCommitFiles, parseDiffFiles } from "./historyDiff.js";

describe("history diff parsing", () => {
  it("parses added, modified, deleted, renamed, and binary files", () => {
    const files = parseDiffFiles(`diff --git a/src/app.ts b/src/app.ts
index 111..222 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1 +1,2 @@
-old
+new
+line
diff --git a/new file.txt b/new file.txt
new file mode 100644
--- /dev/null
+++ b/new file.txt
@@ -0,0 +1 @@
+hello
diff --git a/dead.txt b/dead.txt
deleted file mode 100644
--- a/dead.txt
+++ /dev/null
@@ -1 +0,0 @@
-bye
diff --git a/old name.ts b/new name.ts
similarity index 95%
rename from old name.ts
rename to new name.ts
diff --git a/image.png b/image.png
Binary files a/image.png and b/image.png differ
`);

    expect(files.map((file) => [file.path, file.oldPath, file.status, file.added, file.deleted])).toEqual([
      ["src/app.ts", undefined, "modified", 2, 1],
      ["new file.txt", undefined, "added", 1, 0],
      ["dead.txt", undefined, "deleted", 0, 1],
      ["new name.ts", "old name.ts", "renamed", 0, 0],
      ["image.png", undefined, "binary", 0, 0],
    ]);
  });

  it("uses changed file metadata when a patch chunk is unavailable", () => {
    const files = buildCommitFiles(["README.md", "docs/guide.md"], "");
    expect(files).toEqual([
      { path: "README.md", status: "modified", diff: "", added: 0, deleted: 0 },
      { path: "docs/guide.md", status: "modified", diff: "", added: 0, deleted: 0 },
    ]);
  });

  it("keeps parsed diff data and appends missing metadata files", () => {
    const files = buildCommitFiles(["src/app.ts", "package.json"], `diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -1 +1 @@
-old
+new
`);
    expect(files.map((file) => [file.path, file.status, file.added, file.deleted])).toEqual([
      ["src/app.ts", "modified", 1, 1],
      ["package.json", "modified", 0, 0],
    ]);
  });
});
