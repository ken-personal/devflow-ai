import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { Construct } from 'constructs';
import type { DevFlowStorageStack } from './storage-stack';
import type { DevFlowApiStack }     from './api-stack';

interface Props extends cdk.StackProps {
  appEnv: string;
  storageStack: DevFlowStorageStack;
  apiStack: DevFlowApiStack;
}

export class DevFlowAiStack extends cdk.Stack {
  public readonly aiFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    // ─── IAM Role（最小権限: CLAUDE.md） ──────────────────
    const role = new iam.Role(this, 'AiFnRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    const tableArn = props.storageStack.table.tableArn;

    // DynamoDB: Read系 + save_report ツールのみ PutItem を許可
    role.attachInlinePolicy(new iam.Policy(this, 'DynamoPolicy', {
      document: new iam.PolicyDocument({ statements: [
        new iam.PolicyStatement({
          // CLAUDE.md: ツールは Read Only 原則。PutItem は save_report のみ
          actions: ['dynamodb:GetItem','dynamodb:Query','dynamodb:PutItem'],
          resources: [tableArn, `${tableArn}/index/*`],
        }),
      ]}),
    }));

    // Bedrock: InvokeModel のみ（ワイルドカード禁止）
    role.attachInlinePolicy(new iam.Policy(this, 'BedrockPolicy', {
      document: new iam.PolicyDocument({ statements: [
        new iam.PolicyStatement({
          actions: ['bedrock:InvokeModel','bedrock:InvokeModelWithResponseStream'],
          resources: ['arn:aws:bedrock:ap-northeast-1::foundation-model/anthropic.claude-3-5-sonnet-20241022-v2:0'],
        }),
      ]}),
    }));

    // S3: get_documents ツール用（GetObject のみ）
    role.attachInlinePolicy(new iam.Policy(this, 'S3Policy', {
      document: new iam.PolicyDocument({ statements: [
        new iam.PolicyStatement({
          actions: ['s3:GetObject'],
          resources: [`${props.storageStack.filesBucket.bucketArn}/*`],
        }),
      ]}),
    }));

    // ─── Python Lambda（SnapStart 有効: DET-001） ─────────
    this.aiFunction = new lambda.Function(this, 'AiFn', {
      functionName: `devflow-ai-api-${props.appEnv}`,
      runtime:      lambda.Runtime.PYTHON_3_13,
      architecture: lambda.Architecture.ARM_64,
      handler:      'handler.lambda_handler',
      code:         lambda.Code.fromAsset('../src/functions/ai'),
      memorySize:   1024,
      timeout:      cdk.Duration.seconds(30),
      role,
      environment: {
        DYNAMODB_TABLE_NAME: props.storageStack.table.tableName,
        S3_BUCKET_NAME:      props.storageStack.filesBucket.bucketName,
        BEDROCK_MODEL_ID:    'anthropic.claude-3-5-sonnet-20241022-v2:0',
        AWS_REGION:          'ap-northeast-1',
        ENV:                 props.appEnv,
      },
      logRetention: logs.RetentionDays.ONE_YEAR,
      tracing:      lambda.Tracing.ACTIVE,
      // SnapStart: Python 3.13 対応（REQ-001 P-04）
      snapStart:    lambda.SnapStartConf.ON_PUBLISHED_VERSIONS,
    });

    // ─── API Gateway に AI エンドポイントを追加 ────────────
    const authOpts: apigateway.MethodOptions = {
      authorizer: props.apiStack.authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    };

    const v1 = props.apiStack.api.root.getResource('api')!.getResource('v1')!;
    const aiRes   = v1.addResource('ai');
    // POST /ai/chat
    aiRes.addResource('chat').addMethod('POST', new apigateway.LambdaIntegration(this.aiFunction), authOpts);
    // GET /ai/sessions, GET /ai/sessions/{id}/messages
    const sessions = aiRes.addResource('sessions');
    sessions.addMethod('GET', new apigateway.LambdaIntegration(this.aiFunction), authOpts);
    sessions.addResource('{id}').addResource('messages')
      .addMethod('GET', new apigateway.LambdaIntegration(this.aiFunction), authOpts);

    new cdk.CfnOutput(this, 'AiFunctionArn', { value: this.aiFunction.functionArn });
  }
}
