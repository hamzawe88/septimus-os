import { expect, test, type Page } from "@playwright/test";

const appOrigin = process.env.TEST_URL || "http://localhost:3000";

async function signupWorkspace(page: Page, prefix: string) {
  await page.context().setExtraHTTPHeaders({ Origin: appOrigin });
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const response = await page.request.post("/api/v1/auth/signup-workspace", {
    data: {
      workspace_name: `${prefix} E2E ${suffix}`,
      slug: `${prefix.toLowerCase()}-e2e-${suffix}`,
      full_name: `${prefix} E2E Owner`,
      email: `${prefix.toLowerCase()}-e2e-${suffix}@example.test`,
      password: "E2E-Strong-Password-2026!",
    },
  });
  expect(response.status()).toBe(201);
  return suffix;
}

test("HR keeps employee, leave request, and statutory balance consistent", async ({ page }) => {
  const suffix = await signupWorkspace(page, "HR");
  const year = new Date().getUTCFullYear();

  const created = await page.request.post("/api/v1/employees", {
    data: {
      name: `HR Employee ${suffix}`,
      data: {
        full_name: `HR Employee ${suffix}`,
        email: `employee-${suffix}@example.test`,
        employee_number: `E2E-${suffix}`,
        department: "Engineering",
        position: "Quality Engineer",
        hire_date: `${year - 2}-01-01`,
        base_salary: 8_000,
        status: "active",
      },
    },
  });
  expect(created.status()).toBe(201);
  const employee = (await created.json()).data;
  expect(employee.data.department).toBe("Engineering");

  const initialBalances = await page.request.get(
    `/api/v1/leave-balances?employee_id=${employee.id}&year=${year}`,
  );
  expect(initialBalances.status()).toBe(200);
  const initial = (await initialBalances.json()).data;
  expect(initial).toHaveLength(5);
  const annualBefore = initial.find((balance: { leave_type: string }) => balance.leave_type === "annual");
  expect(annualBefore).toBeTruthy();
  expect(annualBefore.taken_days).toBe(0);

  const leaveCreated = await page.request.post("/api/v1/leave-requests", {
    data: {
      employee_id: employee.id,
      leave_type: "annual",
      start_date: `${year}-10-12`,
      end_date: `${year}-10-14`,
      reason: "Critical contract regression",
    },
  });
  expect(leaveCreated.status()).toBe(201);
  const leave = (await leaveCreated.json()).data;
  expect(leave.days).toBe(3);
  expect(leave.status).toBe("pending");

  const approved = await page.request.post(`/api/v1/leave-requests/${leave.id}/decision`, {
    data: { decision: "approved" },
  });
  expect(approved.status()).toBe(200);
  expect((await approved.json()).data.status).toBe("approved");

  const finalBalances = await page.request.get(
    `/api/v1/leave-balances?employee_id=${employee.id}&year=${year}`,
  );
  expect(finalBalances.status()).toBe(200);
  const final = (await finalBalances.json()).data;
  const annualAfter = final.find((balance: { leave_type: string }) => balance.leave_type === "annual");
  expect(annualAfter.taken_days).toBe(3);
});

test("revoked sessions fail closed across auth and Drive", async ({ page }) => {
  await signupWorkspace(page, "Security");

  const session = await page.request.get("/api/v1/auth/session");
  expect(session.status()).toBe(200);

  const disguisedExecutable = await page.request.post("/api/v1/drive/upload", {
    multipart: {
      file: {
        name: "disguised.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("this is plain text, not a PDF signature"),
      },
    },
  });
  expect(disguisedExecutable.status()).toBe(400);

  const logout = await page.request.post("/api/v1/auth/logout");
  expect(logout.status()).toBe(204);

  // APIRequestContext may retain an expired cookie in its synthetic jar. The
  // security contract is stronger: even if the old token is replayed, the
  // server-side session revocation must reject it on every protected service.
  expect((await page.request.get("/api/v1/auth/session")).status()).toBe(401);
  expect((await page.request.get("/api/v1/drive/files")).status()).toBe(401);
});

test("CSP nonces authorize Next.js while blocking untrusted inline scripts", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /content security policy|script-src/i.test(message.text())) {
      violations.push(message.text());
    }
  });

  const response = await page.goto("/");
  expect(response).toBeTruthy();

  const policy = response?.headers()["content-security-policy"] || "";
  expect(policy).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  expect(policy).not.toContain("'unsafe-eval'");
  expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  expect(policy).not.toMatch(/style-src 'self'[^;]*'unsafe-inline'/);

  const expectedNonce = policy.match(/script-src 'self' 'nonce-([^']+)'/)?.[1];
  expect(expectedNonce).toBeTruthy();
  const renderedScripts = await page.locator("script").evaluateAll((scripts) =>
    scripts.map((script) => ({ nonce: script.nonce, src: script.src, type: script.type })),
  );
  expect(renderedScripts.length).toBeGreaterThan(0);
  expect(renderedScripts.filter((script) => script.nonce !== expectedNonce)).toEqual([]);
  expect(violations).toEqual([]);
  await expect(page.locator(".login-screen")).toBeVisible({ timeout: 15_000 });

  await page.evaluate(() => {
    const target = document.createElement("button");
    target.id = "csp-inline-handler-probe";
    target.setAttribute("onclick", "window.__septimusInlineCspBypass = true");
    document.body.appendChild(target);
  });
  await page.locator("#csp-inline-handler-probe").dispatchEvent("click");
  await page.waitForTimeout(50);
  expect(await page.evaluate(() => Reflect.get(window, "__septimusInlineCspBypass"))).toBeUndefined();
  expect(violations.length).toBeGreaterThan(0);
});

test("Drive imports reach a ready, chunked RAG document", async ({ page }) => {
  const suffix = await signupWorkspace(page, "RAG");
  const filename = `rag-contract-${suffix}.txt`;
  const marker = `SeptimusKnowledgeMarker${suffix.replace(/[^a-zA-Z0-9]/g, "")}`;

  const uploaded = await page.request.post("/api/v1/drive/upload", {
    multipart: {
      file: {
        name: filename,
        mimeType: "text/plain",
        buffer: Buffer.from(`${marker} is the verified Drive to RAG contract marker.`),
      },
    },
  });
  expect(uploaded.status()).toBe(201);
  const driveFile = await uploaded.json();

  const imported = await page.request.post("/api/v1/documents/import-drive", {
    data: { file_id: driveFile.id },
  });
  expect(imported.status()).toBe(202);
  const documentId = (await imported.json()).document_id;

  await expect.poll(async () => {
    const response = await page.request.get("/api/v1/documents");
    expect(response.status()).toBe(200);
    const documents = await response.json();
    const document = documents.find((entry: { id: string }) => entry.id === documentId);
    return {
      status: document?.data?.status,
      indexedChunks: document?.data?.indexed_chunks || 0,
    };
  }, { timeout: 60_000 }).toEqual({ status: "ready", indexedChunks: 1 });

  const search = await page.request.get(`/api/v1/search/omni?q=${encodeURIComponent(marker)}&limit=10`);
  expect(search.status()).toBe(200);
  const results = (await search.json()).results;
  expect(results.some((result: { id: string; match: string }) =>
    result.id === documentId && ["semantic", "hybrid", "lexical"].includes(result.match),
  )).toBeTruthy();
});
