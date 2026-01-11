import * as cdk from 'aws-cdk-lib';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { ConfigWriter, getConfigTableName } from './config-manager';
import { LoadedConfig } from './config-loader';
import * as fs from 'fs';
import * as path from 'path';

export interface WdkModuleProps extends cdk.StackProps {
  prefixName: string;
  stageName: string;
  moduleName: string;
  /**
   * Configuration values loaded from DynamoDB at synthesis time
   * Format: { "stackName.propertyName": "value" }
   */
  loadedConfig?: LoadedConfig;
  /**
   * Configuration properties to write for other stacks to consume
   */
  outputs?: Array<{
    propertyName: string;
    value: any;
    type: string;
  }>;
}

/**
 * Base class for WDK modules that provides automatic config table integration
 */
export abstract class WdkModule<T extends WdkModuleProps = WdkModuleProps> extends cdk.Stack {
  protected readonly prefixName: string;
  protected readonly stageName: string;
  protected readonly moduleName: string;
  protected readonly configTableName: string;
  protected readonly loadedConfig: LoadedConfig;
  protected readonly props: Omit<T, 'prefixName' | 'stageName' | 'moduleName' | 'loadedConfig' | 'outputs'>;
  private readonly moduleOutputs: Array<{ propertyName: string; value: any; type: string }> = [];

  constructor(scope: Construct, id: string, props: T) {
    super(scope, id, props);

    this.prefixName = props.prefixName;
    this.stageName = props.stageName;
    this.moduleName = props.moduleName;
    this.configTableName = getConfigTableName(props.prefixName, props.stageName);
    this.loadedConfig = props.loadedConfig || {};

    // Extract custom props (excluding base WdkModuleProps)
    const { prefixName, stageName, moduleName, loadedConfig, outputs, ...customProps } = props;
    this.props = customProps as Omit<T, 'prefixName' | 'stageName' | 'moduleName' | 'loadedConfig' | 'outputs'>;

    // Initialize outputs from props
    if (props.outputs && props.outputs.length > 0) {
      this.moduleOutputs.push(...props.outputs);
    }

    // Call the module-specific initialization
    this.initialize();

    // Write outputs to config table
    if (this.moduleOutputs.length > 0) {
      new ConfigWriter(this, 'ConfigWriter', {
        tableName: this.configTableName,
        stackName: this.moduleName,
        properties: this.moduleOutputs,
      });
    }
  }

  /**
   * Get a configuration value from another stack
   * Values are loaded at synthesis time from DynamoDB
   * @param stackName The name of the stack that wrote the value
   * @param propertyName The property name
   */
  protected getInput(stackName: string, propertyName: string): string {
    const key = `${stackName}.${propertyName}`;
    const value = this.loadedConfig[key];
    
    if (value === undefined) {
      throw new Error(
        `Config value not found: ${key}\n` +
        `Make sure the stack that provides this value has been deployed and ` +
        `that "${key}" is included in the requiredInputs context parameter.`
      );
    }
    
    return value;
  }

  /**
   * Get the foundation KMS encryption key
   * This key is created in the foundation stack and can be used for encrypting resources
   * @returns KMS Key reference from the foundation stack
   */
  protected getFoundationEncryptionKey(): kms.IKey {
    const keyArn = cdk.Fn.importValue(`${this.prefixName}-${this.stageName}-encryption-key-arn`);
    return kms.Key.fromKeyArn(this, 'FoundationEncryptionKey', keyArn);
  }

  /**
   * Get the foundation access logs bucket
   * This bucket is created in the foundation stack and should be used for S3 access logging
   * @returns S3 Bucket reference from the foundation stack
   */
  protected getFoundationAccessLogsBucket(): s3.IBucket {
    const bucketName = cdk.Fn.importValue(`${this.prefixName}-${this.stageName}-access-logs-bucket-name`);
    const bucketArn = cdk.Fn.importValue(`${this.prefixName}-${this.stageName}-access-logs-bucket-arn`);
    return s3.Bucket.fromBucketAttributes(this, 'FoundationAccessLogsBucket', {
      bucketName,
      bucketArn,
    });
  }

  /**
   * Get the prefix string for use with WdkS3 and other constructs
   * Format: '{prefixName}-{stageName}'
   * @returns The prefix string
   */
  protected getPrefix(): string {
    return `${this.prefixName}-${this.stageName}`;
  }

  /**
   * Override this method to define your module's resources
   */
  protected abstract initialize(): void;

  /**
   * Create a CloudFormation output for this module
   * @param name The output name
   * @param value The output value
   * @param type The type of the value (e.g., 'string', 'arn', 'url')
   * @param shareable If true, this output will be written to DynamoDB and saved to module-config.json
   */
  protected createOutput(name: string, value: string, type: string = 'string', shareable: boolean = false): void {
    // Create CloudFormation output
    new cdk.CfnOutput(this, name, {
      value,
      exportName: `${this.prefixName}-${this.stageName}-${this.moduleName}-${name}`,
    });

    // If shareable, add to outputs and update module-config.json
    if (shareable) {
      // Add to outputs array for DynamoDB
      this.moduleOutputs.push({
        propertyName: name,
        value,
        type,
      });

      // Update module-config.json
      this.updateModuleConfig(name, type);
    }
  }

  /**
   * Update the module-config.json file to include the new output
   */
  private updateModuleConfig(propertyName: string, type: string): void {
    try {
      // Find the module-config.json file
      const moduleConfigPath = path.join(process.cwd(), this.moduleName, 'module-config.json');
      
      if (!fs.existsSync(moduleConfigPath)) {
        console.warn(`Warning: module-config.json not found at ${moduleConfigPath}`);
        return;
      }

      // Read the current config
      const configContent = fs.readFileSync(moduleConfigPath, 'utf-8');
      const config = JSON.parse(configContent);

      // Check if output already exists
      if (!config.outputs) {
        config.outputs = [];
      }

      const existingOutput = config.outputs.find((o: any) => o.propertyName === propertyName);
      
      if (!existingOutput) {
        // Add new output (value will be set at deployment time)
        config.outputs.push({
          propertyName,
          value: `<set at deployment>`,
          type,
        });

        // Write back to file
        fs.writeFileSync(moduleConfigPath, JSON.stringify(config, null, 2));
        console.log(`✅ Added output "${propertyName}" to module-config.json`);
      }
    } catch (error) {
      console.warn(`Warning: Could not update module-config.json: ${error}`);
    }
  }
}
