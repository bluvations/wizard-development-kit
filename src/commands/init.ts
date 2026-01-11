import { Command } from 'commander';
import inquirer from 'inquirer';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import chalk from 'chalk';
import { spawn } from 'child_process';

interface CoreConfig {
  projectPrefix: string;
  initiatedAt: string;
  developerName: string;
  stages: string[];
}

interface WdkS3DefaultsConfig {
  deepArchiveTransitionEnabled: boolean;
  deepArchiveTransitionUnit?: 'days' | 'weeks' | 'months' | 'years';
  deepArchiveTransitionValue?: number;
  expirationEnabled: boolean;
  expirationUnit?: 'days' | 'weeks' | 'months' | 'years';
  expirationValue?: number;
}

export function createInitCommand(): Command {
  return new Command('init')
    .description('Initialize a new Wizard project')
    .action(async () => {
      console.log('🔮 Initializing new Wizard project...\n');
      
      // Create wdk directory if it doesn't exist
      const wdkDir = path.join(process.cwd(), 'wdk');
      if (!fs.existsSync(wdkDir)) {
        fs.mkdirSync(wdkDir, { recursive: true });
        console.log('📁 Created wdk directory\n');
      }

      // Check if core.json already exists
      const coreJsonPath = path.join(wdkDir, 'core.json');
      if (fs.existsSync(coreJsonPath)) {
        console.log(chalk.red('⚠️  Project has already been initialized.'));
        console.log(chalk.red(`   Found existing core.json at: ${coreJsonPath}`));
        return;
      }

      // Get system username as default
      const systemUsername = os.userInfo().username || '';

      // Prompt for core configuration
      console.log('ℹ️  The project prefix will be prepended to all resource names along with the stage.');
      console.log('   Example: widgetco-dev, widgetco-stg, widgetco-prod\n');
      
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'projectPrefix',
          message: 'Enter a project prefix (max 10 characters, lowercase letters only):',
          validate: (input: string) => {
            const trimmed = input.trim().toLowerCase();
            if (!trimmed) {
              return 'Project prefix is required';
            }
            if (trimmed.length > 10) {
              return 'Project prefix must be 10 characters or less';
            }
            if (!/^[a-z]+$/.test(trimmed)) {
              return 'Project prefix must contain only lowercase letters (no numbers or special characters)';
            }
            return true;
          },
          filter: (input: string) => input.trim().toLowerCase(),
        },
        {
          type: 'input',
          name: 'developerName',
          message: 'Enter developer name:',
          default: systemUsername,
          validate: (input: string) => {
            if (!input.trim()) {
              return 'Developer name is required';
            }
            return true;
          },
        },
      ]);

      // Prompt for S3 lifecycle defaults
      console.log('\n📦 S3 Bucket Lifecycle Configuration');
      console.log('ℹ️  Configure default lifecycle policies for all S3 buckets created with WdkS3.');
      console.log('   These settings help manage storage costs by automatically transitioning or deleting old data.\n');

      const lifecycleAnswers: any = await (inquirer.prompt as any)([
        {
          type: 'confirm',
          name: 'enableDeepArchive',
          message: 'Enable automatic transition to Deep Archive storage class?',
          default: false,
        },
        {
          type: 'list',
          name: 'deepArchiveUnit',
          message: 'Select the time unit for Deep Archive transition:',
          choices: [
            { name: 'Days', value: 'days' },
            { name: 'Weeks', value: 'weeks' },
            { name: 'Months', value: 'months' },
            { name: 'Years', value: 'years' },
          ],
          default: 'months',
          when: (answers: any) => answers.enableDeepArchive,
        },
        {
          type: 'input',
          name: 'deepArchiveValue',
          message: (answers: any) => {
            const unit = answers.deepArchiveUnit;
            const unitLabel = unit.charAt(0).toUpperCase() + unit.slice(0, -1);
            return `How many ${unit} before moving to Deep Archive?`;
          },
          default: (answers: any) => {
            // Suggest defaults based on unit
            const defaults: Record<string, string> = {
              days: '90',
              weeks: '13',
              months: '12',
              years: '1',
            };
            return defaults[answers.deepArchiveUnit] || '1';
          },
          when: (answers: any) => answers.enableDeepArchive,
          validate: (input: string, answers?: any) => {
            const num = parseInt(input);
            if (isNaN(num) || num <= 0) {
              const unit = answers?.deepArchiveUnit || 'units';
              return `Please enter a positive number of ${unit}`;
            }
            
            // Convert to days and check minimum (only if we have the unit)
            if (answers?.deepArchiveUnit) {
              const daysMap: Record<string, number> = {
                days: 1,
                weeks: 7,
                months: 31,
                years: 366,
              };
              const totalDays = num * daysMap[answers.deepArchiveUnit];
              if (totalDays < 90) {
                return 'Deep Archive transition requires a minimum of 90 days (approximately 3 months)';
              }
            }
            return true;
          },
          filter: (input: string) => parseInt(input),
        },
        {
          type: 'confirm',
          name: 'enableExpiration',
          message: 'Enable automatic deletion of old files?',
          default: false,
        },
        {
          type: 'list',
          name: 'expirationUnit',
          message: 'Select the time unit for file expiration:',
          choices: [
            { name: 'Days', value: 'days' },
            { name: 'Weeks', value: 'weeks' },
            { name: 'Months', value: 'months' },
            { name: 'Years', value: 'years' },
          ],
          default: 'years',
          when: (answers: any) => answers.enableExpiration,
        },
        {
          type: 'input',
          name: 'expirationValue',
          message: (answers: any) => {
            const unit = answers.expirationUnit;
            return `How many ${unit} before permanently deleting files?`;
          },
          default: (answers: any) => {
            // Suggest defaults based on unit
            const defaults: Record<string, string> = {
              days: '365',
              weeks: '52',
              months: '24',
              years: '7',
            };
            return defaults[answers.expirationUnit] || '1';
          },
          when: (answers: any) => answers.enableExpiration,
          validate: (input: string, answers: any) => {
            const num = parseInt(input);
            if (isNaN(num) || num <= 0) {
              return `Please enter a positive number of ${answers.expirationUnit}`;
            }
            return true;
          },
          filter: (input: string) => parseInt(input),
        },
      ]);

      // Store unit and value directly (no conversion needed)
      const deepArchiveUnit = lifecycleAnswers.enableDeepArchive
        ? lifecycleAnswers.deepArchiveUnit
        : undefined;
      const deepArchiveValue = lifecycleAnswers.enableDeepArchive
        ? lifecycleAnswers.deepArchiveValue
        : undefined;

      const expirationUnit = lifecycleAnswers.enableExpiration
        ? lifecycleAnswers.expirationUnit
        : undefined;
      const expirationValue = lifecycleAnswers.enableExpiration
        ? lifecycleAnswers.expirationValue
        : undefined;

      // Create core configuration
      const coreConfig: CoreConfig = {
        projectPrefix: answers.projectPrefix,
        initiatedAt: new Date().toLocaleString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZoneName: 'short',
        }),
        developerName: answers.developerName.trim(),
        stages: [],
      };

      // Write core.json
      fs.writeFileSync(coreJsonPath, JSON.stringify(coreConfig, null, 2));
      console.log(`\n📝 Created ${coreJsonPath}`);

      // Create WdkS3 defaults configuration
      const wdkS3DefaultsConfig: WdkS3DefaultsConfig = {
        deepArchiveTransitionEnabled: lifecycleAnswers.enableDeepArchive || false,
        deepArchiveTransitionUnit: deepArchiveUnit,
        deepArchiveTransitionValue: deepArchiveValue,
        expirationEnabled: lifecycleAnswers.enableExpiration || false,
        expirationUnit: expirationUnit,
        expirationValue: expirationValue,
      };

      const wdkS3DefaultsPath = path.join(wdkDir, 'wdk-s3-defaults.json');
      fs.writeFileSync(wdkS3DefaultsPath, JSON.stringify(wdkS3DefaultsConfig, null, 2));
      console.log(`📝 Created ${wdkS3DefaultsPath}`);

      // Log the lifecycle configuration
      console.log('\n📋 S3 Lifecycle Configuration:');
      if (wdkS3DefaultsConfig.deepArchiveTransitionEnabled) {
        console.log(`   ✓ Deep Archive: Enabled (after ${wdkS3DefaultsConfig.deepArchiveTransitionValue} ${wdkS3DefaultsConfig.deepArchiveTransitionUnit})`);
      } else {
        console.log('   ✗ Deep Archive: Disabled');
      }
      if (wdkS3DefaultsConfig.expirationEnabled) {
        console.log(`   ✓ Expiration: Enabled (after ${wdkS3DefaultsConfig.expirationValue} ${wdkS3DefaultsConfig.expirationUnit})`);
      } else {
        console.log('   ✗ Expiration: Disabled');
      }

      // Create package.json in project root for CDK dependencies
      const projectPackageJson = {
        name: `${answers.projectPrefix}-infrastructure`,
        version: '1.0.0',
        description: `Infrastructure for ${answers.projectPrefix} project`,
        private: true,
        scripts: {
          'build': 'tsc',
          'watch': 'tsc --watch',
        },
        dependencies: {
          'aws-cdk-lib': '^2.220.0',
          'constructs': '^10.4.2',
          '@aws-sdk/client-dynamodb': '^3.908.0',
          '@aws-sdk/util-dynamodb': '^3.908.0',
        },
        devDependencies: {
          '@types/node': '^24.7.2',
          'typescript': '^5.9.3',
        },
      };

      const packageJsonPath = path.join(process.cwd(), 'package.json');
      if (!fs.existsSync(packageJsonPath)) {
        fs.writeFileSync(packageJsonPath, JSON.stringify(projectPackageJson, null, 2));
        console.log(`📝 Created ${packageJsonPath}`);
      } else {
        console.log(chalk.yellow(`⚠️  package.json already exists, skipping creation`));
      }

      // Create tsconfig.json in project root
      const tsconfig = {
        compilerOptions: {
          target: 'ES2020',
          module: 'commonjs',
          lib: ['ES2020'],
          declaration: true,
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          forceConsistentCasingInFileNames: true,
          resolveJsonModule: true,
          moduleResolution: 'node',
        },
        exclude: ['node_modules', 'cdk.out'],
      };

      const tsconfigPath = path.join(process.cwd(), 'tsconfig.json');
      if (!fs.existsSync(tsconfigPath)) {
        fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2));
        console.log(`📝 Created ${tsconfigPath}`);
      } else {
        console.log(chalk.yellow(`⚠️  tsconfig.json already exists, skipping creation`));
      }

      // Copy config-loader.ts to wdk directory
      // Look for the source in the original src directory (for development) or bundled location
      let configLoaderSource = path.join(__dirname, '..', '..', 'src', 'cdk', 'config-loader.ts');
      if (!fs.existsSync(configLoaderSource)) {
        // Try relative to dist directory
        configLoaderSource = path.join(__dirname, '..', 'cdk', 'config-loader.ts');
      }
      
      const configLoaderDest = path.join(wdkDir, 'config-loader.ts');
      
      if (fs.existsSync(configLoaderSource)) {
        fs.copyFileSync(configLoaderSource, configLoaderDest);
        console.log(`📝 Created ${configLoaderDest}`);
      } else {
        console.log(chalk.yellow(`⚠️  Could not find config-loader.ts source file`));
      }

      // Copy config-manager.ts to wdk directory
      let configManagerSource = path.join(__dirname, '..', '..', 'src', 'cdk', 'config-manager.ts');
      if (!fs.existsSync(configManagerSource)) {
        configManagerSource = path.join(__dirname, '..', 'cdk', 'config-manager.ts');
      }
      
      const configManagerDest = path.join(wdkDir, 'config-manager.ts');
      
      if (fs.existsSync(configManagerSource)) {
        fs.copyFileSync(configManagerSource, configManagerDest);
        console.log(`📝 Created ${configManagerDest}`);
      } else {
        console.log(chalk.yellow(`⚠️  Could not find config-manager.ts source file`));
      }

      // Copy wdk-module.ts to wdk directory
      let wdkModuleSource = path.join(__dirname, '..', '..', 'src', 'cdk', 'wdk-module.ts');
      if (!fs.existsSync(wdkModuleSource)) {
        wdkModuleSource = path.join(__dirname, '..', 'cdk', 'wdk-module.ts');
      }
      
      const wdkModuleDest = path.join(wdkDir, 'wdk-module.ts');
      
      if (fs.existsSync(wdkModuleSource)) {
        fs.copyFileSync(wdkModuleSource, wdkModuleDest);
        console.log(`📝 Created ${wdkModuleDest}`);
      } else {
        console.log(chalk.yellow(`⚠️  Could not find wdk-module.ts source file`));
      }

      // Copy constructs directory to wdk directory
      let constructsSourceDir = path.join(__dirname, '..', '..', 'src', 'cdk', 'constructs');
      if (!fs.existsSync(constructsSourceDir)) {
        constructsSourceDir = path.join(__dirname, '..', 'cdk', 'constructs');
      }
      
      const constructsDestDir = path.join(wdkDir, 'constructs');
      
      if (fs.existsSync(constructsSourceDir)) {
        // Create constructs directory if it doesn't exist
        if (!fs.existsSync(constructsDestDir)) {
          fs.mkdirSync(constructsDestDir, { recursive: true });
        }
        
        // Copy all files from constructs directory
        const constructFiles = fs.readdirSync(constructsSourceDir);
        for (const file of constructFiles) {
          const sourcePath = path.join(constructsSourceDir, file);
          const destPath = path.join(constructsDestDir, file);
          
          if (fs.statSync(sourcePath).isFile()) {
            fs.copyFileSync(sourcePath, destPath);
            console.log(`📝 Created ${destPath}`);
          }
        }
      } else {
        console.log(chalk.yellow(`⚠️  Could not find constructs directory`));
      }

      console.log('\n✨ Initialization complete!');
      console.log('\nProject Configuration:');
      console.log(`  Project Prefix: ${coreConfig.projectPrefix}`);
      console.log(`  Developer: ${coreConfig.developerName}`);
      console.log(`  Initiated: ${coreConfig.initiatedAt}`);
      
      // Run npm install automatically
      console.log('\n📦 Installing dependencies...');
      console.log(chalk.gray('   Running npm install...'));
      
      const npmInstallSuccess = await new Promise<boolean>((resolve) => {
        const npmProcess = spawn('npm', ['install'], {
          cwd: process.cwd(),
          stdio: 'inherit',
          shell: true,
        });

        npmProcess.on('close', (code) => {
          resolve(code === 0);
        });

        npmProcess.on('error', (error) => {
          console.log(chalk.red(`\n   Error running npm install: ${error.message}`));
          resolve(false);
        });
      });

      if (npmInstallSuccess) {
        console.log(chalk.green('\n✅ Dependencies installed successfully!'));
      } else {
        console.log(chalk.yellow('\n⚠️  npm install failed. Please run "npm install" manually.'));
      }
      
      console.log('\n📦 Next Steps:');
      console.log(chalk.gray('  1. Run "conjure add-stage" to add your first deployment stage'));
      console.log(chalk.gray('  2. Run "conjure create-module" to create your first infrastructure module'));
    });
}
