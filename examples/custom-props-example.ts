/**
 * Example demonstrating custom props in WdkModule
 * This file is for documentation purposes and shows proper TypeScript typing
 */

import { WdkModule, WdkModuleProps } from '../src/cdk/wdk-module';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { WdkS3 } from '../src/cdk/constructs';

// Define custom props interface
export interface ExampleModuleProps extends WdkModuleProps {
  // Custom properties
  readonly databaseName: string;
  readonly enableBackups?: boolean;
  readonly retentionDays?: number;
  readonly customTags?: { [key: string]: string };
}

// Extend WdkModule with type parameter
export class ExampleModule extends WdkModule<ExampleModuleProps> {
  constructor(scope: Construct, id: string, props: ExampleModuleProps) {
    super(scope, id, props);
  }

  protected initialize(): void {
    // ✅ These should all have proper type inference and autocomplete
    const dbName = this.props.databaseName;           // Type: string
    const backups = this.props.enableBackups;         // Type: boolean | undefined
    const retention = this.props.retentionDays;       // Type: number | undefined
    const tags = this.props.customTags;               // Type: { [key: string]: string } | undefined
    
    // ✅ Base props are still accessible directly
    const prefix = this.prefixName;                   // Type: string
    const stage = this.stageName;                     // Type: string
    const module = this.moduleName;                   // Type: string
    
    // ✅ Helper methods work
    const fullPrefix = this.getPrefix();              // Returns '{prefixName}-{stageName}'
    const encryptionKey = this.getFoundationEncryptionKey();
    
    // Use the props to create resources
    const table = new dynamodb.Table(this, 'Table', {
      tableName: `${fullPrefix}-${dbName}`,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      encryptionKey: encryptionKey,
      pointInTimeRecovery: backups ?? true,
    });
    
    const bucket = new WdkS3(this, 'Bucket', {
      prefix: fullPrefix,
      bucketName: `${fullPrefix}-${this.moduleName}`,
      encryptionKey: encryptionKey,
      serverAccessLogsPrefix: `${this.moduleName}/`,
    });
    
    // Apply custom tags if provided
    if (tags) {
      Object.entries(tags).forEach(([key, value]) => {
        // Tags logic here
      });
    }
    
    console.log(`Created resources with retention: ${retention ?? 30} days`);
  }
}

// Example usage
/*
const example = new ExampleModule(app, 'Example', {
  prefixName: 'myproject',
  stageName: 'dev',
  moduleName: 'example',
  
  // Custom props - these should have autocomplete
  databaseName: 'users',
  enableBackups: true,
  retentionDays: 90,
  customTags: {
    Team: 'Engineering',
    Environment: 'Development',
  },
});
*/
