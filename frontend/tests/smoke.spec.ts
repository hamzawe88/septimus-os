import { test, expect, type Page } from '@playwright/test';

async function captureModule(page: Page, testId: string, snapshot: string) {
  const surface = page.getByTestId(testId);
  await expect(surface).toBeVisible();
  await expect(surface).toHaveScreenshot(snapshot, {
    animations: 'disabled',
    maxDiffPixelRatio: 0.01,
    mask: [surface.locator('time')],
  });
}

async function captureMobileModule(page: Page, testId: string, snapshot: string) {
  await page.setViewportSize({ width: 390, height: 844 });
  const sidebar = page.locator('.sidebar');
  const sidebarWasOpen = await sidebar.isVisible();
  if (sidebarWasOpen) {
    await page.getByTestId('sidebar-toggle').click();
    await expect(sidebar).toHaveCount(0);
  }
  const surface = page.getByTestId(testId);
  await expect(surface).toBeVisible();
  const viewport = await page.locator('html').evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(viewport.scrollWidth).toBe(viewport.clientWidth);
  await expect(surface).toHaveScreenshot(snapshot, {
    animations: 'disabled',
    maxDiffPixelRatio: 0.01,
    mask: [surface.locator('time')],
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  if (sidebarWasOpen) {
    await page.getByTestId('sidebar-toggle').click();
    await expect(page.locator('.sidebar')).toBeVisible();
  }
}

async function openNestedNavigation(page: Page, groupName: string, targetName: string) {
  const target = page.getByRole('button', { name: targetName, exact: true });
  if (!(await target.isVisible())) {
    await page.locator('.sidebar-section-header').getByRole('button', { name: groupName, exact: true }).click();
  }
  await expect(target).toBeVisible();
  await target.click();
}

test.describe('Septimus OS Smoke Tests', () => {
  test('App loads cleanly and renders login screen', async ({ page }) => {
    // Navigate to local frontend instance or test server
    await page.goto(process.env.TEST_URL || 'http://localhost:3000');

    // Verify page title / heading is present without crash or fatal console errors
    await expect(page).toHaveTitle(/Septimus|Next/i);

    // Verify company name or login container renders
    const loginContainer = page.locator('.login-screen');
    await expect(loginContainer).toBeVisible({ timeout: 10000 });

    // Verify admin default email is populated or input exists
    const emailInput = page.getByRole('textbox').first();
    await expect(emailInput).toBeVisible();
  });

  test('redirects an unauthenticated protected route to login', async ({ page }) => {
    await page.goto('/admin');

    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('.login-screen')).toBeVisible();
  });

  test('onboards at starter tier, creates a server session, and reaches Drive', async ({ page }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await page.goto(process.env.TEST_URL || 'http://localhost:3000');
    await page.getByRole('button', { name: 'تأسيس مساحة عمل جديدة (Sign Up)' }).click();
    await page.getByPlaceholder('مثال: شركة الآفاق الذكية').fill(`E2E ${suffix}`);
    await page.getByPlaceholder('acme-corp').fill(`e2e-${suffix}`);
    await page.getByRole('button', { name: 'التالي: بيانات حساب المالك' }).click();
    await page.getByPlaceholder('المهندس أحمد زايد').fill('E2E Owner');
    await page.getByPlaceholder('ahmed@acme-corp.com').fill(`e2e-${suffix}@example.test`);
    await page.getByPlaceholder('••••••••••••').fill('E2E-Strong-Password-2026!');
    await page.getByRole('button', { name: 'التالي: اختيار الخطة' }).click();
    await page.getByRole('button', { name: 'إتمام التسجيل والدخول الفوري' }).click();

    await expect(page.locator('.login-screen')).toHaveCount(0);
    const cookie = (await page.context().cookies()).find((entry) => entry.name === 'septimus_session');
    expect(cookie?.httpOnly).toBeTruthy();
    expect(cookie?.sameSite).toBe('Strict');

    const billing = await page.request.get('/api/v1/billing/status');
    expect(billing.ok()).toBeTruthy();
    const billingBody = await billing.json();
    expect(billingBody.workspace.Tier).toBe('starter');
    expect(billingBody.subscription.tier).toBe('starter');

    // EICAR is a harmless industry-standard antivirus test signature. The
    // upload must be rejected before MinIO or metadata persistence.
    const malwareUpload = await page.request.post('/api/v1/drive/upload', {
      multipart: {
        file: {
          name: 'eicar.txt',
          mimeType: 'text/plain',
          buffer: Buffer.from(
            'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',
          ),
        },
      },
    });
    expect(malwareUpload.status()).toBe(422);

    // This exact path previously collided with the Drive wildcard rewrite.
    const drive = await page.request.get('/api/v1/drive/files');
    expect(drive.ok()).toBeTruthy();
    expect(Array.isArray(await drive.json())).toBeTruthy();
    const driveKnowledgeName = `knowledge-${suffix}.txt`;
    const safeDriveUpload = await page.request.post('/api/v1/drive/upload', {
      multipart: {
        file: {
          name: driveKnowledgeName,
          mimeType: 'text/plain',
          buffer: Buffer.from('Septimus semantic knowledge document for secure Drive import.'),
        },
      },
    });
    expect(safeDriveUpload.status()).toBe(201);
    const safeDriveFile = await safeDriveUpload.json();

    // Seed the canonical relational PM source explicitly. Kanban must never
    // create data merely because a read failed or a new workspace is empty.
    await page.context().setExtraHTTPHeaders({
      Origin: process.env.TEST_URL || 'http://localhost:3000',
    });
    const visualProjectResponse = await page.request.post('/api/v1/projects', {
      data: { name: 'E2E Project' },
    });
    expect(visualProjectResponse.status()).toBe(201);
    const visualProject = await visualProjectResponse.json();
    const visualSprintResponse = await page.request.post('/api/v1/sprints', {
      data: { project_id: visualProject.ID, name: 'E2E Sprint', goal: 'Visual regression baseline' },
    });
    expect(visualSprintResponse.status()).toBe(201);
    const visualSprint = await visualSprintResponse.json();
    const visualTaskResponse = await page.request.post('/api/v1/tasks', {
      data: { project_id: visualProject.ID, title: 'Verify project delivery', priority: 2, story_points: 5 },
    });
    expect(visualTaskResponse.status()).toBe(201);
    const visualTask = await visualTaskResponse.json();
    const assignVisualTask = await page.request.put(`/api/v1/tasks/${visualTask.ID}`, {
      data: { sprint_id: visualSprint.ID, record_version: visualTask.RecordVersion },
    });
    expect(assignVisualTask.status()).toBe(200);
    const startVisualSprint = await page.request.put(`/api/v1/sprints/${visualSprint.ID}/start`, { data: {} });
    expect(startVisualSprint.status()).toBe(200);

    await page.goto('/admin');
    await expect(page.locator('.login-screen')).toHaveCount(0);

    // Arabic and English visual contracts for the first migrated product
    // units. Animations and live clocks are suppressed or masked so the
    // snapshots fail only on meaningful layout/theme regressions.
    await page.goto('/');
    await page.getByRole('button', { name: 'لوحة القيادة' }).click();
    const dashboardAr = page.getByTestId('liquid-dashboard');
    await expect(dashboardAr).toBeVisible();
    await expect(dashboardAr).toHaveScreenshot('dashboard-ar.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.01,
      mask: [dashboardAr.locator('time')],
    });
    await captureMobileModule(page, 'liquid-dashboard', 'dashboard-mobile-ar.png');

    await page.getByRole('button', { name: /إدارة المشاريع/ }).click();
    await page.getByRole('button', { name: 'نظرة عامة على المشاريع' }).click();
    const projectsAr = page.getByTestId('pm-dashboard');
    await expect(projectsAr).toBeVisible();
    await expect(projectsAr).toHaveScreenshot('projects-ar.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.01,
    });
    await captureMobileModule(page, 'pm-dashboard', 'projects-mobile-ar.png');
    await page.getByRole('button', { name: 'لوحة كانبان' }).click();
    const kanbanAr = page.getByTestId('kanban-board');
    await expect(kanbanAr).toBeVisible();
    await expect(kanbanAr).toHaveScreenshot('kanban-ar.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.01,
    });
    await captureMobileModule(page, 'kanban-board', 'kanban-mobile-ar.png');
    await kanbanAr.getByRole('button', { name: 'مهمة جديدة' }).click();
    const newTaskAr = page.getByRole('dialog', { name: 'إنشاء مهمة جديدة' });
    await expect(newTaskAr).toHaveScreenshot('new-task-ar.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.001,
    });
    await newTaskAr.getByRole('button', { name: 'إلغاء' }).click();
    await page.getByRole('button', { name: 'سجل المهام' }).click();
    await captureModule(page, 'backlog-view', 'backlog-ar.png');
    await captureMobileModule(page, 'backlog-view', 'backlog-mobile-ar.png');
    await page.getByRole('button', { name: 'جدول المهام' }).click();
    await captureModule(page, 'dynamic-board', 'task-table-ar.png');
    await captureMobileModule(page, 'dynamic-board', 'task-table-mobile-ar.png');

    await page.goto('/crm');
    await captureModule(page, 'crm-page', 'crm-ar.png');
	await page.getByRole('button', { name: 'كانبان العملاء' }).click();
	await captureModule(page, 'crm-page', 'crm-pipeline-ar.png');
	await page.getByRole('button', { name: 'التذاكر' }).click();
	await captureModule(page, 'crm-page', 'crm-tickets-ar.png');
	await page.setViewportSize({ width: 390, height: 844 });
	await captureModule(page, 'crm-page', 'crm-tickets-mobile-ar.png');
	await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/finance');
    await captureModule(page, 'finance-page', 'finance-ar.png');
    await captureMobileModule(page, 'finance-page', 'finance-mobile-ar.png');
    await page.goto('/meetings');
    await captureModule(page, 'meetings-page', 'meetings-ar.png');
    await captureMobileModule(page, 'meetings-page', 'meetings-mobile-ar.png');
    await page.goto('/');
    await openNestedNavigation(
      page,
      'الأتمتة والبيانات',
      'الديوان والمراسلات الرسمية',
    );
    await captureModule(page, 'correspondence-view', 'correspondence-ar.png');
    await captureMobileModule(page, 'correspondence-view', 'correspondence-mobile-ar.png');

    await openNestedNavigation(page, 'القنوات', 'المحادثة العامة');
    const chatAr = page.getByTestId('full-page-chat');
    await expect(chatAr).toBeVisible();
    await expect(chatAr).toHaveScreenshot('chat-ar.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.01,
      mask: [chatAr.locator('time'), chatAr.getByTestId('live-date-time')],
    });
    await captureMobileModule(page, 'full-page-chat', 'chat-mobile-ar.png');
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('septimus:open-global-search')));
    const searchAr = page.getByRole('dialog', { name: 'البحث الشامل' });
    await expect(searchAr).toBeVisible();
    await expect(searchAr).toHaveScreenshot('chat-search-ar.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.001,
    });
    await searchAr.getByRole('button', { name: 'إغلاق البحث الشامل' }).click();
    await page.getByRole('button', { name: 'المواضيع' }).click();
    const threadsAr = page.getByRole('complementary', { name: 'المواضيع' });
    await expect(threadsAr).toBeVisible();
    await expect(threadsAr).toHaveScreenshot('chat-threads-ar.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.001,
      mask: [threadsAr.locator('time')],
    });
    await threadsAr.getByRole('button', { name: 'إغلاق' }).click();

    // Complete Arabic visual coverage for every primary workspace module.
    await page.getByRole('button', { name: 'مداري الشخصي', exact: true }).click();
    await captureModule(page, 'orbit-page', 'orbit-ar.png');
    await captureMobileModule(page, 'orbit-page', 'orbit-mobile-ar.png');
    await page.goto('/hr');
    await captureModule(page, 'hr-page', 'hr-ar.png');
    await captureMobileModule(page, 'hr-page', 'hr-mobile-ar.png');
    await page.goto('/');
    await openNestedNavigation(page, 'إدارة المشاريع (Agile)', 'مركز التقارير');
    await captureModule(page, 'reports-center', 'reports-ar.png');
    await captureMobileModule(page, 'reports-center', 'reports-mobile-ar.png');
    await openNestedNavigation(page, 'قاعدة المعرفة', 'مستندات العمل');
    await captureModule(page, 'workdocs-view', 'workdocs-ar.png');
    await captureMobileModule(page, 'workdocs-view', 'workdocs-mobile-ar.png');
    await page.locator('.sidebar-section-items').getByRole('button', { name: 'قاعدة المعرفة', exact: true }).click();
    await captureModule(page, 'knowledge-base', 'knowledge-base-ar.png');
    await captureMobileModule(page, 'knowledge-base', 'knowledge-base-mobile-ar.png');
    await page.getByRole('button', { name: 'اختيار من Drive', exact: true }).click();
    const driveImportDialog = page.getByTestId('drive-import-dialog');
    await expect(driveImportDialog).toBeVisible();
    await driveImportDialog.getByRole('checkbox', { name: driveKnowledgeName }).click();
    await driveImportDialog.getByRole('button', { name: 'إرسال إلى المعرفة وRAG', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('تم إرسال 1 مستند');
    await expect.poll(async () => {
      const response = await page.request.get('/api/v1/documents');
      const documents = await response.json();
      return documents.some((document: { data?: { source_drive_file_id?: string } }) =>
        document.data?.source_drive_file_id === safeDriveFile.id,
      );
    }).toBeTruthy();
    const omni = await page.request.get(
      `/api/v1/search/omni?q=${encodeURIComponent(driveKnowledgeName)}&limit=10`,
    );
    expect(omni.ok()).toBeTruthy();
    const omniBody = await omni.json();
    expect(omniBody.mode).toBe('hybrid');
    expect(omniBody.results.some((result: { data?: { source_drive_file_id?: string } }) =>
      result.data?.source_drive_file_id === safeDriveFile.id,
    )).toBeTruthy();
    await page.getByRole('button', { name: 'Septimus Drive', exact: true }).click();
    await captureModule(page, 'drive-view', 'drive-ar.png');
    await captureMobileModule(page, 'drive-view', 'drive-mobile-ar.png');
    await openNestedNavigation(page, 'الأتمتة والبيانات', 'مسارات العمل');
    await captureModule(page, 'workflow-builder', 'workflows-ar.png');
    await captureMobileModule(page, 'workflow-builder', 'workflows-mobile-ar.png');
    await page.getByRole('button', { name: 'الأتمتة (n8n)', exact: true }).click();
    await captureModule(page, 'automations-view', 'automations-ar.png');
    await captureMobileModule(page, 'automations-view', 'automations-mobile-ar.png');

    await page.evaluate(() => localStorage.setItem('app_lang', 'en'));
    await page.reload();
    await page.getByRole('button', { name: 'Dashboard' }).click();
    const dashboardEn = page.getByTestId('liquid-dashboard');
    await expect(dashboardEn).toBeVisible();
    await expect(dashboardEn).toHaveScreenshot('dashboard-en.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.01,
      mask: [dashboardEn.locator('time')],
    });
    await captureMobileModule(page, 'liquid-dashboard', 'dashboard-mobile-en.png');

    await page.getByRole('button', { name: /Agile & PM/ }).click();
    await page.getByRole('button', { name: 'Projects overview' }).click();
    const projectsEn = page.getByTestId('pm-dashboard');
    await expect(projectsEn).toBeVisible();
    await expect(projectsEn).toHaveScreenshot('projects-en.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.01,
    });
    await captureMobileModule(page, 'pm-dashboard', 'projects-mobile-en.png');
    await page.getByRole('button', { name: 'Kanban Board' }).click();
    const kanbanEn = page.getByTestId('kanban-board');
    await expect(kanbanEn).toBeVisible();
    await expect(kanbanEn).toHaveScreenshot('kanban-en.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.01,
    });
    await captureMobileModule(page, 'kanban-board', 'kanban-mobile-en.png');
    await kanbanEn.getByRole('button', { name: 'New task' }).click();
    const newTaskEn = page.getByRole('dialog', { name: 'Create a new task' });
    await expect(newTaskEn).toHaveScreenshot('new-task-en.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.001,
    });
    await newTaskEn.getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('button', { name: 'Backlog & Sprints' }).click();
    await captureModule(page, 'backlog-view', 'backlog-en.png');
    await captureMobileModule(page, 'backlog-view', 'backlog-mobile-en.png');
    await page.getByRole('button', { name: 'Task Table' }).click();
    await captureModule(page, 'dynamic-board', 'task-table-en.png');
    await captureMobileModule(page, 'dynamic-board', 'task-table-mobile-en.png');

    await page.goto('/crm');
    await captureModule(page, 'crm-page', 'crm-en.png');
	await page.getByRole('button', { name: 'Leads Kanban' }).click();
	await captureModule(page, 'crm-page', 'crm-pipeline-en.png');
	await page.getByRole('button', { name: 'Support Tickets' }).click();
	await captureModule(page, 'crm-page', 'crm-tickets-en.png');
	await page.setViewportSize({ width: 390, height: 844 });
	await captureModule(page, 'crm-page', 'crm-tickets-mobile-en.png');
	await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/finance');
    await captureModule(page, 'finance-page', 'finance-en.png');
    await captureMobileModule(page, 'finance-page', 'finance-mobile-en.png');
    await page.goto('/meetings');
    await captureModule(page, 'meetings-page', 'meetings-en.png');
    await captureMobileModule(page, 'meetings-page', 'meetings-mobile-en.png');
    await page.goto('/');
    await openNestedNavigation(
      page,
      'Automations & Data',
      'Official Correspondence',
    );
    await captureModule(page, 'correspondence-view', 'correspondence-en.png');
    await captureMobileModule(page, 'correspondence-view', 'correspondence-mobile-en.png');

    await openNestedNavigation(page, 'Channels', 'Global Chat');
    const chatEn = page.getByTestId('full-page-chat');
    await expect(chatEn).toBeVisible();
    await expect(chatEn).toHaveScreenshot('chat-en.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.01,
      mask: [chatEn.locator('time'), chatEn.getByTestId('live-date-time')],
    });
    await captureMobileModule(page, 'full-page-chat', 'chat-mobile-en.png');
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('septimus:open-global-search')));
    const searchEn = page.getByRole('dialog', { name: 'Global search' });
    await expect(searchEn).toBeVisible();
    await expect(searchEn).toHaveScreenshot('chat-search-en.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.001,
    });
    await searchEn.getByRole('button', { name: 'Close global search' }).click();
    await page.getByRole('button', { name: 'Threads' }).click();
    const threadsEn = page.getByRole('complementary', { name: 'Threads' });
    await expect(threadsEn).toBeVisible();
    await expect(threadsEn).toHaveScreenshot('chat-threads-en.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.001,
      mask: [threadsEn.locator('time')],
    });
    await threadsEn.getByRole('button', { name: 'Close' }).click();

    // Complete English parity for the same primary workspace module matrix.
    await page.getByRole('button', { name: 'My Orbit', exact: true }).click();
    await captureModule(page, 'orbit-page', 'orbit-en.png');
    await captureMobileModule(page, 'orbit-page', 'orbit-mobile-en.png');
    await page.goto('/hr');
    await captureModule(page, 'hr-page', 'hr-en.png');
    await captureMobileModule(page, 'hr-page', 'hr-mobile-en.png');
    await page.goto('/');
    await openNestedNavigation(page, 'Agile & PM', 'Reports Center');
    await captureModule(page, 'reports-center', 'reports-en.png');
    await captureMobileModule(page, 'reports-center', 'reports-mobile-en.png');
    await openNestedNavigation(page, 'Knowledge Base', 'WorkDocs');
    await captureModule(page, 'workdocs-view', 'workdocs-en.png');
    await captureMobileModule(page, 'workdocs-view', 'workdocs-mobile-en.png');
    await page.locator('.sidebar-section-items').getByRole('button', { name: 'Knowledge Base', exact: true }).click();
    await captureModule(page, 'knowledge-base', 'knowledge-base-en.png');
    await captureMobileModule(page, 'knowledge-base', 'knowledge-base-mobile-en.png');
    await page.getByRole('button', { name: 'Septimus Drive', exact: true }).click();
    await captureModule(page, 'drive-view', 'drive-en.png');
    await captureMobileModule(page, 'drive-view', 'drive-mobile-en.png');
    await openNestedNavigation(page, 'Automations & Data', 'Workflows');
    await captureModule(page, 'workflow-builder', 'workflows-en.png');
    await captureMobileModule(page, 'workflow-builder', 'workflows-mobile-en.png');
    await page.getByRole('button', { name: 'Automations (n8n)', exact: true }).click();
    await captureModule(page, 'automations-view', 'automations-en.png');
    await captureMobileModule(page, 'automations-view', 'automations-mobile-en.png');

    // The internal design-system gallery is a functional acceptance surface:
    // Arabic-first, complete themes, dark mode, and English parity.
    await page.evaluate(() => localStorage.setItem('app_lang', 'ar'));
    await page.goto('/admin/design-system');
    await expect(
      page.getByRole('heading', { name: 'نظام تصميم الديوان' }),
    ).toBeVisible();
    await page.getByRole('button', { name: /الصحراء/ }).click();
    await expect(
      page.getByRole('button', { name: /الصحراء/ }),
    ).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'داكن' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);

    await page.evaluate(() => localStorage.setItem('app_lang', 'en'));
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Diwan design system' }),
    ).toBeVisible();
    await expect(page.getByText('AI provenance', { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    const responsiveShell = await page.locator('.topbar').evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }));
    expect(responsiveShell.scrollWidth).toBe(responsiveShell.clientWidth);
    expect(responsiveShell.documentWidth).toBe(responsiveShell.viewportWidth);

    const blockedCSRF = await page.request.post('/api/v1/auth/logout', {
      headers: { Origin: 'https://evil.example' },
    });
    expect(blockedCSRF.status()).toBe(403);

    const logout = await page.request.post('/api/v1/auth/logout', {
      // APIRequestContext carries cookies but, unlike browser fetch, does not
      // synthesize Origin automatically.
      headers: { Origin: new URL(page.url()).origin },
    });
    expect(logout.ok()).toBeTruthy();
    const revoked = await page.request.get('/api/v1/billing/status');
    expect(revoked.status()).toBe(401);
    const revokedDrive = await page.request.post('/api/v1/drive/upload', {
      multipart: {
        file: {
          name: 'revoked.txt',
          mimeType: 'text/plain',
          buffer: Buffer.from('revoked sessions must never reach Drive'),
        },
      },
    });
    expect(revokedDrive.status()).toBe(401);
  });

  test('publishes a no-code schema and computes a record formula end to end', async ({ page }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await page.goto(process.env.TEST_URL || 'http://localhost:3000');
    await page.getByRole('button', { name: 'تأسيس مساحة عمل جديدة (Sign Up)' }).click();
    await page.getByPlaceholder('مثال: شركة الآفاق الذكية').fill(`Schema E2E ${suffix}`);
    await page.getByPlaceholder('acme-corp').fill(`schema-${suffix}`);
    await page.getByRole('button', { name: 'التالي: بيانات حساب المالك' }).click();
    await page.getByPlaceholder('المهندس أحمد زايد').fill('Schema Owner');
    await page.getByPlaceholder('ahmed@acme-corp.com').fill(`schema-${suffix}@example.test`);
    await page.getByPlaceholder('••••••••••••').fill('E2E-Strong-Password-2026!');
    await page.getByRole('button', { name: 'التالي: اختيار الخطة' }).click();
    await page.getByText('Pro AI', { exact: true }).click();
    await page.getByRole('button', { name: 'إتمام التسجيل والدخول الفوري' }).click();
    await expect(page.locator('.login-screen')).toHaveCount(0);
    const origin = new URL(page.url()).origin;
    const initialBilling = await page.request.get('/api/v1/billing/status');
    expect(initialBilling.ok()).toBeTruthy();
    const initialBillingBody = await initialBilling.json();
    const workspaceId = initialBillingBody.workspace.ID;
    const upgrade = await page.request.post('/api/v1/webhooks/stripe', {
      headers: {
        Origin: origin,
        'Stripe-Signature': 'simulated_signature',
      },
      data: {
        type: 'simulated.tier.upgrade',
        workspace_id: workspaceId,
        tier: 'business',
      },
    });
    expect(upgrade.ok()).toBeTruthy();

    const definitionKey = `orders_${suffix.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`.slice(0, 63);
    const create = await page.request.post('/api/v1/schema-definitions', {
      headers: { Origin: origin },
      data: {
        key: definitionKey,
        label_ar: 'طلبات الاختبار',
        label_en: 'Test orders',
        title_field_key: 'title',
        fields: [
          { key: 'title', label_ar: 'العنوان', label_en: 'Title', type: 'text', required: true },
          { key: 'quantity', label_ar: 'الكمية', label_en: 'Quantity', type: 'integer', required: true },
          { key: 'price', label_ar: 'السعر', label_en: 'Price', type: 'number', required: true },
          {
            key: 'total',
            label_ar: 'الإجمالي',
            label_en: 'Total',
            type: 'formula',
            required: false,
            formula: { expression: '[quantity] * [price]', result_type: 'number' },
          },
        ],
      },
    });
    expect(create.status()).toBe(201);
    const created = await create.json();

    const publish = await page.request.post(
      `/api/v1/schema-definitions/${created.definition.id}/publish`,
      {
        headers: { Origin: origin },
        data: { expected_revision: created.definition.draft_revision },
      },
    );
    expect(publish.ok()).toBeTruthy();

    const record = await page.request.post(`/api/v1/data/${definitionKey}/records`, {
      headers: { Origin: origin },
      data: {
        data: { title: 'Order E2E', quantity: 3, price: 12.5, total: 999 },
      },
    });
    expect(record.status()).toBe(201);
    const recordBody = await record.json();
    expect(recordBody.data.total).toBe(37.5);

    const query = await page.request.post(`/api/v1/data/${definitionKey}/records/query`, {
      headers: { Origin: origin },
      data: {
        filter: { field: 'title', op: 'contains', value: 'Order' },
        limit: 10,
      },
    });
    expect(query.ok()).toBeTruthy();
    const queryBody = await query.json();
    expect(queryBody.data).toHaveLength(1);
    expect(queryBody.data[0].id).toBe(recordBody.id);

    const baseFields = [
      { key: 'title', label_ar: 'العنوان', label_en: 'Title', type: 'text', required: true },
      { key: 'quantity', label_ar: 'الكمية', label_en: 'Quantity', type: 'integer', required: true },
      { key: 'price', label_ar: 'السعر', label_en: 'Price', type: 'number', required: true },
      {
        key: 'total',
        label_ar: 'الإجمالي',
        label_en: 'Total',
        type: 'formula',
        required: false,
        formula: { expression: '[quantity] * [price]', result_type: 'number' },
      },
    ];
    const blockedDraft = await page.request.patch(
      `/api/v1/schema-definitions/${created.definition.id}/draft`,
      {
        headers: { Origin: origin },
        data: {
          key: definitionKey,
          label_ar: 'طلبات الاختبار',
          label_en: 'Test orders',
          title_field_key: 'title',
          expected_revision: created.definition.draft_revision,
          fields: [
            ...baseFields,
            { key: 'priority', label_ar: 'الأولوية', label_en: 'Priority', type: 'integer', required: true },
          ],
        },
      },
    );
    expect(blockedDraft.ok()).toBeTruthy();
    const blockedDraftBody = await blockedDraft.json();
    const blockedImpact = await page.request.post(
      `/api/v1/schema-definitions/${created.definition.id}/impact`,
      {
        headers: { Origin: origin },
        data: { expected_revision: blockedDraftBody.definition.draft_revision },
      },
    );
    expect(blockedImpact.status()).toBe(201);
    const blockedImpactBody = await blockedImpact.json();
    expect(blockedImpactBody.report.severity).toBe('breaking');
    expect(blockedImpactBody.report.can_approve).toBeFalsy();

    const blockedPublish = await page.request.post(
      `/api/v1/schema-definitions/${created.definition.id}/publish`,
      {
        headers: { Origin: origin },
        data: {
          expected_revision: blockedDraftBody.definition.draft_revision,
          impact_job_id: blockedImpactBody.job.id,
        },
      },
    );
    expect(blockedPublish.status()).toBe(412);

    const migratableDraft = await page.request.patch(
      `/api/v1/schema-definitions/${created.definition.id}/draft`,
      {
        headers: { Origin: origin },
        data: {
          key: definitionKey,
          label_ar: 'طلبات الاختبار',
          label_en: 'Test orders',
          title_field_key: 'title',
          expected_revision: blockedDraftBody.definition.draft_revision,
          fields: [
            ...baseFields,
            {
              key: 'priority',
              label_ar: 'الأولوية',
              label_en: 'Priority',
              type: 'integer',
              required: true,
              default: 1,
            },
          ],
        },
      },
    );
    expect(migratableDraft.ok()).toBeTruthy();
    const migratableDraftBody = await migratableDraft.json();
    const impact = await page.request.post(
      `/api/v1/schema-definitions/${created.definition.id}/impact`,
      {
        headers: { Origin: origin },
        data: { expected_revision: migratableDraftBody.definition.draft_revision },
      },
    );
    expect(impact.status()).toBe(201);
    const impactBody = await impact.json();
    expect(impactBody.report.severity).toBe('conditional');
    expect(impactBody.report.requires_migration).toBeTruthy();

    const approval = await page.request.post(
      `/api/v1/schema-definitions/${created.definition.id}/change-jobs/${impactBody.job.id}/approve`,
      { headers: { Origin: origin }, data: {} },
    );
    expect(approval.ok()).toBeTruthy();
    const secondPublish = await page.request.post(
      `/api/v1/schema-definitions/${created.definition.id}/publish`,
      {
        headers: { Origin: origin },
        data: {
          expected_revision: migratableDraftBody.definition.draft_revision,
          impact_job_id: impactBody.job.id,
        },
      },
    );
    expect(secondPublish.ok()).toBeTruthy();
    expect((await secondPublish.json()).migration_job).toBeTruthy();

    await expect.poll(async () => {
      const migrated = await page.request.get(
        `/api/v1/data/${definitionKey}/records/${recordBody.id}`,
      );
      if (!migrated.ok()) return null;
      const body = await migrated.json();
      return { priority: body.data.priority, schemaVersion: body.schema_version };
    }, { timeout: 15_000 }).toEqual({ priority: 1, schemaVersion: 2 });

    // Exercise the real Schema Builder UI after the API contract checks:
    // navigation, definition loading, governance controls, and record grid.
    await page.getByRole('button', { name: 'الأتمتة والبيانات' }).click();
    await page.getByRole('button', { name: 'منشئ الكيانات' }).click();
    await expect(page.getByRole('heading', { name: 'منشئ المخططات' })).toBeVisible();
    await page.getByRole('button', { name: /طلبات الاختبار/ }).click();
    await expect(page.getByRole('button', { name: 'الحقول', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'العلاقات', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'البيانات', exact: true })).toBeVisible();
    await expect(page.getByLabel('الاسم العربي')).toHaveValue('طلبات الاختبار');
    const englishName = page.getByLabel('الاسم الإنجليزي');
    await expect(englishName).toBeVisible();
    await page.getByRole('button', { name: 'معاينة الهاتف' }).click();
    await expect(page.getByRole('button', { name: 'معاينة الهاتف' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('button', { name: 'معاينة سطح المكتب' }).click();
    await expect(page.getByText('حوكمة البيانات').first()).toBeVisible();
    await expect(page.getByText('Order E2E', { exact: true })).toBeVisible();

    const latestBeforeConflict = await page.request.get(
      `/api/v1/schema-definitions/${created.definition.id}`,
    );
    const latestBeforeConflictBody = await latestBeforeConflict.json();
    const remoteEdit = await page.request.patch(
      `/api/v1/schema-definitions/${created.definition.id}/draft`,
      {
        headers: { Origin: origin },
        data: {
          key: definitionKey,
          label_ar: 'طلبات الاختبار',
          label_en: 'Remote editor label',
          title_field_key: 'title',
          expected_revision: latestBeforeConflictBody.definition.draft_revision,
          fields: latestBeforeConflictBody.fields,
        },
      },
    );
    expect(remoteEdit.ok()).toBeTruthy();

    await englishName.fill('Local autosaved label');
    await page.waitForTimeout(350);
    await page.getByRole('button', { name: 'تراجع عن آخر تعديل' }).click();
    await expect(englishName).toHaveValue('Test orders');
    await page.getByRole('button', { name: 'إعادة التعديل' }).click();
    await expect(englishName).toHaveValue('Local autosaved label');

    await expect(
      page.getByRole('heading', { name: 'اكتُشف تعارض في المسودة' }),
    ).toBeVisible({ timeout: 5_000 });
    await page.getByRole('button', { name: 'اعتماد تعديلاتي' }).click();
    await expect.poll(async () => {
      const current = await page.request.get(
        `/api/v1/schema-definitions/${created.definition.id}`,
      );
      return (await current.json()).definition.label_en;
    }).toBe('Local autosaved label');

    await page.getByRole('button', { name: 'النماذج', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'منشئ النماذج' })).toBeVisible();
    await page.getByRole('button', { name: 'نموذج جديد' }).click();
    await page.getByLabel('الاسم العربي').fill('نموذج الطلب');
    await page.getByLabel('الاسم الإنجليزي').fill('Order form');
    await page.getByLabel('النموذج الافتراضي لهذا الوضع').check();
    await page.getByRole('button', { name: 'حفظ النموذج' }).click();
    await expect(page.getByRole('button', { name: /نموذج الطلب/ })).toBeVisible();

    await page.getByRole('button', { name: 'طرق العرض', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'منشئ طرق العرض' })).toBeVisible();
    await page.getByRole('button', { name: 'طريقة عرض جديدة' }).click();
    await page.getByLabel('الاسم العربي').fill('عرض الطلبات');
    await page.getByLabel('الاسم الإنجليزي').fill('Orders view');
    await page.getByLabel('طريقة العرض الافتراضية').check();
    await page.getByRole('button', { name: 'حفظ طريقة العرض' }).click();
    await expect(page.getByRole('button', { name: /عرض الطلبات/ })).toBeVisible();

    await page.getByRole('button', { name: 'العلاقات', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'استوديو العلاقات' })).toBeVisible();
    await page.getByRole('button', { name: 'البيانات', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'بيانات المخطط' })).toBeVisible();
    await expect(page.getByLabel('طريقة العرض المحفوظة')).toHaveValue(/.+/);
    await expect(page.getByText('Order E2E', { exact: true }).first()).toBeVisible();
    await captureModule(page, 'schema-builder', 'schema-builder-ar.png');
    await captureMobileModule(page, 'schema-builder', 'schema-builder-mobile-ar.png');
    await page.getByRole('button', { name: 'النشاط', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'الإصدارات وحوكمة المخطط' }),
    ).toBeVisible();
    await expect(page.getByText('سجل النشاط')).toBeVisible();
    await expect(page.getByText('نشر إصدار جديد').first()).toBeVisible();

    await page.evaluate(() => localStorage.setItem('app_lang', 'en'));
    await page.reload();
    await openNestedNavigation(page, 'Automations & Data', 'Entity Creator');
    await expect(page.getByRole('heading', { name: 'Schema Builder' })).toBeVisible();
    await captureModule(page, 'schema-builder', 'schema-builder-en.png');
    await captureMobileModule(page, 'schema-builder', 'schema-builder-mobile-en.png');
  });
});
