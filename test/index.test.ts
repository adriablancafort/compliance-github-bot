// You can import your modules
// import index from '../src/index'

import nock from "nock";
// Requiring our app implementation
import myProbotApp from "../src/index.js";
import { Probot, ProbotOctokit } from "probot";
// Requiring our fixtures
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, beforeEach, afterEach, test, expect } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const privateKey = fs.readFileSync(
  path.join(__dirname, "fixtures/mock-cert.pem"),
  "utf-8",
);

const pushPayload = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures/push.json"), "utf-8"),
);

describe("Compliance GitHub Bot", () => {
  let probot: any;

  beforeEach(() => {
    nock.disableNetConnect();
    probot = new Probot({
      appId: 123,
      privateKey,
      // disable request throttling and retries for testing
      Octokit: ProbotOctokit.defaults({
        retry: { enabled: false },
        throttle: { enabled: false },
      }),
    });
    // Load our app into probot
    probot.load(myProbotApp);
  });

  test("creates a compliance report when code is pushed to main", async () => {
    const mock = nock("https://api.github.com")
      // Test that we correctly return a test token
      .post("/app/installations/2/access_tokens")
      .reply(200, {
        token: "test",
        permissions: {
          contents: "read",
          issues: "write",
        },
      })
      // Mock the commit details API call
      .get("/repos/hiimbex/testing-things/commits/1234567890abcdef1234567890abcdef12345678")
      .reply(200, {
        sha: "1234567890abcdef1234567890abcdef12345678",
        commit: {
          message: "Add new feature",
        },
        files: [
          {
            filename: "src/app.js",
            patch: "@@ -1,3 +1,4 @@\n console.log('test');\n const password = 'secret123';",
          },
        ],
      })
      // Test that an issue is created with compliance report
      .post("/repos/hiimbex/testing-things/issues", (body: any) => {
        expect(body.title).toContain("Compliance");
        expect(body.body).toContain("Compliance Report");
        expect(body.labels).toContain("compliance");
        return true;
      })
      .reply(200);

    // Receive a webhook event
    await probot.receive({ name: "push", payload: pushPayload });

    expect(mock.pendingMocks()).toStrictEqual([]);
  });

  test("detects hardcoded secrets", async () => {
    const mock = nock("https://api.github.com")
      .post("/app/installations/2/access_tokens")
      .reply(200, {
        token: "test",
        permissions: {
          contents: "read",
          issues: "write",
        },
      })
      .get("/repos/hiimbex/testing-things/commits/1234567890abcdef1234567890abcdef12345678")
      .reply(200, {
        sha: "1234567890abcdef1234567890abcdef12345678",
        commit: {
          message: "Add API key",
        },
        files: [
          {
            filename: "config.js",
            patch: '@@ -1,3 +1,4 @@\n const apiKey = "sk_live_12345";',
          },
        ],
      })
      .post("/repos/hiimbex/testing-things/issues", (body: any) => {
        expect(body.title).toContain("Violations Detected");
        expect(body.body).toContain("Hardcoded API key detected");
        expect(body.labels).toContain("violation");
        return true;
      })
      .reply(200);

    await probot.receive({ name: "push", payload: pushPayload });

    expect(mock.pendingMocks()).toStrictEqual([]);
  });

  test("passes compliance check for clean code", async () => {
    const mock = nock("https://api.github.com")
      .post("/app/installations/2/access_tokens")
      .reply(200, {
        token: "test",
        permissions: {
          contents: "read",
          issues: "write",
        },
      })
      .get("/repos/hiimbex/testing-things/commits/1234567890abcdef1234567890abcdef12345678")
      .reply(200, {
        sha: "1234567890abcdef1234567890abcdef12345678",
        commit: {
          message: "Add new feature",
        },
        files: [
          {
            filename: "src/utils.js",
            patch: "@@ -1,3 +1,4 @@\n function add(a, b) { return a + b; }",
          },
        ],
      })
      .post("/repos/hiimbex/testing-things/issues", (body: any) => {
        expect(body.title).toContain("Passed");
        expect(body.body).toContain("All compliance checks passed");
        expect(body.labels).toContain("passed");
        return true;
      })
      .reply(200);

    await probot.receive({ name: "push", payload: pushPayload });

    expect(mock.pendingMocks()).toStrictEqual([]);
  });

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });
});

// For more information about testing with Jest see:
// https://facebook.github.io/jest/

// For more information about using TypeScript in your tests, Jest recommends:
// https://github.com/kulshekhar/ts-jest

// For more information about testing with Nock see:
// https://github.com/nock/nock
