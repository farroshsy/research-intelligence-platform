# Real-world setup and operating guide

## 1. Publish before creating schedules

The application uses durable platform-managed scheduled callbacks for source monitoring and reconciliation. These callbacks only reach the published application, not the development preview. Create a checkpoint, then use the **Publish** control in the project interface before activating a source or configuring the reconciliation job.

## 2. Choose permitted sources

Start with two public sources that you are entitled to monitor, such as a documented JSON API, public RSS feed, stable documentation page, or plain-text page. Do not add sources that require bypassing access controls, CAPTCHA challenges, private-network access, or credentials embedded in the URL.

For every source, record its owner, URL, allowed access method, expected rate limit, monitoring purpose, and the conditions that make a change material. This keeps the monitoring contract defensible and reduces false alerts.

## 3. Create the source contract

Open **Sources** and create a source. The first source should normally remain paused. Use a six-field UTC cron expression; for example, `0 0 9 * * *` runs daily at 09:00 UTC. Configure parser rules to include meaningful stable content, ignore rules to remove known volatile text, and materiality rules for minimum change size, change ratio, and high-value keywords.

Run the source manually once. The first successful run creates a baseline and preserves evidence without creating a change alert. Review the baseline artifacts before activating the schedule. The source contract also enforces a minimum request interval; set it no lower than the source owner's documented rate limit, with 60 seconds as the platform minimum.

## 4. Activate monitoring and reconciliation

After the source and baseline are valid, activate the source. The platform stores the source’s schedule task identifier and uses it to authenticate each callback. Then open **Operations** and configure the reconciliation job. Reconciliation marks abandoned runs as failed and retries a failed owner notification rather than silently losing it.

## 5. Review and alert workflow

Candidate material changes appear in **Change review** with a deterministic diff, before/after evidence, hashes, and review history. An optional advisory explanation can be generated using `gpt-5-mini`; it is structured, validated, explicitly non-authoritative, limited to material candidates, and capped at twelve manual requests per UTC day for the workspace owner.

Only the **Confirm material & notify owner** decision changes a material candidate to confirmed and requests an immediate owner push notification. Cosmetic or no-change events cannot be confirmed as material. If delivery is temporarily unavailable, the database records the failed delivery and the reconciliation job retries it. A dashboard view alone is never required to receive this owner alert.

Use **Intelligence** to govern the evidence boundary before asking the system to monitor more sources. Batch onboarding now previews each CSV-style row and rejects malformed URLs, unsupported types, invalid six-field UTC cron values, existing workspace URLs, and duplicates in the same submitted batch. Only the valid rows are sent to the server, and every accepted source begins **paused**. Review each preview row before creation; do not treat a successful import as authorization to activate the source.

In the same workspace, alert rules can be scoped to all owned sources, one source, a collection, or a tag. Set a minimum materiality threshold, severity, cooldown, and whether a confirmed match is eligible for an owner alert. A rule match only prioritizes a candidate for review; it cannot send an external message or confirm a material change. Collection and source scopes are owner-validated at the API boundary.

Use **Change review** for the actual evidentiary decision. The reviewer can attach append-only notes, decision context, or follow-up instructions and compare two to five owned change events beside the preserved evidence. These tools preserve context for future reviewers; they do not rewrite artifacts, alter an earlier review, or infer a new decision. In **Intelligence**, deterministic anomaly findings can be acknowledged or dismissed only by the finding owner after inspecting the published baseline and threshold.

## 6. Initial operating checklist

| Check | Expected outcome |
|---|---|
| First manual check | A baseline event and evidence artifacts, with no alert |
| Repeat unchanged check | A no-change observation and no duplicate notification |
| Controlled material change | A pending-review material event with a structured diff |
| Reviewer confirmation | An append-only review record and owner notification request |
| Failed delivery test | Notification status is retained as failed and later retried by reconciliation |
| Source failure test | A failed fetch run with no false no-change classification and a recovery record when retryable |
| Rate-control test | A run inside the configured interval is recorded as skipped rather than fetching again |

## 7. Operational limits

The first release supports public HTTP/HTTPS JSON APIs, HTML pages, RSS content, and plain text. Source responses are limited to 2 MB, redirects are rejected, and returned content types are validated against the configured parser; add the final canonical URL instead. For high-volume crawling, JavaScript-rendered content, custom parsers, or sub-minute monitoring, evolve the worker architecture before increasing source count.

## 8. Audit search, display mode, and sharing reports

Open **Operations** to search the execution audit by source name or URL, source, run status, initiating workflow, and inclusive UTC date range. Clearing the controls restores the newest 120 owner-scoped runs. This is intended for tracing a known fetch failure, confirming a scheduled run, or locating a historical manual baseline without exposing another user's operational data.

The header sun/moon control switches between accessible light and dark display modes. The selected mode is stored locally in the browser; when no preference has been stored, the workspace follows the device color-scheme preference. This setting affects presentation only and never changes monitoring, review, alerting, or evidence behavior.

Open **Reports** to build a filtered preview of detected changes. CSV reports use UTF-8 with a byte-order mark for spreadsheet compatibility and neutralize formula-like cell values before export. PDF reports include report metadata, applied filters, event timestamps, deterministic scores, reviewer decisions, preserved evidence hashes, and schema-valid advisory summaries. Advisory content remains explicitly contextual and must not be treated as an automated decision.

## 9. Activate Slack and email delivery when you are ready

Scheduled distribution is intentionally stored in a **paused** state until its selected provider is configured. A schedule is not created merely by saving a delivery configuration, so the absence of credentials cannot create a surprise outbound message.

| Channel | One-time setup | Secret to add | Readiness requirement |
|---|---|---|---|
| Slack | Create a Slack app, enable Incoming Webhooks, and add a webhook to the approved channel. | `SLACK_WEBHOOK_URL` | Required only when the delivery has **Also send Slack summary** enabled. |
| Resend | Create an API key and verify the sender domain/address in the Resend dashboard. | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Required when Resend is selected as the primary provider. |
| Gmail | Authorize an account with Gmail send permission and obtain a current OAuth access token. | `GMAIL_ACCESS_TOKEN` | Required when Gmail is selected as the primary provider. Renew the access token before it expires. |
| Outlook | Authorize Microsoft Graph `Mail.Send` and obtain a current OAuth access token. | `OUTLOOK_ACCESS_TOKEN` | Required when Outlook is selected as the primary provider. Renew the access token before it expires. |

Add these values through the project’s secure secrets settings, never in a source URL, report template, or message. Then return to **Reports**, verify the provider readiness label, save a delivery with a six-field UTC cron expression, and select **Activate**. Each attempt is recorded with the providers attempted, providers that accepted delivery, report summary, and any failure context.

> Slack webhooks are channel-specific URLs and must be kept secret. Slack documents that leaked webhook URLs may be revoked.[1]

The platform sends through **one selected primary email provider** for each schedule and can optionally post the Slack summary. It does not intentionally duplicate emails through every provider. You can select Gmail, Outlook, or Resend as ordered fallbacks; a fallback is used only when the earlier configured email provider cannot accept the message. If you change providers, pause the schedule, update the selected provider or fallbacks, confirm readiness, and reactivate it.

## 10. Review notification status and preferences

Open **Notifications** to review real, owner-scoped delivery state: credential readiness by provider, saved schedules, active-schedule count, recent Slack/email attempts, and pending report-retry records. An empty history means no report delivery attempt has been recorded; it does not imply that a message was sent or failed.

Open **Notification preferences** to enable or disable **email reports** and **Slack summaries** independently for each saved delivery. At least one channel must remain selected. Changing a channel preference is durable but does not create, activate, pause, or run a schedule; scheduled delivery remains credential-gated and must still be deliberately activated from **Reports**. When an enabled schedule runs, only its selected channels are evaluated for readiness and delivery.

## References

[1]: https://api.slack.com/messaging/webhooks "Slack: Sending messages using incoming webhooks"
