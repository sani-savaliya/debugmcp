import type { Browser, BrowserContext, Page } from "playwright";

// ============================================================
// Browser lifecycle manager — one browser, one context, one page
// ============================================================

let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;

export interface BrowserConfig {
  readonly headless: boolean;
  readonly userDataDir?: string;
}

export async function launchBrowser(
  config: BrowserConfig
): Promise<void> {
  const pw = await import("playwright");
  browser = await pw.chromium.launch({
    headless: config.headless,
  });

  context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
  });

  page = await context.newPage();
}

export function getPage(): Page {
  if (!page) {
    throw new Error(
      "Browser not started. Use browser_navigate to open a page first."
    );
  }
  return page;
}

export function getBrowser(): Browser | null {
  return browser;
}

export async function closeBrowser(): Promise<void> {
  if (context) {
    await context.close();
    context = null;
  }
  if (browser) {
    await browser.close();
    browser = null;
  }
  page = null;
}

export function isLaunched(): boolean {
  return browser !== null && browser.isConnected();
}
