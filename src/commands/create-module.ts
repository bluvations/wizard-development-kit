import { Command } from 'commander';
import inquirer from 'inquirer';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import chalk from 'chalk';

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

function toPascalCase(str: string): string {
  return str
    .split(/[-_\s]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

export function createCreateModuleCommand(): Command {
  return new Command('create-module')
    .description('Create a new WDK module with CDK infrastructure')
    .action(async () => {
      console.log('🎨 Creating a new WDK module...\n');

      // Check if we're in a directory with wdk folder
      const wdkDir = path.join(process.cwd(), 'wdk');
      if (!fs.existsSync(wdkDir)) {
        console.log(chalk.red('❌ No wdk directory found. Please run this command from your project root.'));
        console.log(chalk.gray('   Or run "conjure init" first to initialize a project.'));
        return;
      }

      // Check if core.json exists
      const coreJsonPath = path.join(wdkDir, 'core.json');
      if (!fs.existsSync(coreJsonPath)) {
        console.log(chalk.red('❌ No core.json found. Please run "conjure init" first.'));
        return;
      }

      // Prompt for module details
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'moduleName',
          message: 'Enter module name (e.g., "api-gateway", "database", "auth"):',
          validate: (input: string) => {
            const trimmed = input.trim();
            if (!trimmed) {
              return 'Module name is required';
            }
            if (!/^[a-z0-9-]+$/i.test(trimmed)) {
              return 'Module name must contain only letters, numbers, and hyphens';
            }
            return true;
          },
          filter: (input: string) => toKebabCase(input.trim()),
        },
        {
          type: 'input',
          name: 'description',
          message: 'Enter module description:',
          default: 'A WDK module',
        },
        {
          type: 'input',
          name: 'requiredInputs',
          message: 'Enter required inputs from other stacks (comma-separated, e.g., "foundation.createdAt,network.vpcId"):',
          default: '',
          filter: (input: string) => {
            return input.trim() ? input.split(',').map(s => s.trim()).filter(s => s) : [];
          },
        },
      ]);

      const moduleNameKebab = answers.moduleName;
      const moduleNamePascal = toPascalCase(moduleNameKebab);
      const moduleDir = path.join(process.cwd(), moduleNameKebab);

      // Check if module directory already exists
      if (fs.existsSync(moduleDir)) {
        console.log(chalk.red(`❌ Directory "${moduleNameKebab}" already exists.`));
        return;
      }

      // Create module directory
      fs.mkdirSync(moduleDir, { recursive: true });
      console.log(chalk.green(`📁 Created directory: ${moduleNameKebab}/`));

      // Read templates
      const templatesDir = path.join(__dirname, '..', 'templates');
      const stackTemplate = fs.readFileSync(
        path.join(templatesDir, 'module-stack.template.ts'),
        'utf-8'
      );
      const appTemplate = fs.readFileSync(
        path.join(templatesDir, 'module-app.template.ts'),
        'utf-8'
      );
      const configTemplate = fs.readFileSync(
        path.join(templatesDir, 'module-config.template.json'),
        'utf-8'
      );

      // Replace placeholders
      const currentUser = os.userInfo().username || 'unknown';
      const timestamp = new Date().toISOString();

      const stackContent = stackTemplate
        .replace(/\{\{MODULE_NAME_PASCAL\}\}/g, moduleNamePascal)
        .replace(/\{\{MODULE_NAME_KEBAB\}\}/g, moduleNameKebab);

      const appContent = appTemplate
        .replace(/\{\{MODULE_NAME_PASCAL\}\}/g, moduleNamePascal)
        .replace(/\{\{MODULE_NAME_KEBAB\}\}/g, moduleNameKebab);

      const configContent = configTemplate
        .replace(/\{\{MODULE_NAME_KEBAB\}\}/g, moduleNameKebab)
        .replace(/\{\{MODULE_DESCRIPTION\}\}/g, answers.description)
        .replace(/\{\{CREATED_AT\}\}/g, timestamp)
        .replace(/\{\{CREATED_BY\}\}/g, currentUser);

      const configData = JSON.parse(configContent);
      configData.requiredInputs = answers.requiredInputs;

      // Write files
      fs.writeFileSync(
        path.join(moduleDir, `${moduleNameKebab}-stack.ts`),
        stackContent
      );
      console.log(chalk.green(`📝 Created: ${moduleNameKebab}/${moduleNameKebab}-stack.ts`));

      fs.writeFileSync(
        path.join(moduleDir, `${moduleNameKebab}-app.ts`),
        appContent
      );
      console.log(chalk.green(`📝 Created: ${moduleNameKebab}/${moduleNameKebab}-app.ts`));

      fs.writeFileSync(
        path.join(moduleDir, 'module-config.json'),
        JSON.stringify(configData, null, 2)
      );
      console.log(chalk.green(`📝 Created: ${moduleNameKebab}/module-config.json`));

      // Create a README for the module
      const readmeContent = `# ${moduleNamePascal} Module

${answers.description}

## Configuration

This module is part of the WDK (Wizard Development Kit) system.

### Required Inputs

${answers.requiredInputs.length > 0 
  ? answers.requiredInputs.map((input: string) => `- \`${input}\``).join('\n')
  : 'None'}

### Outputs

Define outputs in the \`initialize()\` method by passing them to the constructor:

\`\`\`typescript
outputs: [
  { propertyName: 'exampleOutput', value: 'some-value', type: 'string' }
]
\`\`\`

## Deployment

To deploy this module:

\`\`\`bash
cd ${moduleNameKebab}
cdk deploy --context prefixName=<prefix> --context stageName=<stage> --context accountNumber=<account> --context region=<region>
\`\`\`

## Development

Edit \`${moduleNameKebab}-stack.ts\` to add your CDK resources.

The \`initialize()\` method is where you define your infrastructure.

### Reading Config from Other Stacks

\`\`\`typescript
const someValue = this.getInput('stackName', 'propertyName');
\`\`\`

### Writing Outputs

Pass outputs in the constructor props:

\`\`\`typescript
outputs: [
  { propertyName: 'myOutput', value: resource.arn, type: 'arn' }
]
\`\`\`
`;

      fs.writeFileSync(path.join(moduleDir, 'README.md'), readmeContent);
      console.log(chalk.green(`📝 Created: ${moduleNameKebab}/README.md`));

      // Create tsconfig.json for the module
      const tsconfigContent = {
        extends: '../tsconfig.json',
        compilerOptions: {
          outDir: './dist',
          rootDir: '..',
        },
        include: ['*.ts', '../wdk/*.ts'],
        exclude: ['node_modules', 'dist'],
      };

      fs.writeFileSync(
        path.join(moduleDir, 'tsconfig.json'),
        JSON.stringify(tsconfigContent, null, 2)
      );
      console.log(chalk.green(`📝 Created: ${moduleNameKebab}/tsconfig.json`));

      console.log(chalk.green('\n✨ Module created successfully!'));
      console.log('\n📦 Module Structure:');
      console.log(chalk.cyan(`  ${moduleNameKebab}/`));
      console.log(`    ├── ${moduleNameKebab}-stack.ts    (CDK Stack definition)`);
      console.log(`    ├── ${moduleNameKebab}-app.ts      (CDK App entry point)`);
      console.log(`    ├── module-config.json       (Module configuration)`);
      console.log(`    ├── tsconfig.json            (TypeScript config)`);
      console.log(`    └── README.md                (Documentation)`);

      console.log('\n🚀 Next Steps:');
      console.log(chalk.gray(`  1. cd ${moduleNameKebab}`));
      console.log(chalk.gray(`  2. Edit ${moduleNameKebab}-stack.ts to add your infrastructure`));
      console.log(chalk.gray(`  3. Deploy with: cdk deploy --context ...`));

      if (answers.requiredInputs.length > 0) {
        console.log('\n📥 Required Inputs:');
        answers.requiredInputs.forEach((input: string) => {
          console.log(chalk.yellow(`  - ${input}`));
        });
        console.log(chalk.gray('\n  Make sure these values exist in the config table before deploying.'));
      }
    });
}
