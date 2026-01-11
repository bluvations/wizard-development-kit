# Using Custom Props in WdkModule

This guide explains how to use custom properties in your WDK modules using the `this.props` feature.

## Overview

The `WdkModule` base class now provides a `this.props` property that contains all custom module-specific properties, excluding the base WdkModule properties (`prefixName`, `stageName`, `moduleName`, `loadedConfig`, `outputs`).

## Basic Usage

### 1. Define Your Custom Props Interface

```typescript
import { WdkModule, WdkModuleProps } from '../wdk/wdk-module';
import { Construct } from 'constructs';

export interface MyModuleStackProps extends WdkModuleProps {
  // Custom properties for your module
  readonly enableFeatureX?: boolean;
  readonly customBucketName?: string;
  readonly retentionDays?: number;
  readonly tags?: { [key: string]: string };
}
```

### 2. Extend WdkModule with Type Parameter

```typescript
export class MyModuleStack extends WdkModule<MyModuleStackProps> {
  constructor(scope: Construct, id: string, props: MyModuleStackProps) {
    super(scope, id, props);
  }

  protected initialize(): void {
    // Access your custom props via this.props
    const enableFeature = this.props.enableFeatureX ?? false;
    const bucketName = this.props.customBucketName || `${this.getPrefix()}-default`;
    const retention = this.props.retentionDays ?? 30;
    
    // Use the props to configure your resources
    if (enableFeature) {
      // Create feature-specific resources
    }
  }
}
```

## Type Safety

The `this.props` property is fully type-safe and will only contain your custom properties:

```typescript
export interface MyModuleStackProps extends WdkModuleProps {
  readonly databaseName: string;
  readonly enableBackups?: boolean;
}

export class MyModuleStack extends WdkModule<MyModuleStackProps> {
  protected initialize(): void {
    // ✅ Type-safe access to custom props
    const dbName = this.props.databaseName;  // Type: string
    const backups = this.props.enableBackups; // Type: boolean | undefined
    
    // ✅ TypeScript autocomplete will show:
    // - this.props.databaseName
    // - this.props.enableBackups
    // (and any other custom props you defined)
    
    // ❌ TypeScript error - these are base props, not in this.props
    // const prefix = this.props.prefixName;  // Error!
    // const stage = this.props.stageName;     // Error!
    
    // ✅ Use base class properties directly
    const prefix = this.prefixName;
    const stage = this.stageName;
  }
}
```

**How the typing works:**
- The generic type parameter `<MyModuleStackProps>` tells WdkModule about your custom props
- TypeScript uses `Omit<T, 'prefixName' | 'stageName' | 'moduleName' | 'loadedConfig' | 'outputs'>` to exclude base props
- The result is that `this.props` only contains your custom properties with full type safety

## Complete Example

Here's a complete example of a module with custom props:

```typescript
import { WdkModule, WdkModuleProps } from '../wdk/wdk-module';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { WdkS3 } from '../wdk/constructs';

export interface DataProcessingStackProps extends WdkModuleProps {
  /**
   * Name of the DynamoDB table to create
   */
  readonly tableName: string;
  
  /**
   * Enable point-in-time recovery for the table
   * @default true
   */
  readonly enablePITR?: boolean;
  
  /**
   * Lambda function memory size in MB
   * @default 512
   */
  readonly lambdaMemorySize?: number;
  
  /**
   * S3 bucket versioning
   * @default true
   */
  readonly enableVersioning?: boolean;
  
  /**
   * Custom tags to apply to all resources
   */
  readonly customTags?: { [key: string]: string };
}

export class DataProcessingStack extends WdkModule<DataProcessingStackProps> {
  constructor(scope: Construct, id: string, props: DataProcessingStackProps) {
    super(scope, id, props);
  }

  protected initialize(): void {
    const prefix = this.getPrefix();
    const encryptionKey = this.getFoundationEncryptionKey();
    
    // Access custom props with defaults
    const enablePITR = this.props.enablePITR ?? true;
    const memorySize = this.props.lambdaMemorySize ?? 512;
    const versioning = this.props.enableVersioning ?? true;
    
    // Create DynamoDB table with custom configuration
    const table = new dynamodb.Table(this, 'DataTable', {
      tableName: `${prefix}-${this.props.tableName}`,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: encryptionKey,
      pointInTimeRecovery: enablePITR,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });
    
    // Create S3 bucket with custom versioning setting
    const dataBucket = new WdkS3(this, 'DataBucket', {
      prefix: prefix,
      bucketName: `${prefix}-${this.moduleName}-data`,
      encryptionKey: encryptionKey,
      serverAccessLogsPrefix: `${this.moduleName}/data/`,
      versioned: versioning,
    });
    
    // Create Lambda with custom memory size
    const processor = new lambda.Function(this, 'Processor', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda'),
      memorySize: memorySize,
      environment: {
        TABLE_NAME: table.tableName,
        BUCKET_NAME: dataBucket.bucket.bucketName,
      },
    });
    
    // Apply custom tags if provided
    if (this.props.customTags) {
      Object.entries(this.props.customTags).forEach(([key, value]) => {
        cdk.Tags.of(this).add(key, value);
      });
    }
    
    // Grant permissions
    table.grantReadWriteData(processor);
    dataBucket.grantReadWrite(processor);
    
    // Write outputs for other stacks
    this.addOutput('tableName', table.tableName, 'string');
    this.addOutput('tableArn', table.tableArn, 'arn');
    this.addOutput('bucketName', dataBucket.bucket.bucketName, 'string');
    this.addOutput('processorArn', processor.functionArn, 'arn');
  }
}
```

## Using the Module

When instantiating your module in the CDK app:

```typescript
import { DataProcessingStack } from './stacks/data-processing-stack';

const dataProcessing = new DataProcessingStack(app, 'DataProcessing', {
  prefixName: 'myproject',
  stageName: 'dev',
  moduleName: 'data-processing',
  
  // Custom props
  tableName: 'user-events',
  enablePITR: true,
  lambdaMemorySize: 1024,
  enableVersioning: true,
  customTags: {
    Team: 'DataEngineering',
    CostCenter: 'Engineering',
  },
});
```

## Benefits

### 1. **Type Safety**
- Full TypeScript type checking for your custom props
- Autocomplete support in your IDE
- Compile-time errors for invalid property access

### 2. **Clean Separation**
- Base WdkModule props are handled automatically
- Custom props are clearly separated in `this.props`
- No confusion about which properties are available where

### 3. **Flexibility**
- Add as many custom props as needed
- Use optional props with default values
- Pass complex objects, arrays, or primitives

### 4. **Documentation**
- Custom props interface serves as documentation
- JSDoc comments explain each property
- Default values are clearly indicated

## Best Practices

### 1. Use Readonly Properties
```typescript
export interface MyModuleStackProps extends WdkModuleProps {
  readonly myProp: string;  // ✅ Readonly
  myOtherProp: string;      // ❌ Not readonly
}
```

### 2. Provide Default Values
```typescript
protected initialize(): void {
  // ✅ Good - provides default
  const timeout = this.props.timeoutSeconds ?? 30;
  
  // ❌ Bad - could be undefined
  const timeout = this.props.timeoutSeconds;
}
```

### 3. Document Your Props
```typescript
export interface MyModuleStackProps extends WdkModuleProps {
  /**
   * The name of the S3 bucket to create
   * Must be globally unique
   */
  readonly bucketName: string;
  
  /**
   * Enable versioning for the bucket
   * @default true
   */
  readonly enableVersioning?: boolean;
}
```

### 4. Use Descriptive Names
```typescript
// ✅ Good
readonly databaseRetentionDays?: number;
readonly enableAutomaticBackups?: boolean;

// ❌ Bad
readonly days?: number;
readonly flag?: boolean;
```

### 5. Group Related Props
```typescript
export interface MyModuleStackProps extends WdkModuleProps {
  // Database configuration
  readonly databaseName: string;
  readonly databaseRetentionDays?: number;
  
  // Lambda configuration
  readonly lambdaMemorySize?: number;
  readonly lambdaTimeout?: number;
  
  // Feature flags
  readonly enableFeatureX?: boolean;
  readonly enableFeatureY?: boolean;
}
```

## Migration from Old Code

If you have existing modules that access props directly, here's how to migrate:

### Before
```typescript
export class MyStack extends WdkModule {
  constructor(scope: Construct, id: string, props: MyStackProps) {
    super(scope, id, props);
    
    // Accessing custom props from constructor parameter
    const customValue = props.customProp;
  }
}
```

### After
```typescript
export class MyStack extends WdkModule<MyStackProps> {
  constructor(scope: Construct, id: string, props: MyStackProps) {
    super(scope, id, props);
  }
  
  protected initialize(): void {
    // Access custom props via this.props
    const customValue = this.props.customProp;
  }
}
```

## Summary

The `this.props` feature provides a clean, type-safe way to access custom module properties:

- ✅ Type-safe access to custom props
- ✅ Automatic exclusion of base WdkModule props
- ✅ Full IDE autocomplete support
- ✅ Clear separation of concerns
- ✅ Easy to document and maintain

Use `this.props` for all custom module-specific configuration!
