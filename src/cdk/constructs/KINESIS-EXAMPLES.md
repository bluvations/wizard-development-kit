# WdkKinesisStream Examples

Practical examples for using the WdkKinesisStream construct in various scenarios.

## Table of Contents

- [Basic Stream](#basic-stream)
- [Amazon Connect Integration](#amazon-connect-integration)
- [Multi-Stream Architecture](#multi-stream-architecture)
- [Lambda Consumer Pattern](#lambda-consumer-pattern)
- [Cross-Account Access](#cross-account-access)
- [Monitoring and Alerting](#monitoring-and-alerting)

---

## Basic Stream

Simple Kinesis stream with default settings:

```typescript
import { WdkKinesisStream } from './constructs';
import { Duration } from 'aws-cdk-lib';

export class MyModuleStack extends WdkModule<MyModuleStackProps> {
  protected initialize(): void {
    const prefix = this.getPrefix();
    const encryptionKey = this.getFoundationEncryptionKey();

    const stream = new WdkKinesisStream(this, 'BasicStream', {
      prefix: prefix,
      streamName: `${prefix}-events`,
      encryptionKey: encryptionKey,
      // Uses defaults: 1 shard, 24-hour retention, PROVISIONED mode
    });

    // Output the stream ARN for other stacks
    this.addOutput('streamArn', stream.streamArn, 'arn');
    this.addOutput('streamName', stream.streamName, 'string');
  }
}
```

---

## Amazon Connect Integration

Streams for Amazon Connect data export:

```typescript
import { WdkKinesisStream } from './constructs';
import { Duration, aws_kinesis as kinesis } from 'aws-cdk-lib';

export class ConnectFoundationStack extends WdkModule<ConnectFoundationStackProps> {
  protected initialize(): void {
    const prefix = this.getPrefix();
    const encryptionKey = this.getFoundationEncryptionKey();

    // Contact Trace Records (CTR) Stream
    const ctrStream = new WdkKinesisStream(this, 'CTRStream', {
      prefix: prefix,
      streamName: `${prefix}-contact-trace-records`,
      encryptionKey: encryptionKey,
      retentionPeriod: Duration.hours(24),
      shardCount: 1,
      createAlarms: true,
    });

    // Agent Events Stream
    const agentEventsStream = new WdkKinesisStream(this, 'AgentEventsStream', {
      prefix: prefix,
      streamName: `${prefix}-agent-events`,
      encryptionKey: encryptionKey,
      retentionPeriod: Duration.hours(24),
      shardCount: 1,
      createAlarms: true,
    });

    // Contact Events Stream (higher volume)
    const contactEventsStream = new WdkKinesisStream(this, 'ContactEventsStream', {
      prefix: prefix,
      streamName: `${prefix}-contact-events`,
      encryptionKey: encryptionKey,
      retentionPeriod: Duration.hours(168), // 7 days
      shardCount: 2, // Higher capacity for contact events
      createAlarms: true,
    });

    // Export stream ARNs for Amazon Connect configuration
    this.addOutput('ctrStreamArn', ctrStream.streamArn, 'arn');
    this.addOutput('agentEventsStreamArn', agentEventsStream.streamArn, 'arn');
    this.addOutput('contactEventsStreamArn', contactEventsStream.streamArn, 'arn');
  }
}
```

---

## Multi-Stream Architecture

Separate streams for different data types:

```typescript
import { WdkKinesisStream } from './constructs';
import { Duration, aws_kinesis as kinesis } from 'aws-cdk-lib';

export class DataPipelineStack extends WdkModule<DataPipelineStackProps> {
  protected initialize(): void {
    const prefix = this.getPrefix();
    const encryptionKey = this.getFoundationEncryptionKey();

    // High-priority stream (ON_DEMAND for variable load)
    const priorityStream = new WdkKinesisStream(this, 'PriorityStream', {
      prefix: prefix,
      streamName: `${prefix}-priority-events`,
      encryptionKey: encryptionKey,
      streamMode: kinesis.StreamMode.ON_DEMAND,
      retentionPeriod: Duration.hours(48),
      createAlarms: true,
    });

    // Standard stream (PROVISIONED for predictable load)
    const standardStream = new WdkKinesisStream(this, 'StandardStream', {
      prefix: prefix,
      streamName: `${prefix}-standard-events`,
      encryptionKey: encryptionKey,
      streamMode: kinesis.StreamMode.PROVISIONED,
      shardCount: 2,
      retentionPeriod: Duration.hours(24),
      createAlarms: true,
    });

    // Archive stream (long retention)
    const archiveStream = new WdkKinesisStream(this, 'ArchiveStream', {
      prefix: prefix,
      streamName: `${prefix}-archive-events`,
      encryptionKey: encryptionKey,
      streamMode: kinesis.StreamMode.PROVISIONED,
      shardCount: 1,
      retentionPeriod: Duration.days(365), // Maximum retention
      createAlarms: false, // No alarms for archive stream
    });

    // Export all stream ARNs
    this.addOutput('priorityStreamArn', priorityStream.streamArn, 'arn');
    this.addOutput('standardStreamArn', standardStream.streamArn, 'arn');
    this.addOutput('archiveStreamArn', archiveStream.streamArn, 'arn');
  }
}
```

---

## Lambda Consumer Pattern

Stream with Lambda function consumers:

```typescript
import { WdkKinesisStream } from './constructs';
import { Duration, aws_lambda as lambda, aws_lambda_event_sources as sources } from 'aws-cdk-lib';

export class StreamProcessingStack extends WdkModule<StreamProcessingStackProps> {
  protected initialize(): void {
    const prefix = this.getPrefix();
    const encryptionKey = this.getFoundationEncryptionKey();

    // Create the stream
    const dataStream = new WdkKinesisStream(this, 'DataStream', {
      prefix: prefix,
      streamName: `${prefix}-data-stream`,
      encryptionKey: encryptionKey,
      retentionPeriod: Duration.hours(48),
      shardCount: 2,
      createAlarms: true,
    });

    // Lambda function to process stream records
    const processor = new lambda.Function(this, 'StreamProcessor', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/stream-processor'),
      timeout: Duration.seconds(60),
      memorySize: 512,
      environment: {
        STREAM_NAME: dataStream.streamName,
      },
    });

    // Grant read permissions to Lambda
    dataStream.grantRead(processor);

    // Add Kinesis event source to Lambda
    processor.addEventSource(
      new sources.KinesisEventSource(dataStream.stream, {
        startingPosition: lambda.StartingPosition.LATEST,
        batchSize: 100,
        maxBatchingWindow: Duration.seconds(5),
        retryAttempts: 3,
        parallelizationFactor: 1,
        reportBatchItemFailures: true,
      })
    );

    // Lambda function to write to stream
    const producer = new lambda.Function(this, 'StreamProducer', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/stream-producer'),
      timeout: Duration.seconds(30),
      environment: {
        STREAM_NAME: dataStream.streamName,
      },
    });

    // Grant write permissions to Lambda
    dataStream.grantWrite(producer);

    // Export function ARNs
    this.addOutput('processorArn', processor.functionArn, 'arn');
    this.addOutput('producerArn', producer.functionArn, 'arn');
  }
}
```

---

## Cross-Account Access

Grant access to streams from another AWS account:

```typescript
import { WdkKinesisStream } from './constructs';
import { Duration, aws_iam as iam } from 'aws-cdk-lib';

export class SharedStreamStack extends WdkModule<SharedStreamStackProps> {
  protected initialize(): void {
    const prefix = this.getPrefix();
    const encryptionKey = this.getFoundationEncryptionKey();

    // Create shared stream
    const sharedStream = new WdkKinesisStream(this, 'SharedStream', {
      prefix: prefix,
      streamName: `${prefix}-shared-stream`,
      encryptionKey: encryptionKey,
      retentionPeriod: Duration.hours(24),
      shardCount: 1,
    });

    // Grant read access to another account
    const consumerAccountId = this.props.consumerAccountId;
    const consumerRole = iam.Role.fromRoleArn(
      this,
      'ConsumerRole',
      `arn:aws:iam::${consumerAccountId}:role/KinesisConsumerRole`
    );

    sharedStream.grantRead(consumerRole);

    // Also grant KMS key access for cross-account
    encryptionKey.grantDecrypt(consumerRole);

    // Export stream ARN
    this.addOutput('sharedStreamArn', sharedStream.streamArn, 'arn');
  }
}
```

---

## Monitoring and Alerting

Advanced monitoring with custom alarms:

```typescript
import { WdkKinesisStream } from './constructs';
import { Duration, aws_cloudwatch as cloudwatch, aws_sns as sns } from 'aws-cdk-lib';

export class MonitoredStreamStack extends WdkModule<MonitoredStreamStackProps> {
  protected initialize(): void {
    const prefix = this.getPrefix();
    const encryptionKey = this.getFoundationEncryptionKey();

    // Create stream with enhanced monitoring
    const stream = new WdkKinesisStream(this, 'MonitoredStream', {
      prefix: prefix,
      streamName: `${prefix}-monitored-stream`,
      encryptionKey: encryptionKey,
      retentionPeriod: Duration.hours(24),
      shardCount: 2,
      enhancedMonitoring: true,
      createAlarms: true,
    });

    // Create SNS topic for alarm notifications
    const alarmTopic = new sns.Topic(this, 'AlarmTopic', {
      topicName: `${prefix}-kinesis-alarms`,
      displayName: 'Kinesis Stream Alarms',
    });

    // Subscribe alarms to SNS topic
    if (stream.alarms) {
      stream.alarms.writeProvisionedThroughputExceeded?.addAlarmAction(
        new cloudwatch_actions.SnsAction(alarmTopic)
      );
      stream.alarms.readProvisionedThroughputExceeded?.addAlarmAction(
        new cloudwatch_actions.SnsAction(alarmTopic)
      );
      stream.alarms.getRecordsIteratorAgeMilliseconds?.addAlarmAction(
        new cloudwatch_actions.SnsAction(alarmTopic)
      );
    }

    // Create custom alarm for incoming records
    const incomingRecordsAlarm = new cloudwatch.Alarm(this, 'IncomingRecordsAlarm', {
      alarmName: `${prefix}-low-incoming-records`,
      alarmDescription: 'Alerts when incoming records drop below threshold',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/Kinesis',
        metricName: 'IncomingRecords',
        dimensionsMap: {
          StreamName: stream.streamName,
        },
        statistic: 'Sum',
        period: Duration.minutes(5),
      }),
      threshold: 10,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
    });

    incomingRecordsAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(alarmTopic));

    // Create dashboard
    const dashboard = new cloudwatch.Dashboard(this, 'StreamDashboard', {
      dashboardName: `${prefix}-kinesis-dashboard`,
    });

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Incoming Records',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/Kinesis',
            metricName: 'IncomingRecords',
            dimensionsMap: { StreamName: stream.streamName },
            statistic: 'Sum',
          }),
        ],
      }),
      new cloudwatch.GraphWidget({
        title: 'Iterator Age',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/Kinesis',
            metricName: 'GetRecords.IteratorAgeMilliseconds',
            dimensionsMap: { StreamName: stream.streamName },
            statistic: 'Maximum',
          }),
        ],
      })
    );

    // Export monitoring resources
    this.addOutput('alarmTopicArn', alarmTopic.topicArn, 'arn');
    this.addOutput('dashboardUrl', dashboard.dashboardArn, 'arn');
  }
}
```

---

## Best Practices Summary

### 1. **Naming Convention**
```typescript
streamName: `${prefix}-${purpose}-stream`
// Examples:
// - myproject-dev-contact-trace-records
// - myproject-prod-agent-events
```

### 2. **Encryption**
```typescript
// Always use KMS encryption for sensitive data
encryptionKey: this.getFoundationEncryptionKey()
```

### 3. **Capacity Planning**
```typescript
// Start small, scale based on metrics
shardCount: 1  // Start here
// Monitor WriteProvisionedThroughputExceeded
// Scale up if consistently exceeded
```

### 4. **Retention**
```typescript
// Balance recovery needs vs. costs
retentionPeriod: Duration.hours(24)   // Standard
retentionPeriod: Duration.hours(168)  // 7 days for important data
retentionPeriod: Duration.days(365)   // Maximum for compliance
```

### 5. **Monitoring**
```typescript
// Always enable alarms for production streams
createAlarms: true
// Use enhanced monitoring for troubleshooting
enhancedMonitoring: true  // Only when needed (additional cost)
```

### 6. **Consumer Pattern**
```typescript
// Use Lambda event source mapping for processing
processor.addEventSource(
  new sources.KinesisEventSource(stream.stream, {
    startingPosition: lambda.StartingPosition.LATEST,
    batchSize: 100,
    reportBatchItemFailures: true,  // Enable partial batch failures
  })
);
```

### 7. **Error Handling**
```typescript
// Configure retry attempts
retryAttempts: 3
// Use DLQ for failed records
onFailure: new destinations.SqsDestination(dlq)
```
