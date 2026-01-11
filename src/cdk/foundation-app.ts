#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { FoundationStack } from './foundation-stack';


async function main() {
  const app = new cdk.App();

  // Get configuration from context
  const prefixName = app.node.tryGetContext('prefixName');
  const stageName = app.node.tryGetContext('stageName');
  const accountNumber = app.node.tryGetContext('accountNumber');
  const region = app.node.tryGetContext('region');
  const createdBy = app.node.tryGetContext('createdBy');

  if (!prefixName || !stageName || !accountNumber || !region) {
    throw new Error('Missing required context values. Please provide: prefixName, stageName, accountNumber, region');
  }

  const loadedConfig = {};
  const outputs: any[] = [];
  new FoundationStack(app, `${prefixName}-${stageName}-foundation`, {
    prefixName,
    stageName,
    moduleName: 'foundation',
    outputs,
    env: {
      account: accountNumber,
      region,
    },
    description: `WDK Foundation Stack for ${prefixName}-${stageName}`,
    tags: {
      Project: prefixName,
      Stage: stageName,
      Module: 'foundation',
      ManagedBy: 'WDK',
    },
    createdBy,
  });

  app.synth();
}

main().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});

/*--

#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { FoundationStack } from './foundation-stack';

async function main() {
  const app = new cdk.App();

  // Get configuration from context
  const prefixName = app.node.tryGetContext('prefixName');
  const stageName = app.node.tryGetContext('stageName');
  const accountNumber = app.node.tryGetContext('accountNumber');
  const region = app.node.tryGetContext('region');
  const createdBy = app.node.tryGetContext('createdBy');

  if (!prefixName || !stageName || !accountNumber || !region || !createdBy) {
    throw new Error('Missing required context values. Please provide: prefixName, stageName, accountNumber, region, createdBy');
  }

  new FoundationStack(app, `wdk-${prefixName}-${stageName}-foundation`, {
    prefixName,
    stageName,
    createdBy,
    env: {
      account: accountNumber,
      region,
    },
    description: `WDK Foundation Stack for ${prefixName}-${stageName}`,
    tags: {
      Project: prefixName,
      Stage: stageName,
      ManagedBy: 'WDK',
      CreatedBy: createdBy,
    },
  });

  app.synth();
}

main().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});

*/
