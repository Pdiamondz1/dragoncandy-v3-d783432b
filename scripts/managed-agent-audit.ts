import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.join(__dirname, "..", ".env.audit") });

const AGENT_NAME = "dragoncandy-audit-v2";
const ENVIRONMENT_NAME = "dragoncandy-audit-env";
const REPO_URL = "https://github.com/Pdiamondz1/dragoncandy-v3-d783432b";

const SYSTEM_PROMPT = `You are a senior full-stack engineer auditing and fixing the DragonCandy content delivery system.

CODEBASE RULES (non-negotiable):
- TypeScript strict mode — no \`any\` types
- Never modify auth logic without confirmation
- Never drop or rename DB columns — add new nullable columns only
- Always use RLS-safe queries — assume Row Level Security on all tables
- Include .select() field lists in Supabase queries — no select *
- Use dc-* Tailwind tokens — never hardcode hex colors
- Protect working lg: desktop classes when fixing mobile styles
- Stripe test mode only — never use live keys
- console.error and console.warn only — no console.log

AUDIT SCOPE: Trace the full end-to-end flow across 5 stages:
1. Campaign creation (restaurant wizard)
2. Creator invite/apply (invitations + applications)
3. Pricing/counter-offer/acceptance (negotiation + collaboration creation)
4. Content delivery/approval/payment (submission + review + payout)
5. Social auto-posting/scheduling (Outstand integration + triple-post)

WORKFLOW:
1. Read /workspace/repo/scripts/audit-rubric.md for the full rubric
2. Read the existing audit docs in /workspace/repo/docs/archive/ for context
3. Audit each stage systematically — read the key files listed in the rubric
4. For each bug you fix:
   a. Create a new branch from main: fix/stage-N-short-description
   b. Make the minimal, focused fix
   c. Run \`npm run build\` and \`npm run typecheck\` to verify
   d. Commit with a descriptive message including the bug number
   e. Push the branch and create a PR via GitHub MCP
   f. Return to main before starting the next fix
5. After all fixes, write a summary to /mnt/session/outputs/audit-report.md`;

async function loadRubric(): Promise<string> {
  const rubricPath = path.join(__dirname, "audit-rubric.md");
  return fs.readFileSync(rubricPath, "utf-8");
}

async function findOrCreateEnvironment(
  client: Anthropic
): Promise<string> {
  const environments = await client.beta.environments.list();
  const existing = environments.data.find(
    (env) => env.name === ENVIRONMENT_NAME
  );
  if (existing) {
    console.log(`Reusing environment: ${existing.id}`);
    return existing.id;
  }

  const env = await client.beta.environments.create({
    name: ENVIRONMENT_NAME,
    config: {
      type: "cloud",
      networking: { type: "unrestricted" },
    },
  });
  console.log(`Created environment: ${env.id}`);
  return env.id;
}

async function findOrCreateVault(
  client: Anthropic
): Promise<string> {
  const vaults = await client.beta.vaults.list();
  if (vaults.data.length > 0) {
    const existing = vaults.data[0];
    console.log(`Reusing vault: ${existing.id}`);
    return existing.id;
  }

  const vault = await client.beta.vaults.create({
    display_name: "dragoncandy-audit-vault",
  });
  console.log(`Created vault: ${vault.id}`);
  return vault.id;
}

async function ensureVaultCredentials(
  client: Anthropic,
  vaultId: string
): Promise<void> {
  const githubMcpToken = process.env.GITHUB_MCP_TOKEN;
  const supabaseMcpToken = process.env.SUPABASE_MCP_TOKEN;

  if (!githubMcpToken) {
    console.warn(
      "GITHUB_MCP_TOKEN not set — GitHub MCP will not authenticate. PRs cannot be created."
    );
  }
  if (!supabaseMcpToken) {
    console.warn(
      "SUPABASE_MCP_TOKEN not set — Supabase MCP will not authenticate. DB queries unavailable."
    );
  }

  const credentials = await client.beta.vaults.credentials.list(vaultId);
  const existingNames = new Set(credentials.data.map((c) => c.display_name));

  if (githubMcpToken && !existingNames.has("GitHub MCP")) {
    await client.beta.vaults.credentials.create(vaultId, {
      display_name: "GitHub MCP",
      auth: {
        type: "mcp_oauth",
        mcp_server_url: "https://api.githubcopilot.com/mcp/",
        access_token: githubMcpToken,
      },
    });
    console.log("Added GitHub MCP credential to vault");
  }

  if (supabaseMcpToken && !existingNames.has("Supabase MCP")) {
    await client.beta.vaults.credentials.create(vaultId, {
      display_name: "Supabase MCP",
      auth: {
        type: "mcp_oauth",
        mcp_server_url: "https://mcp.supabase.com",
        access_token: supabaseMcpToken,
      },
    });
    console.log("Added Supabase MCP credential to vault");
  }
}

async function createAgent(client: Anthropic): Promise<Anthropic.Beta.Agents.Agent> {
  const agents = await client.beta.agents.list();
  const existing = agents.data.find((a) => a.name === AGENT_NAME);
  if (existing) {
    console.log(`Reusing agent: ${existing.id} (version ${existing.version})`);
    return existing;
  }

  const agent = await client.beta.agents.create({
    name: AGENT_NAME,
    model: "claude-opus-4-7",
    system: SYSTEM_PROMPT,
    tools: [
      { type: "agent_toolset_20260401", default_config: { enabled: true } },
    ],
  });

  console.log(`Created agent: ${agent.id} (version ${agent.version})`);
  return agent;
}

async function createSession(
  client: Anthropic,
  agent: Anthropic.Beta.Agents.Agent,
  environmentId: string,
  rubricFileId: string
): Promise<Anthropic.Beta.Sessions.Session> {
  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    throw new Error(
      "GITHUB_TOKEN is required for repository access. Set it as an environment variable."
    );
  }

  const session = await client.beta.sessions.create({
    agent: { type: "agent", id: agent.id, version: agent.version },
    environment_id: environmentId,
    title: `Content Delivery Audit — ${new Date().toISOString().split("T")[0]}`,
    resources: [
      {
        type: "github_repository",
        url: REPO_URL,
        authorization_token: githubToken,
        mount_path: "/workspace/repo",
        checkout: { type: "branch", name: "main" },
      },
      {
        type: "file",
        file_id: rubricFileId,
        mount_path: "/workspace/audit-rubric.md",
      },
    ],
  });

  console.log(`Created session: ${session.id} (status: ${session.status})`);
  return session;
}

async function uploadRubric(client: Anthropic): Promise<string> {
  const rubricContent = await loadRubric();
  const rubricBlob = new Blob([rubricContent], { type: "text/markdown" });
  const rubricFile = new File([rubricBlob], "audit-rubric.md");

  const uploaded = await client.beta.files.upload({
    file: rubricFile,
    purpose: "agent",
  });

  console.log(`Uploaded rubric file: ${uploaded.id}`);
  return uploaded.id;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function handleEvent(
  event: Record<string, unknown>,
  state: { iteration: number; finalResult: string | undefined; startTime: number }
): "done" | "continue" {
  switch (event.type) {
    case "agent.message":
      for (const block of (event.content as Array<{ type: string; text?: string }>)) {
        if (block.type === "text" && block.text) {
          process.stdout.write(block.text);
        }
      }
      break;

    case "span.outcome_evaluation_start":
      state.iteration = event.iteration as number;
      console.log(
        `\n\n=== Grader: evaluating iteration ${state.iteration + 1} ===\n`
      );
      break;

    case "span.outcome_evaluation_end": {
      const result = event.result as string;
      const explanation = event.explanation as string;
      console.log(`\n=== Grader result: ${result} ===`);
      console.log(`Explanation: ${explanation}\n`);

      if (result === "satisfied" || result === "max_iterations_reached" || result === "failed") {
        state.finalResult = result;
      }
      break;
    }

    case "session.status_idle": {
      const stopReason = event.stop_reason as { type: string } | undefined;
      if (stopReason?.type === "requires_action") {
        return "continue";
      }
      console.log(
        `\n--- Session idle (${formatDuration(Date.now() - state.startTime)}) ---`
      );
      if (state.finalResult) {
        console.log(`\nFinal outcome: ${state.finalResult}`);
      }
      return "done";
    }

    case "session.status_terminated":
      console.log(
        `\n--- Session terminated (${formatDuration(Date.now() - state.startTime)}) ---`
      );
      return "done";
  }
  return "continue";
}

async function streamSession(
  client: Anthropic,
  sessionId: string,
  initialStream: AsyncIterable<Record<string, unknown>>
): Promise<void> {
  const seenEventIds = new Set<string>();
  const state = { iteration: 0, finalResult: undefined as string | undefined, startTime: Date.now() };
  const MAX_RECONNECTS = 20;
  let reconnects = 0;
  let currentStream: AsyncIterable<Record<string, unknown>> = initialStream;
  let isFirstAttempt = true;

  while (reconnects < MAX_RECONNECTS) {
    try {
      if (!isFirstAttempt) {
        const session = await client.beta.sessions.retrieve(sessionId);
        if (session.status === "terminated") {
          console.log(`\n--- Session terminated (${formatDuration(Date.now() - state.startTime)}) ---`);
          return;
        }
        if (session.status === "idle") {
          console.log(`\n--- Session idle (${formatDuration(Date.now() - state.startTime)}) ---`);
          if (state.finalResult) {
            console.log(`Final outcome: ${state.finalResult}`);
          }
          return;
        }
        currentStream = await client.beta.sessions.events.stream(sessionId) as AsyncIterable<Record<string, unknown>>;
      }
      isFirstAttempt = false;

      for await (const event of currentStream) {
        const evt = event as Record<string, unknown>;
        const eventId = evt.id as string | undefined;

        if (eventId && seenEventIds.has(eventId)) continue;
        if (eventId) seenEventIds.add(eventId);

        const result = handleEvent(evt, state);
        if (result === "done") return;
      }

      reconnects = 0;
    } catch (err) {
      reconnects++;
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(
        `\n[Stream disconnected: ${errMsg}] Reconnecting (${reconnects}/${MAX_RECONNECTS})...`
      );
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  console.error("Max reconnection attempts reached. Check session status manually.");
  console.error(`Session ID: ${sessionId}`);
}

async function downloadOutputs(
  client: Anthropic,
  sessionId: string
): Promise<void> {
  console.log("\nChecking for output files...");

  for (let attempt = 0; attempt < 3; attempt++) {
    const files = await client.beta.files.list({
      scope_id: sessionId,
      betas: ["managed-agents-2026-04-01"],
    });

    if (files.data.length > 0) {
      const outputDir = path.join(__dirname, "..", "audit-output");
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      for (const f of files.data) {
        try {
          console.log(`Downloading: ${f.filename} (${f.size_bytes} bytes)`);
          const resp = await client.beta.files.download(f.id);
          const buffer = Buffer.from(await resp.arrayBuffer());
          fs.writeFileSync(path.join(outputDir, f.filename), buffer);
        } catch (err) {
          console.warn(`Skipped ${f.filename}: not downloadable`);
        }
      }
      console.log(`Output files saved to: ${outputDir}`);
      return;
    }

    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  console.log("No output files found.");
}

async function main(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error(
      "ANTHROPIC_API_KEY is required. Set it as an environment variable."
    );
    process.exit(1);
  }

  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    console.error(
      "GITHUB_TOKEN is required for repository access. Set it as an environment variable."
    );
    process.exit(1);
  }

  const client = new Anthropic({ apiKey });
  console.log("DragonCandy Content Delivery Audit — Managed Agent\n");

  const environmentId = await findOrCreateEnvironment(client);
  const agent = await createAgent(client);
  const rubricFileId = await uploadRubric(client);
  const session = await createSession(
    client,
    agent,
    environmentId,
    rubricFileId
  );

  const rubricContent = await loadRubric();

  console.log("\nSending outcome event with rubric...\n");

  // Stream-first: open the stream BEFORE sending the event so we don't miss early events
  const stream = await client.beta.sessions.events.stream(session.id);

  await client.beta.sessions.events.send(session.id, {
    events: [
      {
        type: "user.define_outcome",
        description: `Fix bugs in the DragonCandy content delivery system. Work in /workspace/repo.

IMPORTANT: Do NOT spend time exploring the codebase broadly. The rubric at /workspace/audit-rubric.md tells you exactly which files have which bugs. Read only the files you need to fix.

SETUP (do this once):
cd /workspace/repo && npm install

THEN fix bugs one at a time. For EACH bug:
1. Read the specific file mentioned in the rubric
2. Make the minimal fix
3. Run: cd /workspace/repo && npm run build
4. git add -A && git commit -m "fix: description [S#-#]"
5. git push origin main

Push EVERY commit immediately after making it. Do not batch pushes.

Start with Stage 2 bugs (invitation race condition in supabase/functions/send-campaign-invitation/index.ts lines 100-114). Use INSERT ... ON CONFLICT DO NOTHING instead of the check-then-insert pattern.

After all fixes, write a summary to /mnt/session/outputs/audit-report.md listing each fix with the file changed and what was done.`,
        rubric: { type: "text", content: rubricContent },
        max_iterations: 5,
      },
    ],
  });

  await streamSession(client, session.id, stream as AsyncIterable<Record<string, unknown>>);
  await downloadOutputs(client, session.id);

  const finalSession = await client.beta.sessions.retrieve(session.id);
  console.log(`\nSession status: ${finalSession.status}`);
  console.log(
    `Usage: ${JSON.stringify(finalSession.usage, null, 2)}`
  );

  console.log("\nDone. Review the PRs on GitHub and merge after verification.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
