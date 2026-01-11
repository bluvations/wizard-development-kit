# Configuration Management

The WDK uses a DynamoDB-based configuration management system to share outputs between stacks at synthesis time.

## Overview

The configuration system allows modules to:
1. **Write outputs** to a shared DynamoDB table
2. **Read inputs** from other stacks at CDK synthesis time
3. **Share configuration** across multiple deployments

## Architecture

### Components

1. **ConfigWriter** - Writes module outputs to DynamoDB
2. **ConfigLoader** - Reads configuration at synthesis time
3. **Config Table** - DynamoDB table storing all configuration

### Config Table Structure

```
Table Name: wdk-{prefix}-{stage}-config

Primary Key:
- stackName (String) - Partition key
- propertyName (String) - Sort key

Attributes:
- value (String) - The configuration value
- type (String) - The type of value (string, arn, url, etc.)
```

## Writing Outputs

### Using `createOutput()`

The `createOutput()` method in WdkModule creates both CloudFormation outputs and optionally writes to the config table:

```typescript
export class MyModuleStack extends WdkModule<MyModuleStackProps> {
  protected initialize(): void {
    const bucket = new WdkS3(this, 'Bucket', {
      prefix: this.getPrefix(),
      bucketName: `${this.getPrefix()}-my-bucket`,
    });

    // Create output (CloudFormation only)
    this.createOutput('BucketName', bucket.bucketName, 'string', false);

    // Create shareable output (CloudFormation + DynamoDB)
    this.createOutput('BucketArn', bucket.bucket.bucketArn, 'arn', true);
  }
}
```

**Parameters:**
- `name` - The output name
- `value` - The output value
- `type` - The type ('string', 'arn', 'url', etc.)
- `shareable` - If true, writes to DynamoDB (default: false)

### Batch Writing

The ConfigWriter uses DynamoDB's `BatchWriteItem` API to efficiently write multiple outputs:

**Benefits:**
- ✅ **Single Custom Resource** - Creates one resource instead of one per output
- ✅ **Efficient** - Writes up to 25 items per API call
- ✅ **Automatic Batching** - Splits large output sets into batches of 25
- ✅ **Reduced CloudFormation Resources** - Fewer resources = faster deployments

**Example:**
```typescript
// 30 outputs = 2 custom resources (25 + 5)
// Old approach: 30 custom resources
// New approach: 2 custom resources
```

## Reading Inputs

### Using `getInput()`

Read configuration values from other stacks at synthesis time:

```typescript
export class ConsumerStack extends WdkModule<ConsumerStackProps> {
  protected initialize(): void {
    // Read from another stack
    const bucketArn = this.getInput('my-module', 'BucketArn');
    
    // Use the value
    const bucket = s3.Bucket.fromBucketArn(this, 'ImportedBucket', bucketArn);
  }
}
```

**How it works:**
1. ConfigLoader reads from DynamoDB at synthesis time
2. Values are passed to the stack via `loadedConfig` prop
3. `getInput()` retrieves the value from the loaded config

### Error Handling

If a required input is not found:

```typescript
const value = this.getInput('other-stack', 'MissingProperty');
// Error: Config value not found: other-stack.MissingProperty
// Make sure the stack that provides this value has been deployed and
// run 'conjure load-config' to refresh the configuration.
```

## Deployment Order

### Initial Deployment

1. Deploy foundation stack first
2. Deploy module stacks in dependency order
3. Run `conjure load-config` to load outputs
4. Deploy dependent stacks

**Example:**
```bash
# Deploy producer stack
cdk deploy MyProducerStack

# Load configuration
conjure load-config

# Deploy consumer stack (can now read producer outputs)
cdk deploy MyConsumerStack
```

### Subsequent Deployments

The `loadedConfig` is automatically refreshed before each synthesis, so you only need to run `load-config` when:
- Adding new dependencies
- Troubleshooting missing values
- After manual DynamoDB changes

## Best Practices

### 1. Use Shareable Outputs Sparingly

Only mark outputs as shareable if they're needed by other stacks:

```typescript
// ✅ Good - only share what's needed
this.createOutput('BucketArn', bucket.bucketArn, 'arn', true);  // Shared
this.createOutput('BucketName', bucket.bucketName, 'string', false);  // Local only

// ❌ Bad - sharing everything
this.createOutput('InternalDetail', someValue, 'string', true);  // Not needed by others
```

### 2. Use Descriptive Names

```typescript
// ✅ Good
this.createOutput('DataBucketArn', bucket.bucketArn, 'arn', true);
this.createOutput('ProcessorFunctionArn', fn.functionArn, 'arn', true);

// ❌ Bad
this.createOutput('Arn1', bucket.bucketArn, 'arn', true);
this.createOutput('Arn2', fn.functionArn, 'arn', true);
```

### 3. Specify Correct Types

```typescript
// ✅ Good - correct types
this.createOutput('BucketArn', bucket.bucketArn, 'arn', true);
this.createOutput('BucketName', bucket.bucketName, 'string', true);
this.createOutput('ApiUrl', api.url, 'url', true);

// ❌ Bad - generic types
this.createOutput('BucketArn', bucket.bucketArn, 'string', true);
```

### 4. Handle Missing Values

```typescript
// ✅ Good - check before using
try {
  const bucketArn = this.getInput('producer', 'BucketArn');
  // Use bucketArn
} catch (error) {
  console.warn('Producer stack not deployed yet');
  // Provide fallback or skip feature
}

// ❌ Bad - assume value exists
const bucketArn = this.getInput('producer', 'BucketArn');  // May throw
```

### 5. Document Dependencies

```typescript
/**
 * Consumer Module Stack
 * 
 * Dependencies:
 * - producer-stack: BucketArn, QueueUrl
 * - auth-stack: UserPoolId
 * 
 * Deploy order: foundation → producer → auth → consumer
 */
export class ConsumerStack extends WdkModule<ConsumerStackProps> {
  // ...
}
```

## Performance Optimization

### Batch Size

The ConfigWriter automatically batches writes in groups of 25 (DynamoDB limit):

```typescript
// 100 outputs = 4 batches
// Batch 1: outputs 0-24
// Batch 2: outputs 25-49
// Batch 3: outputs 50-74
// Batch 4: outputs 75-99
```

### Resource Count

**Before optimization:**
- 50 outputs = 50 custom resources
- CloudFormation template size: Large
- Deployment time: Slow

**After optimization:**
- 50 outputs = 2 custom resources (2 batches)
- CloudFormation template size: Smaller
- Deployment time: Faster

### CloudFormation Limits

AWS CloudFormation has a 500 resource limit per stack. Using batch writes helps stay under this limit:

```typescript
// Old approach: 200 outputs = 200 resources (40% of limit)
// New approach: 200 outputs = 8 resources (1.6% of limit)
```

## Troubleshooting

### "Config value not found"

**Cause:** The producer stack hasn't been deployed or config wasn't loaded.

**Solution:**
```bash
# Deploy the producer stack
cdk deploy ProducerStack

# Load configuration
conjure load-config

# Try again
cdk deploy ConsumerStack
```

### "There is already a Construct with name..."

**Cause:** Duplicate output names in the same stack.

**Solution:** Ensure all output names are unique within a stack:
```typescript
// ❌ Bad - duplicate names
this.createOutput('BucketArn', bucket1.bucketArn, 'arn', true);
this.createOutput('BucketArn', bucket2.bucketArn, 'arn', true);

// ✅ Good - unique names
this.createOutput('DataBucketArn', bucket1.bucketArn, 'arn', true);
this.createOutput('LogsBucketArn', bucket2.bucketArn, 'arn', true);
```

### "RequestItems exceeded maximum allowed size"

**Cause:** Trying to write more than 25 items in a single batch (shouldn't happen with automatic batching).

**Solution:** The ConfigWriter automatically handles this, but if you see this error, check that you're not manually creating ConfigWriter instances.

## Advanced Usage

### Conditional Outputs

```typescript
protected initialize(): void {
  const bucket = new WdkS3(this, 'Bucket', {
    prefix: this.getPrefix(),
    bucketName: `${this.getPrefix()}-bucket`,
  });

  // Always create CloudFormation output
  this.createOutput('BucketName', bucket.bucketName, 'string', false);

  // Conditionally share based on props
  if (this.props.shareOutputs) {
    this.createOutput('BucketArn', bucket.bucket.bucketArn, 'arn', true);
  }
}
```

### Cross-Stage References

```typescript
// In dev stage, reference prod resources
const prodBucketArn = this.getInput('producer', 'BucketArn');
// Note: This requires the prod config to be loaded
```

### Module Config File

Outputs are also saved to `{moduleName}/module-config.json`:

```json
{
  "moduleName": "my-module",
  "outputs": [
    {
      "propertyName": "BucketArn",
      "type": "arn"
    },
    {
      "propertyName": "QueueUrl",
      "type": "url"
    }
  ]
}
```

This file serves as documentation for what outputs the module provides.

## Summary

The WDK configuration management system provides:

- ✅ **Efficient batch writing** - Reduces CloudFormation resources
- ✅ **Cross-stack communication** - Share outputs between modules
- ✅ **Synthesis-time resolution** - No CloudFormation exports needed
- ✅ **Type-safe** - TypeScript types for all values
- ✅ **Documented** - Automatic module-config.json generation

Use `createOutput()` to share values and `getInput()` to consume them!
