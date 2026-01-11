# WdkS3 Lifecycle Management

This document explains how lifecycle policies work in WdkS3 buckets and how to configure them.

## Overview

WdkS3 automatically applies intelligent lifecycle policies to optimize storage costs while maintaining data availability. These policies are configured once during project initialization and apply to all buckets by default.

## Lifecycle Flow

```
Upload → Intelligent Tiering (Day 0) → Deep Archive (Optional) → Expiration (Optional)
```

### Stage 1: Intelligent Tiering (Immediate)
- **When**: Immediately upon upload (Day 0)
- **Purpose**: Automatically moves data between access tiers based on usage patterns
- **Cost Savings**: Up to 68% on storage costs for infrequently accessed data
- **Access**: Instant retrieval, no performance impact

### Stage 2: Deep Archive Transition (Optional)
- **When**: After X days (configured during init, minimum 90 days)
- **Purpose**: Long-term archival for data that is rarely accessed
- **Cost Savings**: Lowest storage cost (~$1/TB/month)
- **Access**: 12-48 hours retrieval time
- **Use Cases**: 
  - Compliance archives
  - Historical data
  - Long-term backups

### Stage 3: Expiration (Optional)
- **When**: After X days (configured during init)
- **Purpose**: Automatically delete data that is no longer needed
- **Cost Savings**: Eliminates storage costs entirely
- **Use Cases**:
  - Temporary data
  - Log files with retention policies
  - Data with regulatory deletion requirements

## Configuration During Init

When you run `conjure init`, you'll be prompted:

```
📦 S3 Bucket Lifecycle Configuration
ℹ️  Configure default lifecycle policies for all S3 buckets created with WdkS3.
   These settings help manage storage costs by automatically transitioning or deleting old data.

? Enable automatic transition to Deep Archive storage class? (y/N)
? Select the time unit for Deep Archive transition: (Use arrow keys)
  ❯ Days
    Weeks
    Months
    Years
? How many months before moving to Deep Archive? 12
? Enable automatic deletion of old files? (y/N)
? Select the time unit for file expiration: (Use arrow keys)
    Days
    Weeks
    Months
  ❯ Years
? How many years before permanently deleting files? 7
```

### Example Configurations

#### Configuration 1: Long-Term Archive (7 Years)
```
Deep Archive: Enabled (365 days)
Expiration: Enabled (2555 days / ~7 years)
```
**Use Case**: Financial records, compliance data
**Cost Profile**: Very low storage costs after 1 year

#### Configuration 2: Medium-Term Storage (2 Years)
```
Deep Archive: Enabled (180 days)
Expiration: Enabled (730 days / 2 years)
```
**Use Case**: Application logs, analytics data
**Cost Profile**: Balanced between access and cost

#### Configuration 3: Active Data Only
```
Deep Archive: Disabled
Expiration: Disabled
```
**Use Case**: Active application data, frequently accessed files
**Cost Profile**: Optimized by Intelligent Tiering only

#### Configuration 4: Temporary Storage (1 Year)
```
Deep Archive: Disabled
Expiration: Enabled (365 days)
```
**Use Case**: Temporary uploads, processing queues
**Cost Profile**: Automatic cleanup prevents cost accumulation

## The wdk-s3-defaults.json File

After initialization, your configuration is stored in `wdk/wdk-s3-defaults.json`:

```json
{
  "deepArchiveTransitionEnabled": true,
  "deepArchiveTransitionUnit": "years",
  "deepArchiveTransitionValue": 1,
  "expirationEnabled": true,
  "expirationUnit": "years",
  "expirationValue": 7
}
```

The WdkS3 construct uses CDK's `Duration` class to convert these values:
- `Duration.days(value)` for days
- `Duration.days(value * 7)` for weeks  
- `Duration.days(value * 31)` for months (accounts for longest month)
- `Duration.days(value * 366)` for years (accounts for leap years)

**Note**: These conversions err on the side of caution for compliance purposes, ensuring that lifecycle policies always meet or exceed the specified retention periods.

### Modifying Defaults

You can manually edit this file at any time:

```bash
# Edit the file
nano wdk/wdk-s3-defaults.json

# Changes apply to all NEW bucket deployments
cdk deploy
```

**Important**: Changes only affect new buckets or bucket updates. Existing objects follow the lifecycle rules that were in place when they were created.

## Per-Bucket Overrides

You can override the defaults for specific buckets:

```typescript
// Use custom lifecycle rules instead of defaults
const specialBucket = new WdkS3(this, 'SpecialBucket', {
  prefix: prefix,
  bucketName: `${prefix}-special`,
  lifecycleRules: [
    {
      id: 'CustomArchive',
      enabled: true,
      transitions: [
        {
          storageClass: s3.StorageClass.GLACIER,
          transitionAfter: Duration.days(30),
        },
      ],
      expiration: Duration.days(90),
    },
  ],
});

// Disable default lifecycle rules entirely
const noPolicyBucket = new WdkS3(this, 'NoPolicyBucket', {
  prefix: prefix,
  bucketName: `${prefix}-no-policy`,
  applyDefaultLifecycleRules: false,
});
```

## Built-In Lifecycle Rules

In addition to your configured policies, WdkS3 always applies these rules:

### 1. Multipart Upload Cleanup
- **Purpose**: Clean up incomplete multipart uploads
- **When**: After 7 days
- **Why**: Prevents storage costs from abandoned uploads

### 2. Version Management (if versioning enabled)
- **Non-current versions**: Transition to Infrequent Access after 30 days
- **Expiration**: Delete non-current versions after 90 days
- **Why**: Manages costs while maintaining version history

## Cost Optimization Examples

### Example 1: 1TB of Data, 7-Year Retention

**Without Lifecycle Policies:**
- Standard Storage: $23/month × 84 months = $1,932

**With Lifecycle Policies (365 days → Deep Archive, 2555 days expiration):**
- Year 1: Standard/Intelligent Tiering: ~$15/month × 12 = $180
- Years 2-7: Deep Archive: ~$1/month × 72 = $72
- **Total: $252 (87% savings)**

### Example 2: 100GB Daily Logs, 1-Year Retention

**Without Lifecycle Policies:**
- 36.5TB accumulated: $838/month at peak

**With Lifecycle Policies (expiration after 365 days):**
- Rolling 1-year window: ~$70/month average
- **Savings: $768/month (92% savings)**

## Best Practices

### 1. Choose Appropriate Retention Periods
- **Compliance**: Follow regulatory requirements (often 7 years)
- **Analytics**: Keep data as long as it provides value
- **Logs**: 30-90 days for debugging, longer for security

### 2. Consider Access Patterns
- **Frequent Access**: Don't use Deep Archive
- **Occasional Access**: Use Deep Archive after 90-180 days
- **Rare Access**: Use Deep Archive after 30-90 days

### 3. Test Retrieval Times
- Deep Archive retrieval takes 12-48 hours
- Plan ahead for data you might need to access
- Consider keeping recent data in Intelligent Tiering

### 4. Monitor and Adjust
```bash
# Review your lifecycle configuration
cat wdk/wdk-s3-defaults.json

# Check bucket metrics in AWS Console
# CloudWatch → S3 → Storage Metrics

# Adjust if needed
nano wdk/wdk-s3-defaults.json
cdk deploy
```

### 5. Document Your Policy
Add comments to your infrastructure code:

```typescript
// Compliance requirement: 7-year retention for financial records
const financialBucket = new WdkS3(this, 'FinancialRecords', {
  prefix: prefix,
  bucketName: `${prefix}-financial`,
  // Uses project defaults: 365 days → Deep Archive, 2555 days expiration
});
```

## Troubleshooting

### Objects Not Transitioning

**Check:**
1. Lifecycle rules are enabled: `applyDefaultLifecycleRules: true`
2. Configuration file exists: `wdk/wdk-s3-defaults.json`
3. Minimum object size: Objects must be >128KB for some transitions
4. Time: Transitions happen at midnight UTC

### Unexpected Costs

**Check:**
1. Minimum storage duration charges (Deep Archive: 180 days)
2. Early deletion fees if objects are deleted before minimum duration
3. Retrieval costs for Deep Archive access
4. Request costs for lifecycle transitions

### Cannot Retrieve Archived Data

**Remember:**
- Deep Archive retrieval takes 12-48 hours
- Use Expedited retrieval for faster access (higher cost)
- Consider keeping recent data in Intelligent Tiering

## Additional Resources

- [AWS S3 Lifecycle Documentation](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lifecycle-mgmt.html)
- [AWS S3 Storage Classes](https://aws.amazon.com/s3/storage-classes/)
- [AWS S3 Pricing Calculator](https://calculator.aws/)

## Summary

WdkS3 lifecycle management provides:
- ✅ Automatic cost optimization
- ✅ Consistent policies across all buckets
- ✅ Flexible configuration per project
- ✅ Override capability for special cases
- ✅ Built-in best practices

Configure once during `conjure init`, and all your S3 buckets will automatically follow intelligent lifecycle policies!
