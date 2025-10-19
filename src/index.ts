import { Probot } from "probot";

interface ComplianceViolation {
  file: string;
  issue: string;
  severity: "high" | "medium" | "low";
}

interface ComplianceReport {
  violations: ComplianceViolation[];
  passed: boolean;
  summary: string;
}

/**
 * Analyzes file changes for compliance violations
 */
function analyzeFileForCompliance(
  filename: string,
  patch: string
): ComplianceViolation[] {
  const violations: ComplianceViolation[] = [];

  // Check for hardcoded secrets/credentials
  const secretPatterns = [
    { pattern: /(password|passwd|pwd)\s*=\s*['"][^'"]+['"]/i, issue: "Hardcoded password detected" },
    { pattern: /(api[_-]?key|apikey)\s*=\s*['"][^'"]+['"]/i, issue: "Hardcoded API key detected" },
    { pattern: /(secret|token)\s*=\s*['"][^'"]+['"]/i, issue: "Hardcoded secret/token detected" },
    { pattern: /aws_access_key_id|aws_secret_access_key/i, issue: "AWS credentials detected" },
  ];

  for (const { pattern, issue } of secretPatterns) {
    if (pattern.test(patch)) {
      violations.push({ file: filename, issue, severity: "high" });
    }
  }

  // Check for console.log statements (should use proper logging)
  if (/console\.(log|debug|info|warn|error)/.test(patch)) {
    violations.push({
      file: filename,
      issue: "Console statements detected - use proper logging framework",
      severity: "low",
    });
  }

  // Check for TODO/FIXME comments in production code
  if (/(TODO|FIXME|HACK|XXX):?/i.test(patch)) {
    violations.push({
      file: filename,
      issue: "TODO/FIXME comments detected - should be tracked as issues",
      severity: "low",
    });
  }

  // Check for disabled linting rules
  if (/(eslint-disable|@ts-ignore|@ts-nocheck)/.test(patch)) {
    violations.push({
      file: filename,
      issue: "Linting rules disabled - fix the underlying issue instead",
      severity: "medium",
    });
  }

  // Check for unsafe eval usage
  if (/\beval\s*\(/.test(patch)) {
    violations.push({
      file: filename,
      issue: "Unsafe eval() usage detected",
      severity: "high",
    });
  }

  return violations;
}

/**
 * Generates a compliance report from violations
 */
function generateComplianceReport(
  violations: ComplianceViolation[]
): ComplianceReport {
  const passed = violations.length === 0;
  const highSeverity = violations.filter((v) => v.severity === "high");
  const mediumSeverity = violations.filter((v) => v.severity === "medium");
  const lowSeverity = violations.filter((v) => v.severity === "low");

  let summary = passed
    ? "✅ All compliance checks passed!"
    : `❌ Found ${violations.length} compliance violation(s):\n` +
      `- ${highSeverity.length} high severity\n` +
      `- ${mediumSeverity.length} medium severity\n` +
      `- ${lowSeverity.length} low severity`;

  return { violations, passed, summary };
}

/**
 * Formats the compliance report as a markdown comment
 */
function formatComplianceReport(
  report: ComplianceReport,
  commitSha: string,
  commitMessage: string,
  author: string
): string {
  let markdown = `## 🔍 Compliance Report\n\n`;
  markdown += `**Commit:** ${commitSha.substring(0, 7)}\n`;
  markdown += `**Author:** ${author}\n`;
  markdown += `**Message:** ${commitMessage}\n\n`;
  markdown += `---\n\n`;
  markdown += `${report.summary}\n\n`;

  if (!report.passed) {
    markdown += `### Violations:\n\n`;

    const groupedByFile: { [key: string]: ComplianceViolation[] } = {};
    for (const violation of report.violations) {
      if (!groupedByFile[violation.file]) {
        groupedByFile[violation.file] = [];
      }
      groupedByFile[violation.file].push(violation);
    }

    for (const [file, fileViolations] of Object.entries(groupedByFile)) {
      markdown += `#### 📄 \`${file}\`\n\n`;
      for (const violation of fileViolations) {
        const emoji =
          violation.severity === "high"
            ? "🔴"
            : violation.severity === "medium"
            ? "🟡"
            : "🔵";
        markdown += `- ${emoji} **${violation.severity.toUpperCase()}**: ${violation.issue}\n`;
      }
      markdown += `\n`;
    }

    markdown += `\n---\n\n`;
    markdown += `⚠️ Please address these violations before merging to maintain compliance standards.`;
  }

  return markdown;
}

export default (app: Probot) => {
  app.on("push", async (context) => {
    const { payload } = context;

    // Only analyze pushes to the main/master branch
    const branch = payload.ref.replace("refs/heads/", "");
    if (branch !== "main" && branch !== "master") {
      app.log.info(`Skipping compliance check for branch: ${branch}`);
      return;
    }

    app.log.info(
      `Running compliance check for push to ${branch} by ${payload.pusher.name}`
    );

    const allViolations: ComplianceViolation[] = [];

    // Analyze each commit in the push
    for (const commit of payload.commits) {
      try {
        // Get the commit details to access the files changed
        const commitData = await context.octokit.repos.getCommit({
          owner: payload.repository.owner.name || payload.repository.owner.login,
          repo: payload.repository.name,
          ref: commit.id,
        });

        // Analyze each file in the commit
        if (commitData.data.files) {
          for (const file of commitData.data.files) {
            if (file.patch) {
              const violations = analyzeFileForCompliance(
                file.filename,
                file.patch
              );
              allViolations.push(...violations);
            }
          }
        }
      } catch (error) {
        app.log.error(
          `Error analyzing commit ${commit.id}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    // Generate and post the compliance report as an issue
    const latestCommit = payload.commits[payload.commits.length - 1];
    const report = generateComplianceReport(allViolations);
    const reportBody = formatComplianceReport(
      report,
      latestCommit.id,
      latestCommit.message,
      latestCommit.author.name
    );

    // Create an issue with the compliance report
    const issueTitle = report.passed
      ? `✅ Compliance Check Passed - ${latestCommit.id.substring(0, 7)}`
      : `❌ Compliance Violations Detected - ${latestCommit.id.substring(0, 7)}`;

    await context.octokit.issues.create({
      owner: payload.repository.owner.name || payload.repository.owner.login,
      repo: payload.repository.name,
      title: issueTitle,
      body: reportBody,
      labels: report.passed ? ["compliance", "passed"] : ["compliance", "violation"],
    });

    app.log.info(`Compliance report posted: ${report.passed ? "PASSED" : "FAILED"}`);
  });

  // For more information on building apps:
  // https://probot.github.io/docs/

  // To get your app running against GitHub, see:
  // https://probot.github.io/docs/development/
};
