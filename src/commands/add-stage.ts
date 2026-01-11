import { Command } from 'commander';
import inquirer from 'inquirer';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import chalk from 'chalk';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { fromIni } from '@aws-sdk/credential-providers';
import { spawn } from 'child_process';

const AVAILABLE_STAGES = ['local', 'dev', 'test', 'prod'];

const AWS_REGIONS = [
  { name: 'US East (N. Virginia)', value: 'us-east-1' },
  { name: 'US East (Ohio)', value: 'us-east-2' },
  { name: 'US West (N. California)', value: 'us-west-1' },
  { name: 'US West (Oregon)', value: 'us-west-2' },
  { name: 'Europe (Ireland)', value: 'eu-west-1' },
  { name: 'Europe (London)', value: 'eu-west-2' },
  { name: 'Europe (Paris)', value: 'eu-west-3' },
  { name: 'Europe (Frankfurt)', value: 'eu-central-1' },
  { name: 'Europe (Stockholm)', value: 'eu-north-1' },
  { name: 'Asia Pacific (Tokyo)', value: 'ap-northeast-1' },
  { name: 'Asia Pacific (Seoul)', value: 'ap-northeast-2' },
  { name: 'Asia Pacific (Singapore)', value: 'ap-southeast-1' },
  { name: 'Asia Pacific (Sydney)', value: 'ap-southeast-2' },
  { name: 'Asia Pacific (Mumbai)', value: 'ap-south-1' },
  { name: 'Canada (Central)', value: 'ca-central-1' },
  { name: 'South America (São Paulo)', value: 'sa-east-1' },
];

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

function getAwsProfiles(): string[] {
  const profiles: string[] = ['inherit'];
  const credentialsPath = path.join(os.homedir(), '.aws', 'credentials');
  
  if (fs.existsSync(credentialsPath)) {
    const content = fs.readFileSync(credentialsPath, 'utf-8');
    const profileMatches = content.match(/\[([^\]]+)\]/g);
    
    if (profileMatches) {
      profileMatches.forEach(match => {
        const profileName = match.replace(/[\[\]]/g, '');
        if (profileName && profileName !== 'default') {
          profiles.push(profileName);
        }
      });
    }
  }
  
  return profiles;
}

async function getAwsAccountNumber(profile: string, region: string): Promise<string> {
  try {
    let stsClient: STSClient;
    
    if (profile === 'inherit') {
      // Use default credentials from environment
      stsClient = new STSClient({ region });
    } else {
      // Use named profile
      stsClient = new STSClient({
        region,
        credentials: fromIni({ profile }),
      });
    }

    const command = new GetCallerIdentityCommand({});
    const response = await stsClient.send(command);
    
    return response.Account || '';
  } catch (error) {
    // If we can't get credentials, return empty default
    console.log(chalk.yellow(`   ⚠️  Could not retrieve AWS account number for profile "${profile}"`));
    return '';
  }
}

function getDefaultRegion(profile: string): string {
  try {
    const configPath = path.join(os.homedir(), '.aws', 'config');
    
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      
      // Look for the profile section
      const profileSection = profile === 'inherit' ? '[default]' : `[profile ${profile}]`;
      const sectionIndex = content.indexOf(profileSection);
      
      if (sectionIndex !== -1) {
        // Find the region line within this profile section
        const afterSection = content.substring(sectionIndex);
        const nextSection = afterSection.indexOf('[', 1);
        const profileContent = nextSection !== -1 ? afterSection.substring(0, nextSection) : afterSection;
        
        const regionMatch = profileContent.match(/region\s*=\s*([^\s\n]+)/);
        if (regionMatch && regionMatch[1]) {
          return regionMatch[1];
        }
      }
    }
  } catch (error) {
    // Ignore errors, will return default
  }
  
  return 'us-east-1';
}

async function runCdkBootstrap(
  accountNumber: string,
  region: string,
  awsProfile: string,
  outputDir: string
): Promise<boolean> {
  return new Promise((resolve) => {
    // Get the path to the local CDK installation
    const cdkPath = path.join(__dirname, '..', '..', 'node_modules', '.bin', 'cdk');
    
    // Build the bootstrap command arguments
    const args = [
      'bootstrap',
      `aws://${accountNumber}/${region}`,
      '--output', outputDir,
    ];

    // Add profile if not inherit
    if (awsProfile !== 'inherit') {
      args.push('--profile', awsProfile);
    }

    // Set environment variables
    const env = { ...process.env };
    if (awsProfile !== 'inherit') {
      env.AWS_PROFILE = awsProfile;
    }
    env.AWS_REGION = region;

    // Spawn the CDK process
    const cdkProcess = spawn(cdkPath, args, {
      env,
      stdio: 'inherit', // Show CDK output in real-time
      shell: true,
    });

    cdkProcess.on('close', (code) => {
      if (code === 0) {
        resolve(true);
      } else {
        resolve(false);
      }
    });

    cdkProcess.on('error', (error) => {
      console.log(chalk.red(`\n   Error running CDK: ${error.message}`));
      resolve(false);
    });
  });
}

async function deployFoundationStack(
  prefixName: string,
  stageName: string,
  accountNumber: string,
  region: string,
  awsProfile: string,
  createdBy: string,
  projectWdkDir: string
): Promise<boolean> {
  return new Promise((resolve) => {
    // Get the path to the local CDK installation and foundation app
    const cdkPath = path.join(__dirname, '..', '..', 'node_modules', '.bin', 'cdk');
    
    // Look for foundation app in the WDK package
    let foundationAppPath = path.join(__dirname, '..', 'cdk', 'foundation-app.js');
    let useNode = true;
    
    if (!fs.existsSync(foundationAppPath)) {
      // Try the source location for development
      foundationAppPath = path.join(__dirname, '..', '..', 'src', 'cdk', 'foundation-app.ts');
      useNode = false; // Use ts-node for TypeScript files
    }
    
    // Determine the working directory - use WDK package directory for foundation stack
    const wdkPackageDir = path.join(__dirname, '..', '..');
    // Output to the project's wdk directory
    const cdkOutDir = path.join(projectWdkDir, 'cdk.out');
    
    // Build the app command with proper quoting
    const appCommand = useNode 
      ? `"node ${foundationAppPath}"` 
      : `"npx ts-node ${foundationAppPath}"`;
    
    // Build the deploy command arguments
    const args = [
      'deploy',
      `wdk-${prefixName}-${stageName}-foundation`,
      '--require-approval', 'never',
      '--output', cdkOutDir,
      '--app', appCommand,
      '--context', `prefixName=${prefixName}`,
      '--context', `stageName=${stageName}`,
      '--context', `accountNumber=${accountNumber}`,
      '--context', `region=${region}`,
      '--context', `createdBy=${createdBy}`,
    ];

    // Add profile if not inherit
    if (awsProfile !== 'inherit') {
      args.push('--profile', awsProfile);
    }

    // Set environment variables
    const env = { ...process.env };
    if (awsProfile !== 'inherit') {
      env.AWS_PROFILE = awsProfile;
    }
    env.AWS_REGION = region;

    // Spawn the CDK process
    const cdkProcess = spawn(cdkPath, args, {
      cwd: wdkPackageDir, // Run from WDK package directory
      env,
      stdio: 'inherit', // Show CDK output in real-time
      shell: false, // Don't use shell to avoid security warnings
    });

    cdkProcess.on('close', (code) => {
      if (code === 0) {
        resolve(true);
      } else {
        resolve(false);
      }
    });

    cdkProcess.on('error', (error) => {
      console.log(chalk.red(`\n   Error deploying foundation stack: ${error.message}`));
      resolve(false);
    });
  });
}

export function createAddStageCommand(): Command {
  return new Command('add-stage')
    .description('Add a new stage configuration to the project')
    .action(async () => {
      console.log('🎯 Adding a new stage...\n');
      
      // Check if project is initialized
      const wdkDir = path.join(process.cwd(), 'wdk');
      const coreJsonPath = path.join(wdkDir, 'core.json');
      
      if (!fs.existsSync(coreJsonPath)) {
        console.log(chalk.red('❌ Project not initialized. Please run "conjure init" first.'));
        return;
      }

      // Read core.json to get existing stages
      const coreConfig: CoreConfig = JSON.parse(fs.readFileSync(coreJsonPath, 'utf-8'));
      const existingStages = coreConfig.stages || [];

      // Filter out already created stages
      const availableStages = AVAILABLE_STAGES.filter(stage => !existingStages.includes(stage));

      if (availableStages.length === 0) {
        console.log(chalk.yellow('⚠️  All stages have already been created.'));
        console.log(`   Existing stages: ${existingStages.join(', ')}`);
        return;
      }

      // Get AWS profiles
      const awsProfiles = getAwsProfiles();

      // Step 1: Select stage
      const stageAnswer = await inquirer.prompt([
        {
          type: 'list',
          name: 'stageName',
          message: 'Select a stage to add:',
          choices: availableStages,
        },
      ]);

      // Step 2: Select AWS profile first
      const profileAnswer = await inquirer.prompt([
        {
          type: 'list',
          name: 'awsProfile',
          message: 'Select AWS profile to use:',
          choices: awsProfiles,
          default: 'inherit',
        },
      ]);

      // Step 3: Get default region from profile
      const defaultRegion = getDefaultRegion(profileAnswer.awsProfile);

      // Step 4: Select region
      const regionAnswer = await inquirer.prompt([
        {
          type: 'list',
          name: 'region',
          message: 'Select AWS region:',
          choices: AWS_REGIONS,
          default: defaultRegion,
        },
      ]);

      // Step 5: Get account number from profile using the selected region
      console.log(chalk.cyan('\n   Retrieving AWS account number...'));
      const defaultAccount = await getAwsAccountNumber(profileAnswer.awsProfile, regionAnswer.region);

      // Step 6: Prompt for account number with default
      const accountAnswer = await inquirer.prompt([
        {
          type: 'input',
          name: 'accountNumber',
          message: 'Enter AWS Account Number (12 digits):',
          default: defaultAccount,
          validate: (input: string) => {
            const trimmed = input.trim();
            if (!trimmed) {
              return 'Account number is required';
            }
            if (!/^\d{12}$/.test(trimmed)) {
              return 'Account number must be exactly 12 digits';
            }
            return true;
          },
        },
      ]);

      // Combine all answers
      const answers = {
        ...stageAnswer,
        ...profileAnswer,
        ...regionAnswer,
        ...accountAnswer,
      };

      // Get current user
      const currentUser = os.userInfo().username || 'unknown';
      const timestamp = new Date().toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short',
      });

      // Create stage configuration
      const stageConfig: StageConfig = {
        accountNumber: answers.accountNumber.trim(),
        region: answers.region,
        awsProfile: answers.awsProfile,
        addedBy: currentUser,
        addedAt: timestamp,
        lastUpdated: timestamp,
      };

      // Run CDK bootstrap before writing files
      console.log(chalk.cyan('\n🚀 Running CDK bootstrap...'));
      console.log(chalk.gray(`   This will bootstrap AWS CDK in account ${stageConfig.accountNumber} (${stageConfig.region})`));
      
      const cdkBootstrapSuccess = await runCdkBootstrap(
        stageConfig.accountNumber,
        stageConfig.region,
        stageConfig.awsProfile,
        wdkDir
      );

      if (!cdkBootstrapSuccess) {
        console.log(chalk.red('\n❌ CDK bootstrap failed. Stage not created.'));
        return;
      }

      console.log(chalk.green('✅ CDK bootstrap completed successfully'));

      // Deploy foundation stack
      console.log(chalk.cyan('\n🏗️  Deploying foundation stack...'));
      console.log(chalk.gray(`   Creating DynamoDB config table: wdk-${coreConfig.projectPrefix}-${answers.stageName}-config`));
      
      const foundationDeploySuccess = await deployFoundationStack(
        coreConfig.projectPrefix,
        answers.stageName,
        stageConfig.accountNumber,
        stageConfig.region,
        stageConfig.awsProfile,
        currentUser,
        wdkDir
      );

      if (!foundationDeploySuccess) {
        console.log(chalk.red('\n❌ Foundation stack deployment failed. Stage not created.'));
        return;
      }

      console.log(chalk.green('✅ Foundation stack deployed successfully'));

      // Write stage JSON file
      const stageFilePath = path.join(wdkDir, `${answers.stageName}.json`);
      fs.writeFileSync(stageFilePath, JSON.stringify(stageConfig, null, 2));
      console.log(`\n📝 Created ${stageFilePath}`);

      // Update core.json with new stage
      coreConfig.stages.push(answers.stageName);
      fs.writeFileSync(coreJsonPath, JSON.stringify(coreConfig, null, 2));
      console.log(`✅ Updated core.json with stage: ${answers.stageName}`);

      console.log('\n✨ Stage added successfully!');
      console.log('\nStage Configuration:');
      console.log(`  Stage: ${answers.stageName}`);
      console.log(`  Account: ${stageConfig.accountNumber}`);
      console.log(`  Region: ${stageConfig.region}`);
      console.log(`  AWS Profile: ${stageConfig.awsProfile}`);
      console.log(`  Added By: ${stageConfig.addedBy}`);
      console.log(`  Added At: ${stageConfig.addedAt}`);
    });
}
