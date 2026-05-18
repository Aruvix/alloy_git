const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

const DIVISIONS: Array<{ amount: number; name: Intl.RelativeTimeFormatUnit }> = [
  { amount: 60, name: "seconds" },
  { amount: 60, name: "minutes" },
  { amount: 24, name: "hours" },
  { amount: 7, name: "days" },
  { amount: 4.34524, name: "weeks" },
  { amount: 12, name: "months" },
  { amount: Number.POSITIVE_INFINITY, name: "years" },
];

export function timeAgo(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  let duration = (d.getTime() - Date.now()) / 1000;
  for (const division of DIVISIONS) {
    if (Math.abs(duration) < division.amount) {
      return rtf.format(Math.round(duration), division.name);
    }
    duration /= division.amount;
  }
  return d.toLocaleDateString();
}

export function shortHash(hash: string): string {
  return hash.slice(0, 7);
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export function dirname(path: string): string {
  const parts = path.split(/[\\/]/);
  parts.pop();
  return parts.join("/") || ".";
}

export function extname(path: string): string {
  const name = basename(path);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot) : "";
}
