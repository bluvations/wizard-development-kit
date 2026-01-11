import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { spawn } from 'child_process';
import { DynamoDBClient, DescribeTableCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { fromIni } from '@aws-sdk/credential-providers';
import { getConfigTableName } from '../cdk/config-loader';

interface CoreConfig {
  projectPrefix: string;
  initiatedAt: string;
  developerName: string;
  stages: string[];
}

interface StageConfig {
  accountNumber: string;
  region: string;
  awsProfile: string;
  addedBy: string;
  addedAt: string;
  lastUpdated: string;
}

type SetupQuestionType = 'string' | 'number' | 'boolean' | 'json';

interface SetupQuestion {
  propertyName: string;
  message: string;
  type: SetupQuestionType;
  default?: any;
  choices?: Array<{ name: string; value: any }>;
}

interface ModuleConfig {
  moduleName: string;
  description: string;
  createdAt: string;
  createdBy: string;
  requiredInputs?: string[];
  outputs?: any[];
  setupQuestions?: SetupQuestion[];
}

export function createAddModuleCommand(): Command {
  return new Command('add-module')
    .description('Add a module to the current project')
    .argument('<module-name>', 'Name of the module to add')
    .action(async (moduleName: string) => {
      const trimmed = moduleName.trim();
      if (!trimmed) {
        console.log(chalk.red('❌ Module name is required.'));
        return;
      }
      if (!/^[a-z0-9-]+$/i.test(trimmed)) {
        console.log(chalk.red('❌ Module name must contain only letters, numbers, and hyphens.'));
        return;
      }

      // Check if project is initialized
      const wdkDir = path.join(process.cwd(), 'wdk');
      const coreJsonPath = path.join(wdkDir, 'core.json');
      if (!fs.existsSync(coreJsonPath)) {
        console.log(chalk.red('❌ No core.json found. Please run "conjure init" first.'));
        return;
      }

      const coreConfig: CoreConfig = JSON.parse(fs.readFileSync(coreJsonPath, 'utf-8'));
      if (!coreConfig.stages || coreConfig.stages.length === 0) {
        console.log(chalk.red('❌ No stages found in core.json.'));
        console.log(chalk.gray('   Run "conjure add-stage" first.'));
        return;
      }

      const { stageName } = await inquirer.prompt([
        {
          type: 'list',
          name: 'stageName',
          message: 'Select a stage to configure this module for:',
          choices: coreConfig.stages,
        },
      ]);

      const stageJsonPath = path.join(wdkDir, `${stageName}.json`);
      if (!fs.existsSync(stageJsonPath)) {
        console.log(chalk.red(`❌ Stage "${stageName}" not found.`));
        return;
      }

      const stageConfig: StageConfig = JSON.parse(fs.readFileSync(stageJsonPath, 'utf-8'));

      const destDir = path.join(process.cwd(), trimmed);
      if (fs.existsSync(destDir)) {
        console.log(chalk.red(`❌ Directory "${trimmed}" already exists.`));
        return;
      }

      const repoUrl = `https://github.com/bluvations/wdk-${trimmed}.git`;
      console.log(`📦 Adding module: ${chalk.cyan(trimmed)}...`);
      console.log(chalk.gray(`   Cloning ${repoUrl} (branch: main)`));

      const cloneArgs = ['clone', '--branch', 'main', '--single-branch', repoUrl, trimmed];

      const cloneSuccess = await new Promise<boolean>((resolve) => {
        const gitProcess = spawn('git', cloneArgs, {
          cwd: process.cwd(),
          stdio: 'inherit',
          shell: false,
        });

        gitProcess.on('close', (code) => resolve(code === 0));
        gitProcess.on('error', (error) => {
          console.log(chalk.red(`\n❌ Failed to run git: ${error.message}`));
          console.log(chalk.gray('   Make sure git is installed and available in your PATH.'));
          resolve(false);
        });
      });

      if (!cloneSuccess) {
        console.log(chalk.red(`\n❌ Failed to add module "${trimmed}".`));
        console.log(chalk.gray('   Verify the repository exists and is public:'));
        console.log(chalk.gray(`   bluvations/wdk-${trimmed} (branch: main)`));
        process.exit(1);
      }

      const moduleConfigPath = path.join(destDir, 'module-config.json');
      if (!fs.existsSync(moduleConfigPath)) {
        console.log(chalk.yellow(`\n⚠️  module-config.json not found in ${trimmed}/. Skipping setup questions.`));
        console.log(chalk.green(`\n✅ Module added: ${trimmed}/`));
        return;
      }

      const moduleConfig: ModuleConfig = JSON.parse(fs.readFileSync(moduleConfigPath, 'utf-8'));
      const setupQuestions = moduleConfig.setupQuestions || [];

      if (setupQuestions.length === 0) {
        console.log(chalk.green(`\n✅ Module added: ${trimmed}/`));
        return;
      }

      console.log(chalk.cyan(`\n🧩 Module setup for stage: ${chalk.cyan(stageName)}`));

      const prompts = setupQuestions.map((q) => {
        if (q.choices && q.choices.length > 0) {
          return {
            type: 'list',
            name: q.propertyName,
            message: q.message,
            choices: q.choices,
            default: q.default,
          };
        }
        if (q.type === 'boolean') {
          return {
            type: 'confirm',
            name: q.propertyName,
            message: q.message,
            default: q.default ?? false,
          };
        }
        return {
          type: 'input',
          name: q.propertyName,
          message: q.message,
          default: q.default,
          validate: (input: string) => {
            if (q.type === 'number' && input.trim() !== '' && Number.isNaN(Number(input))) {
              return 'Please enter a valid number';
            }
            if (q.type === 'json' && input.trim() !== '') {
              try {
                JSON.parse(input);
              } catch {
                return 'Please enter valid JSON';
              }
            }
            return true;
          },
        };
      });

      const answers = await inquirer.prompt<Record<string, any>>(prompts as any);

      const tableName = getConfigTableName(coreConfig.projectPrefix, stageName);
      const client = new DynamoDBClient({
        region: stageConfig.region,
        credentials: stageConfig.awsProfile !== 'inherit' ? fromIni({ profile: stageConfig.awsProfile }) : undefined,
      });

      console.log(chalk.cyan(`\n📝 Saving module setup to DynamoDB config table: ${tableName}`));
      console.log(chalk.gray(`   Region: ${stageConfig.region}`));
      console.log(chalk.gray(`   AWS Profile: ${stageConfig.awsProfile}`));

      try {
        await client.send(new DescribeTableCommand({ TableName: tableName }));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(chalk.red(`\n❌ DynamoDB config table not found or not accessible: ${tableName}`));
        console.log(chalk.gray(`   ${message}`));
        console.log(chalk.gray('   Common causes:'));
        console.log(chalk.gray('   - The foundation stack has not been deployed for this stage'));
        console.log(chalk.gray('   - You selected the wrong stage/region/account/profile'));
        console.log(chalk.gray('   Fix: run "conjure add-stage" (or redeploy foundation) for this stage, then try again.'));
        process.exit(1);
      }

      const setupStackName = `${trimmed}.setup`;
      for (const q of setupQuestions) {
        const rawValue = (answers as any)[q.propertyName];
        const valueStr = typeof rawValue === 'string' ? rawValue : JSON.stringify(rawValue);

        try {
          await client.send(
            new PutItemCommand({
              TableName: tableName,
              Item: {
                stackName: { S: setupStackName },
                propertyName: { S: q.propertyName },
                value: { S: valueStr },
                type: { S: q.type },
              },
            })
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.log(chalk.red(`\n❌ Failed to write setup value "${q.propertyName}" to DynamoDB.`));
          console.log(chalk.gray(`   Table: ${tableName}`));
          console.log(chalk.gray(`   Region: ${stageConfig.region}`));
          console.log(chalk.gray(`   AWS Profile: ${stageConfig.awsProfile}`));
          console.log(chalk.gray(`   ${message}`));
          process.exit(1);
        }
      }

      const existingRequiredInputs = moduleConfig.requiredInputs || [];
      const setupRequiredInputs = setupQuestions.map((q) => `${setupStackName}.${q.propertyName}`);
      const merged = Array.from(new Set([...existingRequiredInputs, ...setupRequiredInputs]));
      moduleConfig.requiredInputs = merged;
      fs.writeFileSync(moduleConfigPath, JSON.stringify(moduleConfig, null, 2));

      console.log(chalk.green(`\n✅ Module added and configured: ${trimmed}/`));
    });
}
