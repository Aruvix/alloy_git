import { beforeEach, describe, expect, it, vi } from "vitest";
import { AzureDevOpsProviderClient } from "./azure.js";
import { BitbucketProviderClient } from "./bitbucket.js";
import { GitHubProviderClient } from "./github.js";
import { GitLabProviderClient } from "./gitlab.js";
import { GiteaProviderClient } from "./gitea.js";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("provider clients", () => {
  it("maps GitHub repositories with https, ssh, web, owner, and update metadata", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([
      {
        id: 1,
        name: "app",
        full_name: "alloy/app",
        clone_url: "https://github.com/alloy/app.git",
        ssh_url: "git@github.com:alloy/app.git",
        html_url: "https://github.com/alloy/app",
        private: false,
        default_branch: "main",
        updated_at: "2026-05-01T00:00:00Z",
        owner: { login: "alloy" },
      },
    ]));

    await expect(new GitHubProviderClient().listRepositories({ authType: "pat", token: "token" })).resolves.toEqual([
      expect.objectContaining({
        provider: "github",
        repoFullName: "alloy/app",
        owner: "alloy",
        remoteUrl: "https://github.com/alloy/app.git",
        sshRemoteUrl: "git@github.com:alloy/app.git",
        webUrl: "https://github.com/alloy/app",
        updatedAt: "2026-05-01T00:00:00Z",
      }),
    ]);
  });

  it("maps GitLab repositories and parses self-hosted remotes", async () => {
    fetchMock.mockResolvedValueOnce(headerResponse([
      {
        id: 2,
        name: "app",
        path: "app",
        path_with_namespace: "platform/app",
        http_url_to_repo: "https://gitlab.example.com/platform/app.git",
        ssh_url_to_repo: "git@gitlab.example.com:platform/app.git",
        web_url: "https://gitlab.example.com/platform/app",
        default_branch: "main",
        visibility: "private",
        last_activity_at: "2026-05-02T00:00:00Z",
      },
    ]));

    const client = new GitLabProviderClient("https://gitlab.example.com", "custom");
    const repos = await client.listRepositories({ authType: "pat", token: "token" });
    expect(repos[0]).toMatchObject({
      provider: "custom",
      repoFullName: "platform/app",
      visibility: "private",
      sshRemoteUrl: "git@gitlab.example.com:platform/app.git",
    });
    expect(client.parseRemoteUrl("git@gitlab.example.com:platform/app.git")).toMatchObject({
      provider: "custom",
      repoFullName: "platform/app",
    });
  });

  it("maps Bitbucket Cloud repositories", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ values: [{ slug: "team" }] }))
      .mockResolvedValueOnce(jsonResponse({ values: [{
        uuid: "{repo-1}",
        name: "App",
        slug: "app",
        full_name: "team/app",
        is_private: true,
        mainbranch: { name: "main" },
        updated_on: "2026-05-03T00:00:00Z",
        links: {
          clone: [
            { name: "https", href: "https://bitbucket.org/team/app.git" },
            { name: "ssh", href: "git@bitbucket.org:team/app.git" },
          ],
          html: { href: "https://bitbucket.org/team/app" },
        },
      }] }));

    const repos = await new BitbucketProviderClient().listRepositories({ authType: "pat", token: "token" });
    expect(repos[0]).toMatchObject({
      provider: "bitbucket",
      repoFullName: "team/app",
      remoteUrl: "https://bitbucket.org/team/app.git",
      sshRemoteUrl: "git@bitbucket.org:team/app.git",
      visibility: "private",
    });
  });

  it("maps Azure DevOps repositories", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ value: [{ id: "project-1", name: "Project" }] }))
      .mockResolvedValueOnce(jsonResponse({ value: [{
        id: "repo-1",
        name: "App",
        remoteUrl: "https://dev.azure.com/acme/Project/_git/App",
        sshUrl: "git@ssh.dev.azure.com:v3/acme/Project/App",
        webUrl: "https://dev.azure.com/acme/Project/_git/App",
        defaultBranch: "refs/heads/main",
        project: { name: "Project" },
      }] }));

    const repos = await new AzureDevOpsProviderClient().listRepositories({
      authType: "pat",
      token: "token",
      remoteBaseUrl: "https://dev.azure.com/acme",
    });
    expect(repos[0]).toMatchObject({
      provider: "azure-devops",
      repoFullName: "Project/App",
      defaultBranch: "main",
      sshRemoteUrl: "git@ssh.dev.azure.com:v3/acme/Project/App",
    });
  });

  it("maps Gitea and Forgejo repositories through the shared API", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [{
      id: 1,
      name: "app",
      full_name: "team/app",
      clone_url: "https://forgejo.example.com/team/app.git",
      ssh_url: "git@forgejo.example.com:team/app.git",
      html_url: "https://forgejo.example.com/team/app",
      private: false,
      default_branch: "main",
      owner: { login: "team" },
    }] })).mockResolvedValueOnce(jsonResponse({ data: [] }));

    const repos = await new GiteaProviderClient("https://forgejo.example.com", "forgejo").listRepositories({
      authType: "pat",
      token: "token",
    });
    expect(repos[0]).toMatchObject({
      provider: "forgejo",
      repoFullName: "team/app",
      owner: "team",
      sshRemoteUrl: "git@forgejo.example.com:team/app.git",
    });
  });
});

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => body,
  } as Response;
}

function headerResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => body,
  } as Response;
}
