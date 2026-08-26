import type { Page, TestInfo } from '@playwright/test';

export interface PageIssues {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
}

const IGNORED = [
  'favicon',
  'ResizeObserver loop',
  'Download the React DevTools',
  'mixpanel',
  'sentry',
  'chrome-extension',
  'net::ERR_ABORTED',
];

const ignorable = (text: string) => IGNORED.some((i) => text.toLowerCase().includes(i.toLowerCase()));

/** Attach console / pageerror / failed-request listeners to a page. */
export function watchPage(page: Page): PageIssues {
  const issues: PageIssues = { consoleErrors: [], pageErrors: [], failedRequests: [] };

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (!ignorable(text)) issues.consoleErrors.push(text);
  });

  page.on('pageerror', (err) => {
    const text = err.message;
    if (!ignorable(text)) issues.pageErrors.push(text);
  });

  page.on('response', (res) => {
    if (res.status() < 500) return;
    const url = res.url();
    if (!ignorable(url)) issues.failedRequests.push(`${res.status()} ${url}`);
  });

  return issues;
}

/** Attach collected issues to the report so failures explain themselves. */
export async function reportIssues(testInfo: TestInfo, page: Page, issues: PageIssues) {
  const lines = [
    `url: ${page.url()}`,
    ...issues.pageErrors.map((e) => `pageerror: ${e}`),
    ...issues.consoleErrors.map((e) => `console: ${e}`),
    ...issues.failedRequests.map((e) => `network: ${e}`),
  ];
  await testInfo.attach('page-issues', { body: lines.join('\n'), contentType: 'text/plain' });
}
