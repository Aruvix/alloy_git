import { describe, expect, it } from "vitest";
import { defaultRemoteBaseUrl, getProviderCapabilities, isProviderValidationSupported, parseRemoteWithProviders, providerLabel } from "./registry.js";

describe("provider registry", () => {
  it("labels all first-class providers", () => {
    expect(providerLabel("github")).toBe("GitHub");
    expect(providerLabel("github-enterprise")).toBe("GitHub Enterprise");
    expect(providerLabel("gitlab")).toBe("GitLab");
    expect(providerLabel("bitbucket")).toBe("Bitbucket");
    expect(providerLabel("bitbucket-server")).toBe("Bitbucket Data Center");
    expect(providerLabel("azure-devops")).toBe("Azure DevOps");
    expect(providerLabel("azure-devops-server")).toBe("Azure DevOps Server");
    expect(providerLabel("gitea")).toBe("Gitea");
    expect(providerLabel("forgejo")).toBe("Forgejo");
    expect(providerLabel("custom")).toBe("Custom Git Server");
  });

  it("captures provider capability defaults", () => {
    expect(defaultRemoteBaseUrl("github")).toBe("https://github.com");
    expect(getProviderCapabilities("github-enterprise").serverUrlRequired).toBe(true);
    expect(getProviderCapabilities("bitbucket-server").supportsSelfHosted).toBe(true);
    expect(getProviderCapabilities("azure-devops").requiredScopes).toContain("vso.code");
  });

  it("keeps self-hosted validation behind server URLs", () => {
    expect(defaultRemoteBaseUrl("gitea")).toBe("");
    expect(isProviderValidationSupported("gitea", "")).toBe(false);
    expect(isProviderValidationSupported("gitea", "https://git.example.com")).toBe(true);
    expect(isProviderValidationSupported("github-enterprise", "")).toBe(false);
    expect(isProviderValidationSupported("github-enterprise", "https://github.company.test")).toBe(true);
  });

  it("parses remotes against configured accounts before cloud defaults", () => {
    expect(parseRemoteWithProviders("git@github.com:alloy/app.git", [])).toMatchObject({
      provider: "github",
      repoFullName: "alloy/app",
    });
    expect(parseRemoteWithProviders("https://git.company.test/platform/app.git", [
      { provider: "github-enterprise", remoteBaseUrl: "https://git.company.test" },
    ])).toMatchObject({
      provider: "github-enterprise",
      remoteBaseUrl: "https://git.company.test",
      repoFullName: "platform/app",
    });
    expect(parseRemoteWithProviders("https://dev.azure.com/acme/Project/_git/App", [])).toMatchObject({
      provider: "azure-devops",
      repoFullName: "Project/App",
    });
    expect(parseRemoteWithProviders("git@ssh.dev.azure.com:v3/acme/Project/App", [])).toMatchObject({
      provider: "azure-devops",
      repoFullName: "Project/App",
    });
  });
});
