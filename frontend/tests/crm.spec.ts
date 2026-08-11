import { expect, test } from "@playwright/test";

test("CRM opportunity lifecycle converts one quote into exactly one invoice", async ({ page }) => {
  // APIRequestContext does not synthesize a browser Origin header. The app
  // correctly rejects cookie-authenticated mutations without one, so keep the
  // test on the same CSRF contract as a real browser request.
  await page.context().setExtraHTTPHeaders({
    Origin: process.env.TEST_URL || "http://localhost:3000",
  });

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const signup = await page.request.post("/api/v1/auth/signup-workspace", {
    data: {
      workspace_name: `CRM E2E ${suffix}`,
      slug: `crm-e2e-${suffix}`,
      full_name: "CRM E2E Owner",
      email: `crm-e2e-${suffix}@example.test`,
      password: "E2E-Strong-Password-2026!",
    },
  });
  expect(signup.status()).toBe(201);

  const invalidInitialStage = await page.request.post("/api/v1/crm/opportunities", {
    data: {
      title: "Bypass opportunity", company: "CRM E2E Company", stage: "closed_won",
      value: 1_000, currency: "SAR",
    },
  });
  expect(invalidInitialStage.status()).toBe(409);
  expect((await invalidInitialStage.json()).code).toBe("CRM_INITIAL_STAGE_REQUIRED");

  const created = await page.request.post("/api/v1/crm/opportunities", {
    data: {
	  title: "Lifecycle opportunity",
	  company: "CRM E2E Company",
	  contact_name: "CRM Buyer",
	  email: `buyer-${suffix}@example.test`,
	  stage: "new",
	  value: 1_000,
	  currency: "SAR",
    },
  });
  expect(created.status()).toBe(201);
	let opportunity = (await created.json()).opportunity;

  for (const stage of ["contacted", "proposal"]) {
    const moved = await page.request.patch(
	  `/api/v1/crm/opportunities/${opportunity.id}/stage`,
	  { data: { stage, expected_version: opportunity.record_version } },
    );
    expect(moved.status()).toBe(200);
	opportunity = (await moved.json()).entity;
	expect(opportunity.data.stage).toBe(stage);
  }

  const idempotencyKey = `crm-e2e-conversion-${suffix}`;
  const quotePayload = {
	opportunity_id: opportunity.id,
    quote_number: `QT-E2E-${suffix}`,
    valid_until: "2026-12-31",
    currency: "SAR",
    tax_rate: 0.15,
    items: [
      { id: "line-1", description: "Implementation", quantity: 2, unitPrice: 500 },
    ],
    notes: "Playwright lifecycle contract",
  };
  const converted = await page.request.post(
    "/api/v1/crm/quotes/convert-to-invoice",
    { headers: { "Idempotency-Key": idempotencyKey }, data: quotePayload },
  );
  expect(converted.status()).toBe(201);
  const first = await converted.json();
  expect(first.replayed).toBe(false);
	expect(first.opportunity.data.stage).toBe("closed_won");
  expect(first.invoice.data.total).toBe(1_150);

  const replayed = await page.request.post(
    "/api/v1/crm/quotes/convert-to-invoice",
    { headers: { "Idempotency-Key": idempotencyKey }, data: quotePayload },
  );
  expect(replayed.status()).toBe(200);
  const replay = await replayed.json();
  expect(replay.replayed).toBe(true);
  expect(replay.invoice.id).toBe(first.invoice.id);
  expect(replay.quote.id).toBe(first.quote.id);

  const payloadMismatch = await page.request.post(
    "/api/v1/crm/quotes/convert-to-invoice",
    {
      headers: { "Idempotency-Key": idempotencyKey },
      data: { ...quotePayload, notes: "Different request under the same key" },
    },
  );
  expect(payloadMismatch.status()).toBe(409);
  expect((await payloadMismatch.json()).code).toBe("CRM_IDEMPOTENCY_PAYLOAD_MISMATCH");

  const duplicate = await page.request.post(
    "/api/v1/crm/quotes/convert-to-invoice",
    {
      headers: { "Idempotency-Key": `${idempotencyKey}-different` },
      data: quotePayload,
    },
  );
  expect(duplicate.status()).toBe(409);
	expect((await duplicate.json()).code).toBe("CRM_OPPORTUNITY_ALREADY_WON");

  const invoices = await page.request.get("/api/v1/entities?type=finance_invoice&limit=200");
  expect(invoices.status()).toBe(200);
  const invoiceRows = (await invoices.json()).data.filter(
	(entity: { data?: { crmOpportunityId?: string } }) => entity.data?.crmOpportunityId === opportunity.id,
  );
  expect(invoiceRows).toHaveLength(1);

	const activity = await page.request.post(`/api/v1/crm/opportunities/${opportunity.id}/activities`, {
	  data: { subject: "E2E note", activity_type: "note", status: "completed", notes: "Verified lifecycle note" },
	});
	expect(activity.status()).toBe(201);
	const customer360 = await page.request.get(`/api/v1/crm/opportunities/${opportunity.id}/customer-360`);
	expect(customer360.status()).toBe(200);
	expect((await customer360.json()).activities).toHaveLength(1);

	const ticketResponse = await page.request.post("/api/v1/crm/tickets", {
	  data: {
		subject: "E2E support ticket", customer_name: "CRM E2E Company",
		opportunity_id: opportunity.id, priority: "urgent", channel: "portal",
	  },
	});
	expect(ticketResponse.status()).toBe(201);
	const ticket = await ticketResponse.json();
	expect(ticket.data.sla_status).toBe("on_track");
	expect(ticket.data.sla_due_at).toBeTruthy();

	const assigned = await page.request.patch(`/api/v1/crm/tickets/${ticket.id}`, {
	  data: {
		expected_record_version: ticket.record_version,
		subject: ticket.data.subject,
		priority: ticket.data.priority,
		assigned_team: "Tier 2",
	  },
	});
	expect(assigned.status()).toBe(200);
	const assignedTicket = await assigned.json();
	expect(assignedTicket.data.sla_due_at).toBe(ticket.data.sla_due_at);

	const message = await page.request.post(`/api/v1/crm/tickets/${ticket.id}/messages`, {
	  data: { body: "Independent ticket message", channel: "portal" },
	});
	expect(message.status()).toBe(201);
	const messages = await page.request.get(`/api/v1/crm/tickets/${ticket.id}/messages`);
	expect(messages.status()).toBe(200);
	expect((await messages.json()).data).toHaveLength(1);

	const resolved = await page.request.patch(`/api/v1/crm/tickets/${ticket.id}`, {
	  data: { expected_record_version: assignedTicket.record_version, status: "resolved" },
	});
	expect(resolved.status()).toBe(200);
	expect((await resolved.json()).data.sla_status).toBe("resolved");
	const stale = await page.request.patch(`/api/v1/crm/tickets/${ticket.id}`, {
	  data: { expected_record_version: ticket.record_version, status: "open" },
	});
	expect(stale.status()).toBe(409);

	const dashboard = await page.request.get("/api/v1/crm/dashboard?period=this_month&source=all&currency=SAR");
	expect(dashboard.status()).toBe(200);
	const dashboardData = await dashboard.json();
	expect(dashboardData.currency).toBe("SAR");
	expect(dashboardData.stats.total_opportunities).toBeGreaterThanOrEqual(1);
	expect(dashboardData.stats.revenue).toBeGreaterThanOrEqual(1_150);
});
