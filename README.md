# Compliance GitHub Bot

> A GitHub App that automatically analyzes commits to your main branch and generates compliance reports

## Features

This bot automatically monitors commits to your main/master branch and checks for common compliance violations:

- **🔒 Security Issues**
  - Hardcoded passwords, API keys, and secrets
  - AWS credentials
  - Unsafe `eval()` usage

- **📝 Code Quality**
  - Console statements (should use proper logging)
  - TODO/FIXME comments (should be tracked as issues)
  - Disabled linting rules (`eslint-disable`, `@ts-ignore`)

When violations are detected, the bot creates a GitHub issue with:
- Detailed compliance report
- File-by-file violation breakdown
- Severity levels (High, Medium, Low)
- Actionable recommendations

## Setup

```sh
# Install dependencies
npm install

# Build the project
npm run build

# Run the bot
npm start
```

## Testing

```sh
# Run tests
npm test
```

## Configuration

The bot monitors pushes to `main` and `master` branches by default. After installing the bot to your repository:

1. The bot will automatically analyze all commits pushed to main/master
2. A compliance report issue will be created for each push
3. Issues are labeled with `compliance` and either `passed` or `violation`

### Required Permissions

- **Contents**: Read (to access commit diffs)
- **Issues**: Write (to create compliance reports)

### Events

- **Push**: Triggered on commits to main/master branches

## Docker

```sh
# 1. Build container
docker build -t compliance-github-bot .

# 2. Start container
docker run -e APP_ID=<app-id> -e PRIVATE_KEY=<pem-value> compliance-github-bot
```
