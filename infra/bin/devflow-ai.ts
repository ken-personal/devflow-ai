#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DevFlowAuthStack }    from '../lib/stacks/auth-stack';
import { DevFlowStorageStack } from '../lib/stacks/storage-stack';
import { DevFlowApiStack }     from '../lib/stacks/api-stack';
import { DevFlowAiStack }      from '../lib/stacks/ai-stack';
import { DevFlowFrontStack }   from '../lib/stacks/front-stack';
import { DevFlowMonitorStack } from '../lib/stacks/monitor-stack';

const app = new cdk.App();

// CDKコンテキストから env を取得（必須: --context env=dev|stg|prod）
const env = app.node.tryGetContext('env') as string;
if (!['dev', 'stg', 'prod'].includes(env)) {
  throw new Error('--context env=dev|stg|prod を指定してください');
}

const awsEnv: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region:  'ap-northeast-1',
};

// デプロイ順序: Auth → Storage → Api → Ai → Front → Monitor
const authStack    = new DevFlowAuthStack(app,    `DevFlowAuth-${env}`,    { env: awsEnv, appEnv: env });
const storageStack = new DevFlowStorageStack(app, `DevFlowStorage-${env}`, { env: awsEnv, appEnv: env });
const apiStack     = new DevFlowApiStack(app,     `DevFlowApi-${env}`,     { env: awsEnv, appEnv: env, authStack, storageStack });
const aiStack      = new DevFlowAiStack(app,      `DevFlowAi-${env}`,      { env: awsEnv, appEnv: env, storageStack, apiStack });
const frontStack   = new DevFlowFrontStack(app,   `DevFlowFront-${env}`,   { env: awsEnv, appEnv: env, apiStack });
const monitorStack = new DevFlowMonitorStack(app, `DevFlowMonitor-${env}`, { env: awsEnv, appEnv: env, apiStack, aiStack });

// スタック間の依存順序を明示
storageStack.addDependency(authStack);
apiStack.addDependency(storageStack);
aiStack.addDependency(storageStack);
frontStack.addDependency(apiStack);
monitorStack.addDependency(aiStack);

app.synth();
