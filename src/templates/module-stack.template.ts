import { WdkModule, WdkModuleProps } from '../wdk/wdk-module';
import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import { WdkS3 } from '../wdk/constructs';

export interface {{MODULE_NAME_PASCAL}}StackProps extends WdkModuleProps {
  // Add custom properties for your module here
  // Example:
  // readonly enableFeatureX?: boolean;
  // readonly customSetting?: string;
}

/**
 * {{MODULE_NAME_PASCAL}} Module Stack
 * 
 * This module can read configuration from other stacks and write outputs
 * for other stacks to consume via the shared DynamoDB config table.
 * 
 * Example usage:
 * 
 * // Reading inputs from other stacks:
 * const foundationCreatedAt = this.getInput('foundation', 'createdAt');
 * 
 * // Accessing custom module props:
 * const customValue = this.props.customSetting;
 * 
 * // Writing outputs for other stacks (pass in constructor props):
 * outputs: [
 *   { propertyName: 'bucketName', value: bucket.bucketName, type: 'string' },
 *   { propertyName: 'bucketArn', value: bucket.bucketArn, type: 'arn' }
 * ]
 */
export class {{MODULE_NAME_PASCAL}}Stack extends WdkModule<{{MODULE_NAME_PASCAL}}StackProps> {
  constructor(scope: Construct, id: string, props: {{MODULE_NAME_PASCAL}}StackProps) {
    super(scope, id, props);
  }

  protected initialize(): void {
    // Add your CDK resources here
    
    // Example: Access custom props
    // const enableFeature = this.props.enableFeatureX ?? false;
    
    // Example: Reading from config table
    // const someValue = this.getInput('otherStack', 'propertyName');
    
    // Example: Get foundation resources
    // const encryptionKey = this.getFoundationEncryptionKey();
    // const prefix = this.getPrefix(); // Returns '{prefixName}-{stageName}'
    
    // Example: Create a secure S3 bucket using WdkS3 construct
    // The construct automatically uses the foundation access logs bucket
    // const dataBucket = new WdkS3(this, 'DataBucket', {
    //   prefix: prefix,
    //   bucketName: `${prefix}-${this.moduleName}-data`,
    //   encryptionKey: encryptionKey,
    //   serverAccessLogsPrefix: `${this.moduleName}/data-bucket/`,
    //   versioned: true,
    // });
    
    // Example: Creating outputs
    // this.createOutput('DataBucketName', dataBucket.bucketName, 'string', true);
    // this.createOutput('DataBucketArn', dataBucket.bucketArn, 'arn', true);
    
    // TODO: Implement your module logic here
  }
}
