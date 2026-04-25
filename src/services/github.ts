const TOKEN = process.env.EXPO_PUBLIC_GITHUB_TOKEN || '';

export interface PullRequest {
  number: number;
  title: string;
  body: string | null;
  user: { login: string; avatar_url: string };
  created_at: string;
  additions?: number;
  deletions?: number;
  changed_files?: number;
  html_url: string;
  state: string;
  draft?: boolean;
  base: { ref: string };
  head: { ref: string };
}

export interface PRFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

const headers = (): Record<string, string> => ({
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
});

export async function fetchPullRequests(
  owner: string,
  repo: string,
): Promise<PullRequest[]> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls?state=open&per_page=30`,
    { headers: headers() },
  );

  if (res.status === 404) return [];
  if (res.status === 401) throw new Error('Bad GitHub token. Check .env');
  if (res.status === 403) {
    throw new Error('Rate limited or forbidden. Add a GitHub token in .env');
  }
  if (!res.ok) throw new Error(`GitHub error: ${res.status}`);

  const list: PullRequest[] = await res.json();

  const hydrated = await Promise.all(
    list.map(async (pr) => {
      try {
        const detailRes = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/pulls/${pr.number}`,
          { headers: headers() },
        );
        if (!detailRes.ok) return pr;
        const detail: PullRequest = await detailRes.json();
        return { ...pr, ...detail };
      } catch {
        return pr;
      }
    }),
  );

  return hydrated;
}

export async function fetchPRFiles(
  owner: string,
  repo: string,
  number: number,
): Promise<PRFile[]> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${number}/files?per_page=30`,
    { headers: headers() },
  );
  if (!res.ok) throw new Error(`GitHub error: ${res.status}`);
  return res.json();
}

export async function approvePR(
  owner: string,
  repo: string,
  number: number,
): Promise<void> {
  if (!TOKEN) throw new Error('No GITHUB_TOKEN — cannot approve');

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${number}/reviews`,
    {
      method: 'POST',
      headers: { ...headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'APPROVE',
        body: '👍 LGTM (via Nightmare)',
      }),
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Approve failed (${res.status}): ${text.slice(0, 80)}`);
  }
}
