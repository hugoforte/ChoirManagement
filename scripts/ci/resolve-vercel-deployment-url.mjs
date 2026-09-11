#!/usr/bin/env node
// Polls Vercel's deployments API for the READY deployment matching this
// commit SHA, and writes `deployment_url=<url>` to $GITHUB_OUTPUT.
// Adapted from https://github.com/hugoforte/hugo-tessa-20-years's
// preview-playwright.yml (same polling approach, extracted to its own file
// here and parameterized by --target instead of inferring from branch name,
// since our workflow calls this explicitly for "preview" or "production").

const token = process.env.VERCEL_TOKEN;
const projectId = process.env.VERCEL_PROJECT_ID;
const teamId = process.env.VERCEL_TEAM_ID;
const sha = process.env.GITHUB_SHA;
const outFile = process.env.GITHUB_OUTPUT;

const targetArg = process.argv.find((arg) => arg.startsWith("--target="));
const target = targetArg?.split("=")[1];

if (!token || !projectId || !teamId) {
  throw new Error("Missing VERCEL_TOKEN, VERCEL_PROJECT_ID, or VERCEL_TEAM_ID");
}
if (target !== "preview" && target !== "production") {
  throw new Error(`--target must be "preview" or "production", got: ${target}`);
}
if (!sha) {
  throw new Error("Missing GITHUB_SHA");
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function findReadyDeploymentUrl() {
  const maxAttempts = 40;
  const delayMs = 15000;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const url = `https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(projectId)}&teamId=${encodeURIComponent(teamId)}&limit=100&state=READY`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch deployments: ${res.status} ${await res.text()}`);
    }

    const json = await res.json();
    const deployments = json.deployments || [];
    const match = deployments
      .filter(
        (d) =>
          d?.meta?.githubCommitSha === sha &&
          d?.url &&
          (target === "production" ? d?.target === "production" : !d?.target),
      )
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];

    if (match?.url) {
      return `https://${match.url}`;
    }

    console.log(`Attempt ${attempt}/${maxAttempts}: no READY ${target} deployment yet for ${sha}`);
    if (attempt < maxAttempts) {
      await sleep(delayMs);
    }
  }

  throw new Error(`No READY ${target} deployment found for commit ${sha} after waiting 10 minutes`);
}

const deploymentUrl = await findReadyDeploymentUrl();
console.log(`Resolved ${target} URL: ${deploymentUrl}`);
if (outFile) {
  const fs = await import("node:fs");
  fs.appendFileSync(outFile, `deployment_url=${deploymentUrl}\n`);
}
