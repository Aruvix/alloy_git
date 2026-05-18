<script setup lang="ts">
import { ref } from "vue";

const props = defineProps<{ min?: number; max?: number }>();
const emit = defineEmits<{ (e: "resize-end", width: number): void }>();

const el = ref<HTMLElement | null>(null);
const dragging = ref(false);

function startResize(e: PointerEvent) {
  const splitter = el.value;
  if (!splitter) return;

  // The panel to resize is always the element immediately before the splitter
  const panelEl = splitter.previousElementSibling as HTMLElement | null;
  if (!panelEl) return;
  const panel = panelEl as HTMLElement;

  const startX = e.clientX;
  const startW = panel.getBoundingClientRect().width;

  // Pointer capture: all pointermove/pointerup fire on splitter even if mouse leaves
  splitter.setPointerCapture(e.pointerId);
  dragging.value = true;
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";

  function onMove(ev: PointerEvent) {
    const next = Math.max(
      props.min ?? 100,
      Math.min(props.max ?? 800, startW + ev.clientX - startX),
    );
    panel.style.width = next + "px";
  }

  function onUp() {
    dragging.value = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    emit("resize-end", panel.getBoundingClientRect().width);
    (splitter as HTMLElement).removeEventListener("pointermove", onMove);
    (splitter as HTMLElement).removeEventListener("pointerup", onUp);
  }

  splitter.addEventListener("pointermove", onMove);
  splitter.addEventListener("pointerup", onUp);
}
</script>

<template>
  <div
    ref="el"
    class="splitter"
    :class="{ dragging }"
    @pointerdown.prevent="startResize"
  >
    <div class="handle">
      <span class="dot" />
      <span class="dot" />
      <span class="dot" />
    </div>
  </div>
</template>

<style scoped>
.splitter {
  width: 5px;
  flex-shrink: 0;
  cursor: col-resize;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  touch-action: none;
  z-index: 1;
}

/* The visible 1px line — sits centered in the 5px hit area */
.splitter::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 2px;
  width: 1px;
  background: var(--border);
  transition: background 150ms ease, width 150ms ease, left 150ms ease;
}

/* Widen the hit area */
.splitter::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: -4px;
  right: -4px;
}

.splitter:hover::after {
  background: var(--text-subtle);
}

.splitter.dragging::after {
  left: 1px;
  width: 3px;
  background: var(--accent);
}

.handle {
  display: flex;
  flex-direction: column;
  gap: 3px;
  pointer-events: none;
  opacity: 0;
  transition: opacity 150ms ease;
  position: relative;
  z-index: 1;
}

.splitter.dragging .handle {
  opacity: 1;
}

.dot {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--accent);
  display: block;
}
</style>
