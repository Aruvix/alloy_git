<script setup lang="ts">
import { useUiStore } from "../../stores/uiStore.js";
import type { ThemeName } from "../../stores/uiStore.js";

const uiStore = useUiStore();

type ThemeOption = {
  value: ThemeName;
  label: string;
  description: string;
  mode: "light" | "dark";
  preview: { bg: string; sidebar: string; accent: string; added: string; deleted: string; text: string };
};

const themes: ThemeOption[] = [
  {
    value: "alloy-light",
    label: "Alloy Light",
    description: "Clean, modern and professional light theme.",
    mode: "light",
    preview: { bg: "#F7F8FA", sidebar: "#FFFFFF", accent: "#2563EB", added: "#16A34A", deleted: "#DC2626", text: "#1F2328" },
  },
  {
    value: "alloy-dark",
    label: "Alloy Dark",
    description: "Balanced dark theme for everyday use.",
    mode: "dark",
    preview: { bg: "#0D1117", sidebar: "#161B22", accent: "#3B82F6", added: "#22C55E", deleted: "#EF4444", text: "#E6EDF3" },
  },
  {
    value: "graphite",
    label: "Graphite",
    description: "High contrast dark theme for deep focus.",
    mode: "dark",
    preview: { bg: "#111111", sidebar: "#1A1A1A", accent: "#A3A3A3", added: "#22C55E", deleted: "#EF4444", text: "#F3F4F6" },
  },
  {
    value: "midnight-blue",
    label: "Midnight Blue",
    description: "Cool blue tones for developer workflows.",
    mode: "dark",
    preview: { bg: "#0B1020", sidebar: "#121A2E", accent: "#60A5FA", added: "#22C55E", deleted: "#F43F5E", text: "#E5E7EB" },
  },
  {
    value: "warm-paper",
    label: "Warm Paper",
    description: "Warm light theme for comfortable reading.",
    mode: "light",
    preview: { bg: "#FAF7F0", sidebar: "#FFFFFF", accent: "#C2410C", added: "#15803D", deleted: "#B91C1C", text: "#2B2B2B" },
  },
];
</script>

<template>
  <div class="appearance">

    <div class="section-title">Color Themes</div>
    <p class="section-desc">Curated enterprise themes for focused experience.</p>

    <div class="theme-grid">
      <button
        v-for="theme in themes"
        :key="theme.value"
        class="theme-card"
        :class="{ active: uiStore.themeName === theme.value }"
        @click="uiStore.themeName = theme.value"
      >
        <!-- Mini preview -->
        <div class="preview" :style="{ background: theme.preview.bg }">
          <div class="preview-sidebar" :style="{ background: theme.preview.sidebar }">
            <div class="preview-bar" :style="{ background: theme.preview.accent + '88' }" />
            <div class="preview-bar sm" :style="{ background: theme.preview.text + '33' }" />
            <div class="preview-bar sm" :style="{ background: theme.preview.text + '22' }" />
            <div class="preview-bar sm" :style="{ background: theme.preview.text + '22' }" />
          </div>
          <div class="preview-main">
            <div class="preview-topbar" :style="{ background: theme.preview.sidebar, borderBottom: `1px solid ${theme.preview.text}18` }">
              <div class="preview-dot" :style="{ background: theme.preview.accent }" />
            </div>
            <div class="preview-content">
              <div class="preview-line" :style="{ background: theme.preview.accent, width: '55%' }" />
              <div class="preview-line" :style="{ background: theme.preview.added, width: '38%' }" />
              <div class="preview-line" :style="{ background: theme.preview.deleted, width: '28%' }" />
              <div class="preview-line" :style="{ background: theme.preview.text + '40', width: '45%' }" />
            </div>
          </div>
        </div>

        <!-- Card footer -->
        <div class="theme-footer">
          <div class="theme-info">
            <span class="theme-name">{{ theme.label }}</span>
            <span class="theme-mode" :class="theme.mode">{{ theme.mode }}</span>
          </div>
          <svg v-if="uiStore.themeName === theme.value" class="check-icon" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="6.5" fill="currentColor" opacity="0.15"/>
            <path d="M4 7l2 2 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="theme-desc">{{ theme.description }}</div>
      </button>
    </div>

    <!-- Current palette -->
    <div class="palette-section">
      <div class="section-title small">Current Palette</div>
      <div class="palette">
        <div v-for="[name, val] in [
          ['Background', 'var(--surface-0)'],
          ['Surface', 'var(--surface-1)'],
          ['Border', 'var(--border)'],
          ['Text', 'var(--text)'],
          ['Muted', 'var(--text-muted)'],
          ['Primary', 'var(--accent)'],
          ['Success', 'var(--added)'],
          ['Warning', 'var(--modified)'],
          ['Danger', 'var(--deleted)'],
        ]" :key="name" class="palette-item">
          <div class="palette-swatch" :style="{ background: val }" />
          <span class="palette-name">{{ name }}</span>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.appearance {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 640px;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}
.section-title.small {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--text-muted);
}
.section-desc {
  margin: -10px 0 0;
  font-size: 12px;
  color: var(--text-muted);
}

/* ── Theme grid ── */
.theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}

.theme-card {
  display: flex;
  flex-direction: column;
  border: 1.5px solid var(--border);
  border-radius: 10px;
  background: var(--surface-1);
  cursor: pointer;
  font-family: inherit;
  padding: 0;
  overflow: hidden;
  transition: border-color 120ms, box-shadow 120ms;
  text-align: left;
}
.theme-card:hover { border-color: var(--text-subtle); }
.theme-card.active {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-subtle);
}

/* Mini preview */
.preview {
  display: flex;
  height: 88px;
  overflow: hidden;
}
.preview-sidebar {
  width: 36px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 6px;
  border-right: 1px solid rgba(0,0,0,0.08);
}
.preview-bar {
  height: 5px;
  border-radius: 2px;
  width: 100%;
}
.preview-bar.sm { opacity: 0.5; }
.preview-main {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.preview-topbar {
  height: 14px;
  display: flex;
  align-items: center;
  padding: 0 6px;
  flex-shrink: 0;
}
.preview-dot {
  width: 16px;
  height: 4px;
  border-radius: 2px;
  opacity: 0.8;
}
.preview-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 8px 8px;
}
.preview-line {
  height: 4px;
  border-radius: 2px;
}

/* Card footer */
.theme-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px 4px;
  border-top: 1px solid var(--border);
}
.theme-info {
  display: flex;
  align-items: center;
  gap: 6px;
}
.theme-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}
.theme-mode {
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 1px 5px;
  border-radius: 3px;
}
.theme-mode.light { background: rgba(255,200,0,0.15); color: #b45309; }
.theme-mode.dark { background: rgba(100,100,200,0.15); color: var(--accent); }
.theme-desc {
  font-size: 11px;
  color: var(--text-muted);
  padding: 2px 12px 12px;
  line-height: 1.4;
}
.check-icon {
  width: 16px;
  height: 16px;
  color: var(--accent);
  flex-shrink: 0;
}

/* Palette */
.palette-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-1);
}
.palette {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.palette-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
}
.palette-swatch {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid var(--border);
}
.palette-name {
  font-size: 9px;
  color: var(--text-muted);
  text-align: center;
}
</style>
