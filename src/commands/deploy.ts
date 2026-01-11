import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { spawn } from 'child_process';

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

interface ModuleConfig {
  moduleName: string;
  description: string;
  createdAt: string;
  createdBy: string;
  requiredInputs: string[];
  outputs: any[];
}

export function createDeployCommand(): Command {
  return new Command('deploy')
    .description('Deploy a specific module to a stage')
    .argument('<stage>', 'Stage to deploy to (e.g., local, dev, prod)')
    .argument('<module>', 'Module to deploy (e.g., network, api)')
    .action(async (stageName: string, moduleName: string) => {
      console.log(`🚀 Deploying ${chalk.cyan(moduleName)} to ${chalk.cyan(stageName)}...\n`);

      // Check if project is initialized
      const wdkDir = path.join(process.cwd(), 'wdk');
      const coreJsonPath = path.join(wdkDir, 'core.json');
      
      if (!fs.existsSync(coreJsonPath)) {
        console.log(chalk.red('❌ No core.json found. Please run "conjure init" first.'));
        return;
      }

      // Load core config
      const coreConfig: CoreConfig = JSON.parse(fs.readFileSync(coreJsonPath, 'utf-8'));

      // Check if stage exists
      const stageJsonPath = path.join(wdkDir, `${stageName}.json`);
      if (!fs.existsSync(stageJsonPath)) {
        console.log(chalk.red(`❌ Stage "${stageName}" not found.`));
        console.log(chalk.gray(`   Available stages: ${coreConfig.stages.join(', ')}`));
        console.log(chalk.gray(`   Run "conjure add-stage" to add a new stage.`));
        return;
      }

      // Load stage config
      const stageConfig: StageConfig = JSON.parse(fs.readFileSync(stageJsonPath, 'utf-8'));

      // Check if module exists
      const moduleDir = path.join(process.cwd(), moduleName);
      if (!fs.existsSync(moduleDir)) {
        console.log(chalk.red(`❌ Module "${moduleName}" not found.`));
        console.log(chalk.gray(`   Run "conjure create-module" to create a new module.`));
        return;
      }

      // Check if module has config
      const moduleConfigPath = path.join(moduleDir, 'module-config.json');
      if (!fs.existsSync(moduleConfigPath)) {
        console.log(chalk.red(`❌ Module config not found at ${moduleConfigPath}`));
        return;
      }

      // Load module config
      const moduleConfig: ModuleConfig = JSON.parse(fs.readFileSync(moduleConfigPath, 'utf-8'));

      // Check if module app exists
      const moduleAppPath = path.join(moduleDir, `${moduleName}-app.ts`);
      if (!fs.existsSync(moduleAppPath)) {
        console.log(chalk.red(`❌ Module app not found at ${moduleAppPath}`));
        return;
      }

      console.log(chalk.cyan('📋 Deployment Configuration:'));
      console.log(`   Project: ${coreConfig.projectPrefix}`);
      console.log(`   Stage: ${stageName}`);
      console.log(`   Module: ${moduleName}`);
      console.log(`   Account: ${stageConfig.accountNumber}`);
      console.log(`   Region: ${stageConfig.region}`);
      console.log(`   AWS Profile: ${stageConfig.awsProfile}`);
      
      if (moduleConfig.requiredInputs && moduleConfig.requiredInputs.length > 0) {
        console.log(`   Required Inputs: ${moduleConfig.requiredInputs.join(', ')}`);
      }

      // Run CDK deploy
      console.log(chalk.cyan('\n🏗️  Running CDK deploy...\n'));

      // Use npx to run cdk from the project's node_modules
      const cdkCommand = 'npx';
      
      const args = [
        'cdk',
        'deploy',
        '--require-approval', 'never',
        '--context', `prefixName=${coreConfig.projectPrefix}`,
        '--context', `stageName=${stageName}`,
        '--context', `accountNumber=${stageConfig.accountNumber}`,
        '--context', `region=${stageConfig.region}`,
      ];

      // Add required inputs if any
      if (moduleConfig.requiredInputs && moduleConfig.requiredInputs.length > 0) {
        args.push('--context', `requiredInputs=${moduleConfig.requiredInputs.join(',')}`);
      }

      // Add outputs if any
      if (moduleConfig.outputs && moduleConfig.outputs.length > 0) {
        args.push('--context', `outputs=${JSON.stringify(moduleConfig.outputs)}`);
      }

      // Add profile if not inherit
      if (stageConfig.awsProfile !== 'inherit') {
        args.push('--profile', stageConfig.awsProfile);
      }

      // Add app argument to point to the module's app file
      args.push('--app', `npx ts-node ${moduleName}/${moduleName}-app.ts`);

      // Set environment variables
      const env = { ...process.env };
      if (stageConfig.awsProfile !== 'inherit') {
        env.AWS_PROFILE = stageConfig.awsProfile;
      }
      env.AWS_REGION = stageConfig.region;

      const deploySuccess = await new Promise<boolean>((resolve) => {
        const cdkProcess = spawn(cdkCommand, args, {
          cwd: process.cwd(),
          env,
          stdio: 'inherit',
          shell: false,
        });

        cdkProcess.on('close', (code) => {
          resolve(code === 0);
        });

        cdkProcess.on('error', (error) => {
          console.log(chalk.red(`\n   Error running CDK: ${error.message}`));
          resolve(false);
        });
      });

      if (deploySuccess) {
        console.log(chalk.green('\n✅ Deployment successful!'));
      } else {
        console.log(chalk.red('\n❌ Deployment failed.'));
        process.exit(1);
      }
    });
}
