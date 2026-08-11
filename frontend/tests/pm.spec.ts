import { expect, test } from "@playwright/test";

test("PM uses one relational contract with guarded lifecycle and real dashboard", async ({ page }) => {
  await page.context().setExtraHTTPHeaders({
    Origin: process.env.TEST_URL || "http://localhost:3000",
  });
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const signup = await page.request.post("/api/v1/auth/signup-workspace", {
    data: {
      workspace_name: `PM E2E ${suffix}`,
      slug: `pm-e2e-${suffix}`,
      full_name: "PM E2E Owner",
      email: `pm-e2e-${suffix}@example.test`,
      password: "E2E-Strong-Password-2026!",
    },
  });
  expect(signup.status()).toBe(201);

  const projectResponse = await page.request.post("/api/v1/projects", {
    data: { name: `Canonical PM ${suffix}` },
  });
  expect(projectResponse.status()).toBe(201);
  const project = await projectResponse.json();

  const sprintResponse = await page.request.post("/api/v1/sprints", {
    data: { project_id: project.ID, name: "Sprint 1", goal: "Verify the canonical PM contract" },
  });
  expect(sprintResponse.status()).toBe(201);
  let sprint = await sprintResponse.json();

  const sprintUpdate = await page.request.put(`/api/v1/sprints/${sprint.ID}`, {
    data: { name: "Sprint 1 — Contract", goal: "Exercise lifecycle and dashboard", record_version: sprint.RecordVersion },
  });
  expect(sprintUpdate.status()).toBe(200);
  sprint = await sprintUpdate.json();

  const taskResponse = await page.request.post("/api/v1/tasks", {
    data: { project_id: project.ID, title: "PM E2E canonical task", priority: 2, story_points: 5 },
  });
  expect(taskResponse.status()).toBe(201);
  const task = await taskResponse.json();
  expect(task.ProjectID).toBe(project.ID);

  const directStatus = await page.request.put(`/api/v1/tasks/${task.ID}`, {
    data: { status: "done" },
  });
  expect(directStatus.status()).toBe(400);
  expect((await directStatus.json()).code).toBe("PM_TRANSITION_REQUIRED");

  const transitioned = await page.request.post(`/api/v1/tasks/${task.ID}/transition`, {
    data: { status: "in_progress" },
  });
  expect(transitioned.status()).toBe(200);
  expect((await transitioned.json()).RecordVersion).toBe(2);

  const invalidJump = await page.request.post(`/api/v1/tasks/${task.ID}/transition`, {
    data: { status: "done" },
  });
  expect(invalidJump.status()).toBe(400);

  const started = await page.request.put(`/api/v1/sprints/${sprint.ID}/start`, { data: {} });
  expect(started.status()).toBe(200);

  const secondSprintResponse = await page.request.post("/api/v1/sprints", {
    data: { project_id: project.ID, name: "Sprint 2" },
  });
  expect(secondSprintResponse.status()).toBe(201);
  const secondSprint = await secondSprintResponse.json();
  const secondStart = await page.request.put(`/api/v1/sprints/${secondSprint.ID}/start`, { data: {} });
  expect(secondStart.status()).toBe(400);

  const secondProjectResponse = await page.request.post("/api/v1/projects", {
    data: { name: `Cross Project ${suffix}` },
  });
  const secondProject = await secondProjectResponse.json();
  const foreignSprintResponse = await page.request.post("/api/v1/sprints", {
    data: { project_id: secondProject.ID, name: "Foreign sprint" },
  });
  const foreignSprint = await foreignSprintResponse.json();
  const crossProjectAssignment = await page.request.put(`/api/v1/tasks/${task.ID}`, {
    data: { sprint_id: foreignSprint.ID },
  });
  expect(crossProjectAssignment.status()).toBe(400);

  const unsafePagination = await page.request.get("/api/v1/tasks?limit=0");
  expect(unsafePagination.status()).toBe(400);

  const dashboardResponse = await page.request.get(`/api/v1/pm/dashboard?project_id=${project.ID}`);
  expect(dashboardResponse.status()).toBe(200);
  const dashboard = await dashboardResponse.json();
  expect(dashboard.total_tasks).toBe(1);
  expect(dashboard.status_counts.in_progress).toBe(1);
  expect(dashboard.active_sprint.id).toBe(sprint.ID);

  const successorResponse = await page.request.post("/api/v1/tasks", {
    data: { project_id: project.ID, title: "PM critical successor", story_points: 3 },
  });
  const parallelResponse = await page.request.post("/api/v1/tasks", {
    data: { project_id: project.ID, title: "PM parallel task", story_points: 1 },
  });
  expect(successorResponse.status()).toBe(201);
  expect(parallelResponse.status()).toBe(201);
  const successor = await successorResponse.json();
  const parallel = await parallelResponse.json();

  const criticalEdge = await page.request.post("/api/v1/pm/dependencies", {
    data: { predecessor_id: task.ID, successor_id: successor.ID, lag_days: 1 },
  });
  const parallelEdge = await page.request.post("/api/v1/pm/dependencies", {
    data: { predecessor_id: task.ID, successor_id: parallel.ID, lag_days: 0 },
  });
  expect(criticalEdge.status()).toBe(201);
  expect(parallelEdge.status()).toBe(201);

  const cycle = await page.request.post("/api/v1/pm/dependencies", {
    data: { predecessor_id: successor.ID, successor_id: task.ID, lag_days: 0 },
  });
  expect(cycle.status()).toBe(409);
  expect((await cycle.json()).code).toBe("PM_DEPENDENCY_CYCLE");

  const planningResponse = await page.request.get(`/api/v1/pm/planning?project_id=${project.ID}`);
  expect(planningResponse.status()).toBe(200);
  const planning = await planningResponse.json();
  expect(planning.duration_days).toBe(9);
  const planningByID = new Map(planning.tasks.map((item: { id: string }) => [item.id, item]));
  expect(planningByID.get(task.ID).critical).toBeTruthy();
  expect(planningByID.get(successor.ID).critical).toBeTruthy();
  expect(planningByID.get(parallel.ID).critical).toBeFalsy();

  const portfolioResponse = await page.request.get("/api/v1/pm/portfolio");
  expect(portfolioResponse.status()).toBe(200);
  const portfolio = await portfolioResponse.json();
  const portfolioProject = portfolio.projects.find((item: { project_id: string }) => item.project_id === project.ID);
  expect(portfolio.method).toBe("completed_sprint_velocity");
  expect(portfolioProject.forecast_confidence).toBe("insufficient_history");
  expect(portfolioProject.forecast_sprints).toBeNull();

  const unsupportedPlan = await page.request.post("/api/v1/pm/plan-sprint", {
    data: { project_id: project.ID, sprint_id: secondSprint.ID },
  });
  expect(unsupportedPlan.status()).toBe(409);
  expect((await unsupportedPlan.json()).code).toBe("PM_INSUFFICIENT_PLANNING_HISTORY");

  const deleted = await page.request.delete(`/api/v1/sprints/${secondSprint.ID}`);
  expect(deleted.status()).toBe(204);

  await page.goto("/");
  await page.getByRole("button", { name: /إدارة المشاريع/ }).click();
  await page.getByRole("button", { name: "نظرة عامة على المشاريع" }).click();
  await expect(page.getByTestId("pm-project-scope")).toBeVisible();
  await expect(page.getByTestId("pm-dashboard")).toBeVisible();
  await expect(page.getByRole("option", { name: `Canonical PM ${suffix}` })).toHaveCount(1);
  await page.locator("#pm-project-selector").selectOption(project.ID);
  await page.getByRole("button", { name: "جانت والتبعيات" }).click();
  await expect(page.getByTestId("pm-planning")).toBeVisible();
  await expect(page.getByText("PM critical successor", { exact: true })).toBeVisible();
  await expect(page.getByTestId("pm-portfolio-capacity")).toContainText("تاريخ غير كافٍ");
});
