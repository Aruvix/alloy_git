import type { GitProvider } from "@alloy/git-core";
import type { ParsedGitRemote } from "../types.js";

export function normalizeBaseUrl(value: string | undefined, fallback: string): string {
  return (value?.trim() || fallback).replace(/\/+$/, "");
}

export function apiBaseUrl(baseUrl: string, suffix: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${suffix}`;
}

export function parseHostedRemote(
  remoteUrl: string,
  provider: GitProvider,
  defaultBaseUrl: string,
  remoteBaseUrl?: string,
): ParsedGitRemote | null {
  const base = normalizeBaseUrl(remoteBaseUrl, defaultBaseUrl);
  if (!base) return null;
  const host = hostFromUrl(base);
  if (!host) return null;
  const path = pathForHost(remoteUrl, host);
  if (!path) return null;
  const clean = path.replace(/^\/+/, "").replace(/\.git$/, "");
  const parts = clean.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const repoName = parts[parts.length - 1];
  const owner = parts.slice(0, -1).join("/");
  return {
    provider,
    remoteBaseUrl: base,
    owner,
    repoName,
    repoFullName: `${owner}/${repoName}`,
  };
}

export function parseAzureRemote(
  remoteUrl: string,
  provider: GitProvider,
  remoteBaseUrl?: string,
): ParsedGitRemote | null {
  const base = normalizeBaseUrl(remoteBaseUrl, "");
  const host = base ? hostFromUrl(base) : undefined;
  const path = pathForKnownHost(remoteUrl, host, (candidate) =>
    candidate === "dev.azure.com" || candidate === "ssh.dev.azure.com" || candidate.endsWith(".visualstudio.com"),
  );
  if (!path) return null;
  const parts = path.replace(/^\/+/, "").replace(/\.git$/, "").split("/").filter(Boolean);
  if (parts.length < 2) return null;
  if (parts[0] === "v3" && parts.length >= 4) {
    const project = parts[2];
    const repoName = parts[3];
    return {
      provider,
      remoteBaseUrl: base || undefined,
      owner: project,
      repoName,
      repoFullName: `${project}/${repoName}`,
    };
  }
  if (parts[0] === "_git" && parts.length >= 2) {
    const repoName = parts[1];
    return { provider, remoteBaseUrl: base || undefined, owner: "", repoName, repoFullName: repoName };
  }
  const gitIndex = parts.indexOf("_git");
  if (gitIndex <= 0 || !parts[gitIndex + 1]) return null;
  const project = parts[gitIndex - 1];
  const repoName = parts[gitIndex + 1];
  return {
    provider,
    remoteBaseUrl: base || undefined,
    owner: project,
    repoName,
    repoFullName: `${project}/${repoName}`,
  };
}

function pathForHost(remoteUrl: string, host: string): string {
  return pathForKnownHost(remoteUrl, host, (candidate) => candidate === host);
}

function pathForKnownHost(
  remoteUrl: string,
  host: string | undefined,
  acceptsHost: (candidate: string) => boolean,
): string {
  const trimmed = remoteUrl.trim();
  try {
    const url = new URL(trimmed);
    if (host && url.hostname !== host) return "";
    if (!host && !acceptsHost(url.hostname)) return "";
    return url.pathname;
  } catch {
    const scpLike = trimmed.match(/^(?:[^@]+@)?([^:]+):(.+)$/);
    if (!scpLike) return "";
    if (host && scpLike[1] !== host) return "";
    if (!host && !acceptsHost(scpLike[1])) return "";
    return scpLike[2];
  }
}

function hostFromUrl(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
}
