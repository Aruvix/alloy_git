<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  diff: string;
  filePath?: string;
}>();

interface DiffLine {
  type: "hunk" | "added" | "deleted" | "context";
  content: string;
  oldNo: number | null;
  newNo: number | null;
}

interface DiffSection {
  filePath: string;
  lines: DiffLine[];
}

const sections = computed<DiffSection[]>(() => {
  if (!props.diff) return [];

  const rawLines = props.diff.split("\n");
  const result: DiffSection[] = [];
  let current: DiffSection | null = null;
  let oldNo = 0;
  let newNo = 0;
  let inHunk = false;

  for (const raw of rawLines) {
    if (raw.startsWith("diff --git ")) {
      const m = raw.match(/^diff --git a\/.+ b\/(.+)$/);
      const filePath = m ? m[1] : raw;
      oldNo = 0;
      newNo = 0;
      inHunk = false;
      current = { filePath, lines: [] };
      result.push(current);
      continue;
    }

    // skip any leading lines before the first diff --git (e.g. blank line from git show --format=)
    if (!current) continue;

    if (
      raw.startsWith("index ") ||
      raw.startsWith("--- ") ||
      raw.startsWith("+++ ") ||
      raw.startsWith("new file") ||
      raw.startsWith("deleted file") ||
      raw.startsWith("rename ")
    ) {
      continue;
    }

    if (raw.startsWith("@@")) {
      const m = raw.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (m) {
        oldNo = parseInt(m[1], 10);
        newNo = parseInt(m[2], 10);
      }
      inHunk = true;
      current.lines.push({ type: "hunk", content: raw, oldNo: null, newNo: null });
      continue;
    }

    if (!inHunk || raw.startsWith("\\ No newline at end of file")) continue;

    if (raw.startsWith("+")) {
      current.lines.push({ type: "added", content: raw.slice(1), oldNo: null, newNo: newNo++ });
    } else if (raw.startsWith("-")) {
      current.lines.push({ type: "deleted", content: raw.slice(1), oldNo: oldNo++, newNo: null });
    } else {
      const content = raw.startsWith(" ") ? raw.slice(1) : raw;
      current.lines.push({ type: "context", content, oldNo: oldNo++, newNo: newNo++ });
    }
  }

  return result;
});
</script>

<template>
  <div class="diff-viewer">
    <div class="diff-content">
      <div v-if="!diff" class="diff-empty">No diff available</div>
      <template v-else>
        <template v-for="(section, sIdx) in sections" :key="sIdx">
          <div class="diff-file-header">
            <span class="diff-filename">{{ section.filePath }}</span>
          </div>
          <div class="diff-table">
            <div
              v-for="(line, lIdx) in section.lines"
              :key="lIdx"
              class="diff-line"
              :class="line.type"
            >
              <span class="ln old">{{ line.oldNo ?? '' }}</span>
              <span class="ln new">{{ line.newNo ?? '' }}</span>
              <span class="sign">
                <template v-if="line.type === 'added'">+</template>
                <template v-else-if="line.type === 'deleted'">-</template>
              </span>
              <span class="code">{{ line.content }}</span>
            </div>
          </div>
        </template>
      </template>
    </div>
  </div>
</template>

<style scoped>
.diff-viewer {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--surface-0);
}

.diff-content {
  flex: 1;
  overflow: auto;
}
.diff-empty {
  padding: 24px;
  text-align: center;
  color: var(--text-subtle);
  font-size: 12px;
}

/* Per-file section header */
.diff-file-header {
  padding: 5px 12px;
  background: var(--surface-1);
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  font-size: 11px;
  color: var(--text-muted);
  font-family: var(--font-mono);
  flex-shrink: 0;
  position: sticky;
  top: 0;
  z-index: 1;
}
.diff-file-header .diff-filename { color: var(--text); }

/* ── Table layout ── */
.diff-table {
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.6;
  min-width: 100%;
}

.diff-line {
  display: flex;
  align-items: stretch;
  white-space: pre;
  min-width: 0;
}

/* Line number columns */
.ln {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 44px;
  padding: 0 8px;
  font-size: 11px;
  color: var(--text-subtle);
  user-select: none;
  border-right: 1px solid var(--border);
  flex-shrink: 0;
}
.ln.old { background: var(--surface-1); }
.ln.new { background: var(--surface-1); margin-right: 0; }

/* Sign column (+/-) */
.sign {
  width: 18px;
  flex-shrink: 0;
  text-align: center;
  user-select: none;
  font-size: 12px;
  padding: 0 2px;
}

/* Code content */
.code {
  flex: 1;
  padding: 0 12px;
  overflow: hidden;
}

/* ── Line type colours ── */
.diff-line.added {
  background: rgba(63, 185, 80, 0.08);
}
.diff-line.added .ln {
  background: rgba(63, 185, 80, 0.06);
  color: var(--added);
}
.diff-line.added .sign { color: var(--added); }

.diff-line.deleted {
  background: rgba(248, 81, 73, 0.08);
}
.diff-line.deleted .ln {
  background: rgba(248, 81, 73, 0.06);
  color: var(--deleted);
}
.diff-line.deleted .sign { color: var(--deleted); }

.diff-line.hunk {
  background: rgba(79, 142, 247, 0.06);
  color: var(--accent);
}
.diff-line.hunk .ln { color: var(--text-subtle); }

</style>
