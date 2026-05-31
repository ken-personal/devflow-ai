import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import type { DevFlowAuthStack }    from './auth-stack';
import type { DevFlowStorageStack } from './storage-stack';

interface Props extends cdk.StackProps {
  appEnv: string;
  authStack: DevFlowAuthStack;
  storageStack: DevFlowStorageStack;
}

// Lambda 共通設定
const NODE_RUNTIME  = lambda.Runtime.NODEJS_22_X;
const ARCH          = lambda.Architecture.ARM_64;  // Graviton2 コスト20%削減
const BASE_ENV      = (props: Props) => ({
  DYNAMODB_TABLE_NAME:   props.storageStack.table.tableName,
  S3_BUCKET_NAME:        props.storageStack.filesBucket.bucketName,
  COGNITO_USER_POOL_ID:  props.authStack.userPool.userPoolId,
  COGNITO_CLIENT_ID:     props.authStack.userPoolClient.userPoolClientId,
  COGNITO_DOMAIN:        `https://devflow-${props.appEnv}.auth.ap-northeast-1.amazoncognito.com`,
  AWS_REGION:            'ap-northeast-1',
  ENV:                   props.appEnv,
});

export class DevFlowApiStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;
  public readonly authorizer: apigateway.CognitoUserPoolsAuthorizer;
  public readonly functions: Record<string, lambda.Function> = {};

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    const baseEnv = BASE_ENV(props);
    const srcPath  = '../src/functions';

    // ─── Lambda 関数ファクトリ ──────────────────────────────
    const makeFn = (name: string, dir: string, memoryMB: number, timeoutSec: number): lambda.Function => {
      const role = new iam.Role(this, `${name}Role`, {
        assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
        ],
      });

      const fn = new lambda.Function(this, name, {
        functionName:  `devflow-${dir}-api-${props.appEnv}`,
        runtime:       NODE_RUNTIME,
        architecture:  ARCH,
        handler:       'index.handler',
        code:          lambda.Code.fromAsset(`${srcPath}/${dir}`),
        memorySize:    memoryMB,
        timeout:       cdk.Duration.seconds(timeoutSec),
        environment:   baseEnv,
        role,
        logRetention:  logs.RetentionDays.ONE_YEAR,   // REQ-001 P-06: ログ1年保持
        tracing:       lambda.Tracing.ACTIVE,          // X-Ray
      });
      this.functions[name] = fn;
      return fn;
    };

    // DET-001 Lambda関数一覧の設定値準拠
    const authFn     = makeFn('AuthFn',     'auth',     512,  10);
    const projectsFn = makeFn('ProjectsFn', 'projects', 512,  10);
    const tasksFn    = makeFn('TasksFn',    'tasks',    512,  10);
    const filesFn    = makeFn('FilesFn',    'files',    256,  10);  // S3署名URL発行のみ
    const usersFn    = makeFn('UsersFn',    'users',    512,  10);
    const reportsFn  = makeFn('ReportsFn',  'reports',  1024, 30);  // Q-A: puppeteerのため1024MB
    const settingsFn = makeFn('SettingsFn', 'settings', 256,  10);  // Bedrock設定（Q-B）

    // ─── IAM 最小権限（CLAUDE.md: ワイルドカード禁止） ────────
    // DynamoDB
    const tableArn = props.storageStack.table.tableArn;
    const dynoPolicyDoc = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          actions: ['dynamodb:GetItem','dynamodb:PutItem','dynamodb:UpdateItem',
                    'dynamodb:DeleteItem','dynamodb:Query','dynamodb:BatchWriteItem'],
          resources: [tableArn, `${tableArn}/index/*`],
        }),
      ],
    });
    [projectsFn, tasksFn, usersFn, reportsFn, settingsFn].forEach(fn =>
      fn.role!.attachInlinePolicy(new iam.Policy(this, `${fn.functionName}DynoPolicy`, { document: dynoPolicyDoc }))
    );

    // S3（署名付きURL発行のみ）
    filesFn.role!.attachInlinePolicy(new iam.Policy(this, 'FilesFnS3Policy', {
      document: new iam.PolicyDocument({ statements: [
        new iam.PolicyStatement({
          actions: ['s3:PutObject'],
          resources: [`${props.storageStack.filesBucket.bucketArn}/*`],
        }),
      ]}),
    }));

    // Cognito（users / auth Lambda）
    const cognitoPolicyDoc = new iam.PolicyDocument({ statements: [
      new iam.PolicyStatement({
        actions: ['cognito-idp:AdminCreateUser','cognito-idp:AdminUpdateUserAttributes',
                  'cognito-idp:AdminEnableUser','cognito-idp:AdminDisableUser','cognito-idp:ListUsers'],
        resources: [props.authStack.userPool.userPoolArn],
      }),
    ]});
    [authFn, usersFn].forEach(fn =>
      fn.role!.attachInlinePolicy(new iam.Policy(this, `${fn.functionName}CognitoPolicy`, { document: cognitoPolicyDoc }))
    );

    // Bedrock（reports Lambda）
    reportsFn.role!.attachInlinePolicy(new iam.Policy(this, 'ReportsFnBedrockPolicy', {
      document: new iam.PolicyDocument({ statements: [
        new iam.PolicyStatement({
          actions: ['bedrock:InvokeModel'],
          resources: ['arn:aws:bedrock:ap-northeast-1::foundation-model/anthropic.claude-3-5-sonnet-20241022-v2:0'],
        }),
      ]}),
    }));

    // ─── AWS WAF v2（REST APIのみ直接適用可: BSD-001） ────────
    const waf = new wafv2.CfnWebACL(this, 'ApiWaf', {
      name:  `devflow-api-waf-${props.appEnv}`,
      scope: 'REGIONAL',
      defaultAction: { allow: {} },
      visibilityConfig: { cloudWatchMetricsEnabled: true, metricName: 'DevFlowWaf', sampledRequestsEnabled: true },
      rules: [
        // OWASP Top 10 全般
        { name: 'CommonRuleSet', priority: 1, overrideAction: { none: {} },
          visibilityConfig: { cloudWatchMetricsEnabled: true, metricName: 'CommonRuleSet', sampledRequestsEnabled: true },
          statement: { managedRuleGroupStatement: { vendorName: 'AWS', name: 'AWSManagedRulesCommonRuleSet' } } },
        // 既知の悪意あるリクエスト
        { name: 'KnownBadInputs', priority: 2, overrideAction: { none: {} },
          visibilityConfig: { cloudWatchMetricsEnabled: true, metricName: 'KnownBadInputs', sampledRequestsEnabled: true },
          statement: { managedRuleGroupStatement: { vendorName: 'AWS', name: 'AWSManagedRulesKnownBadInputsRuleSet' } } },
        // 悪性IPリスト
        { name: 'IPReputationList', priority: 3, overrideAction: { none: {} },
          visibilityConfig: { cloudWatchMetricsEnabled: true, metricName: 'IPReputation', sampledRequestsEnabled: true },
          statement: { managedRuleGroupStatement: { vendorName: 'AWS', name: 'AWSManagedRulesAmazonIpReputationList' } } },
        // レートベースルール: 5分間に1000リクエスト超でブロック（REQ-001 S-04）
        { name: 'RateLimit', priority: 4, action: { block: {} },
          visibilityConfig: { cloudWatchMetricsEnabled: true, metricName: 'RateLimit', sampledRequestsEnabled: true },
          statement: { rateBasedStatement: { limit: 1000, aggregateKeyType: 'IP' } } },
      ],
    });

    // ─── API Gateway REST API ─────────────────────────────
    this.api = new apigateway.RestApi(this, 'Api', {
      restApiName: `devflow-api-${props.appEnv}`,
      description: 'DevFlow AI REST API',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Authorization','Content-Type'],
      },
      deployOptions: {
        stageName: props.appEnv,
        throttlingRateLimit: 1000,   // REQ-001 S-04
        throttlingBurstLimit: 2000,
        tracingEnabled: true,        // X-Ray
        loggingLevel: apigateway.MethodLoggingLevel.ERROR,
        metricsEnabled: true,
      },
    });

    // WAF を API Gateway に関連付け
    new wafv2.CfnWebACLAssociation(this, 'WafAssociation', {
      resourceArn: `arn:aws:apigateway:ap-northeast-1::/restapis/${this.api.restApiId}/stages/${props.appEnv}`,
      webAclArn: waf.attrArn,
    });

    // JWT Authorizer（Cognito）
    this.authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'JwtAuthorizer', {
      cognitoUserPools: [props.authStack.userPool],
      authorizerName: 'CognitoJwtAuthorizer',
      identitySource: 'method.request.header.Authorization',
    });
    const authOpts: apigateway.MethodOptions = {
      authorizer: this.authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    };

    // ─── ルーティング ──────────────────────────────────────
    const v1 = this.api.root.addResource('api').addResource('v1');

    // /auth（公開エンドポイントあり）
    const authRes = v1.addResource('auth');
    authRes.addResource('login').addMethod('POST',  new apigateway.LambdaIntegration(authFn));
    authRes.addResource('logout').addMethod('POST', new apigateway.LambdaIntegration(authFn), authOpts);
    authRes.addResource('refresh').addMethod('POST',new apigateway.LambdaIntegration(authFn));
    authRes.addResource('me').addMethod('GET',      new apigateway.LambdaIntegration(authFn), authOpts);

    // /projects
    const projRes = v1.addResource('projects');
    projRes.addMethod('GET',  new apigateway.LambdaIntegration(projectsFn), authOpts);
    projRes.addMethod('POST', new apigateway.LambdaIntegration(projectsFn), authOpts);
    const projId = projRes.addResource('{id}');
    projId.addMethod('GET',    new apigateway.LambdaIntegration(projectsFn), authOpts);
    projId.addMethod('PUT',    new apigateway.LambdaIntegration(projectsFn), authOpts);
    projId.addMethod('DELETE', new apigateway.LambdaIntegration(projectsFn), authOpts);

    // /tasks
    const taskRes = v1.addResource('tasks');
    taskRes.addMethod('GET',  new apigateway.LambdaIntegration(tasksFn), authOpts);
    taskRes.addMethod('POST', new apigateway.LambdaIntegration(tasksFn), authOpts);
    const taskId = taskRes.addResource('{id}');
    taskId.addMethod('PUT',    new apigateway.LambdaIntegration(tasksFn), authOpts);
    taskId.addMethod('DELETE', new apigateway.LambdaIntegration(tasksFn), authOpts);
    taskId.addResource('comments').addMethod('POST', new apigateway.LambdaIntegration(tasksFn), authOpts);

    // /files
    v1.addResource('files').addResource('presigned-url')
      .addMethod('POST', new apigateway.LambdaIntegration(filesFn), authOpts);

    // /users
    const userRes = v1.addResource('users');
    userRes.addMethod('GET',  new apigateway.LambdaIntegration(usersFn), authOpts);
    userRes.addMethod('POST', new apigateway.LambdaIntegration(usersFn), authOpts);
    userRes.addResource('{id}').addMethod('PUT', new apigateway.LambdaIntegration(usersFn), authOpts);

    // /reports
    const repRes = v1.addResource('reports');
    repRes.addResource('generate').addMethod('POST', new apigateway.LambdaIntegration(reportsFn), authOpts);
    repRes.addMethod('GET', new apigateway.LambdaIntegration(reportsFn), authOpts);
    repRes.addResource('{id}').addMethod('GET', new apigateway.LambdaIntegration(reportsFn), authOpts);

    // /settings（Q-B: Bedrock設定をDynamoDBに保存）
    const settingsRes = v1.addResource('settings');
    const bedrockRes  = settingsRes.addResource('bedrock');
    bedrockRes.addMethod('GET', new apigateway.LambdaIntegration(settingsFn), authOpts);
    bedrockRes.addMethod('PUT', new apigateway.LambdaIntegration(settingsFn), authOpts);

    new cdk.CfnOutput(this, 'ApiUrl', { value: this.api.url });
  }
}
