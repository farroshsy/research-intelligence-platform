import { afterEach, describe, expect, it } from "vitest";
import { deliveryReadiness, isProviderConfigured, orderedEmailProviders } from "./reportDelivery";

const original = { resendKey: process.env.RESEND_API_KEY, resendFrom: process.env.RESEND_FROM_EMAIL, gmail: process.env.GMAIL_ACCESS_TOKEN, outlook: process.env.OUTLOOK_ACCESS_TOKEN, slack: process.env.SLACK_WEBHOOK_URL };
afterEach(() => { process.env.RESEND_API_KEY = original.resendKey; process.env.RESEND_FROM_EMAIL = original.resendFrom; process.env.GMAIL_ACCESS_TOKEN = original.gmail; process.env.OUTLOOK_ACCESS_TOKEN = original.outlook; process.env.SLACK_WEBHOOK_URL = original.slack; });

describe("scheduled delivery credential gate", () => {
  it("keeps schedules inactive until the selected provider and optional Slack channel are configured", () => {
    delete process.env.RESEND_API_KEY; delete process.env.RESEND_FROM_EMAIL; delete process.env.SLACK_WEBHOOK_URL;
    expect(isProviderConfigured("resend")).toBe(false);
    expect(deliveryReadiness({ primaryEmailProvider: "resend", slackEnabled: true })).toEqual({ email: false, slack: false });
    process.env.RESEND_API_KEY = "test-key"; process.env.RESEND_FROM_EMAIL = "reports@example.test"; process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.test/example";
    expect(deliveryReadiness({ primaryEmailProvider: "resend", slackEnabled: true })).toEqual({ email: true, slack: true });
    expect(deliveryReadiness({ primaryEmailProvider: "resend", slackEnabled: false })).toEqual({ email: true, slack: true });
  });

  it("keeps the primary email provider first and removes duplicate or invalid fallbacks", () => {
    expect(orderedEmailProviders("resend", ["gmail", "resend", "not-a-provider", "outlook", "gmail"])).toEqual(["resend", "gmail", "outlook"]);
  });
});
