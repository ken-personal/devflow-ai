import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

interface Props extends cdk.StackProps { appEnv: string; }

export class DevFlowStorageStack extends cdk.Stack {
  public readonly table: dynamodb.Table;
  public readonly filesBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    // ─── DynamoDB Single Table（DB-001準拠） ──────────────
    this.table = new dynamodb.Table(this, 'DevFlowMain', {
      tableName:      `DevFlowMain-${props.appEnv}`,
      partitionKey:   { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey:        { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode:    dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption:     dynamodb.TableEncryption.AWS_MANAGED,   // SSE-KMS
      pointInTimeRecovery: true,                              // PITR 35日
      timeToLiveAttribute: 'ttl',                             // TTL属性名
      // 本番のみ削除保護
      deletionProtection: props.appEnv === 'prod',
      removalPolicy: props.appEnv === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    });

    // GSI1: entity_type-updated_at-index（AP-02,04,12,13）
    this.table.addGlobalSecondaryIndex({
      indexName:      'entity_type-updated_at-index',
      partitionKey:   { name: 'gsi1pk', type: dynamodb.AttributeType.STRING },
      sortKey:        { name: 'gsi1sk', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI2: user-entity-index（AP-03,07,10）- GSIオーバーロード: sk をそのまま使用
    this.table.addGlobalSecondaryIndex({
      indexName:      'user-entity-index',
      partitionKey:   { name: 'gsi2pk', type: dynamodb.AttributeType.STRING },
      sortKey:        { name: 'sk',     type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI3: task-id-index（AP-06）- KEYS_ONLY でコスト最小化
    this.table.addGlobalSecondaryIndex({
      indexName:      'task-id-index',
      partitionKey:   { name: 'task_id', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.KEYS_ONLY,
    });

    // GSI4: due-date-index（AP-08）- due_epoch は Number型必須（範囲クエリのため）
    this.table.addGlobalSecondaryIndex({
      indexName:      'due-date-index',
      partitionKey:   { name: 'assignee_id', type: dynamodb.AttributeType.STRING },
      sortKey:        { name: 'due_epoch',   type: dynamodb.AttributeType.NUMBER },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ─── S3 ファイルバケット ───────────────────────────────
    this.filesBucket = new s3.Bucket(this, 'FilesBucket', {
      bucketName:        `devflow-files-${props.appEnv}-${this.account}`,
      encryption:        s3.BucketEncryption.KMS_MANAGED,     // SSE-KMS
      versioned:         true,                                 // バージョニング有効
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,       // パブリックアクセス禁止
      cors: [{
        allowedMethods: [s3.HttpMethods.PUT],
        allowedOrigins: props.appEnv === 'prod'
          ? ['https://your-domain.example.com']
          : ['http://localhost:5173'],
        allowedHeaders: ['*'],
        maxAge: 300,
      }],
      // ライフサイクル: 5年後にGlacierへ移行（REQ-001 P-06）
      lifecycleRules: [{
        transitions: [{
          storageClass: s3.StorageClass.GLACIER,
          transitionAfter: cdk.Duration.days(365 * 5),
        }],
      }],
      removalPolicy: props.appEnv === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: props.appEnv !== 'prod',
    });

    new cdk.CfnOutput(this, 'TableName',      { value: this.table.tableName });
    new cdk.CfnOutput(this, 'FilesBucketName',{ value: this.filesBucket.bucketName });
  }
}
