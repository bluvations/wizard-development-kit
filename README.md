# Wizard's Deployment Kit (WDK)

A TypeScript-based Node.js command-line utility to bootstrap repositories and frameworks. This is the foundational version that exposes the `conjure` command.

## Recommended Usage (local folder dependency)

The intended workflow is to keep a copy of this repository in your project repo (as a sibling folder), install it as a local `file:` dependency, and run the CLI via `npx`.

### Project layout

At the root of your new project repository:

```
my-project/
  wizard-development-kit/
  package.json
  package-lock.json
```

### Root `package.json` (in your project repo)

Create a `package.json` next to `wizard-development-kit/`:

```json
{
  "name": "my-wdk-project",
  "private": true,
  "version": "0.0.0",
  "devDependencies": {
    "wizards-deployment-kit": "file:./wizard-development-kit"
  }
}
```

Then install dependencies:

```bash
npm install
```

After that, run commands from your project root:

```bash
npx conjure init
npx conjure add-stage
npx conjure add-module amazon-connect-foundation
npx conjure deploy dev amazon-connect-foundation
```

## Development

### Prerequisites
- Node.js v14+ installed
- npm or yarn

### Installation (WDK local development)

1. Install dependencies:
```bash
npm install
```

2. Build the TypeScript source:
```bash
npm run build
```

3. (Optional) Link the CLI globally:
```bash
npm link
```

This will install a global `conjure` command on your system.

### Development Workflow

- **Build once**: `npm run build`
- **Watch mode** (auto-rebuild on changes): `npm run watch`
- **Source code**: Located in `src/index.ts`
- **Compiled output**: Located in `dist/index.js`

## Usage

### Basic Commands

```bash
conjure                    # Display welcome message
conjure --version          # Show version
conjure --help             # Show all available commands
```

### Available Subcommands

#### `conjure init`
Initialize a new Wizard project in the current directory.

```bash
conjure init
```

#### `conjure add-module <module-name>`
Add a module to the current project.

```bash
conjure add-module my-module
```

#### `conjure deploy <target>`
Deploy a specific target.

```bash
conjure deploy production
```

#### `conjure deploy-all`
Deploy all configured targets.

```bash
conjure deploy-all
```

#### `conjure synth <target>`
Synthesize configuration for a specific target.

```bash
conjure synth staging
```

#### `conjure synth-all`
Synthesize configuration for all targets.

```bash
conjure synth-all
```

## Unlink

If you want to remove the global link:

```bash
npm unlink -g wizards-deployment-kit
```

## Roadmap

- Scaffolding projects from templates
- Cloning and organizing multiple repositories into directory structures
- Interactive prompts for choosing stacks/frameworks
- Config-driven deployments and profiles
