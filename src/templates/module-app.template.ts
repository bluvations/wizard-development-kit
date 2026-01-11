#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { {{MODULE_NAME_PASCAL}}Stack } from './{{MODULE_NAME_KEBAB}}-stack';
import { loadConfigFromDynamoDB, getConfigTableName } from '../wdk/config-loader';

async function main() {
  const app = new cdk.App();

  // Get configuration from context
  const prefixName = app.node.tryGetContext('prefixName');
  const stageName = app.node.tryGetContext('stageName');
  const accountNumber = app.node.tryGetContext('accountNumber');
  const region = app.node.tryGetContext('region');

  if (!prefixName || !stageName || !accountNumber || !region) {
    throw new Error('Missing required context values. Please provide: prefixName, stageName, accountNumber, region');
  }

  // Parse required inputs from context (comma-separated list)
  const requiredInputsStr = app.node.tryGetContext('requiredInputs');
  const requiredInputs = requiredInputsStr ? requiredInputsStr.split(',').map((s: string) => s.trim()) : [];

  // Parse outputs from context (JSON string)
  const outputsStr = app.node.tryGetContext('outputs');
  const outputs = outputsStr ? JSON.parse(outputsStr) : [];

  // Load configuration from DynamoDB at synthesis time
  const tableName = getConfigTableName(prefixName, stageName);
  const loadedConfig = await loadConfigFromDynamoDB(tableName, requiredInputs, region);

  console.log(`Loaded ${Object.keys(loadedConfig).length} config values from DynamoDB`);
  if (Object.keys(loadedConfig).length > 0) {
    console.log('Config values:', Object.keys(loadedConfig).join(', '));
  }

  new {{MODULE_NAME_PASCAL}}Stack(app, `wdk-${prefixName}-${stageName}-{{MODULE_NAME_KEBAB}}`, {
    prefixName,
    stageName,
    moduleName: '{{MODULE_NAME_KEBAB}}',
    loadedConfig,
    outputs,
    env: {
      account: accountNumber,
      region,
    },
    description: `WDK {{MODULE_NAME_PASCAL}} Module for ${prefixName}-${stageName}`,
    tags: {
      Project: prefixName,
      Stage: stageName,
      Module: '{{MODULE_NAME_KEBAB}}',
      ManagedBy: 'WDK',
    },
  });

  app.synth();
}

main().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});
