import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as guardduty from 'aws-cdk-lib/aws-guardduty';
import { Construct } from 'constructs';
import type { DevFlowApiStack } from './api-stack';
import type { DevFlowAiStack }  from './ai-stack';

interface Props extends cdk.StackProps {
  appEnv: string;
  apiStack: DevFlowApiStack;
  aiStack: DevFlowAiStack;
}

export class DevFlowMonitorStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    // ─── SNS アラート通知トピック ──────────────────────────
    const alertTopic = new sns.Topic(this, 'AlertTopic', {
      topicName: `devflow-alerts-${props.appEnv}`,
      displayName: 'DevFlow AI アラート通知',
    });

    const alarmAction = new actions.SnsAction(alertTopic);

    // ─── Lambda エラー率アラーム（全関数） ─────────────────
    Object.entries(props.apiStack.functions).forEach(([name, fn]) => {
      new cloudwatch.Alarm(this, `${name}ErrorAlarm`, {
        alarmName:          `devflow-${name}-errors-${props.appEnv}`,
        metric:             fn.metricErrors({ period: cdk.Duration.minutes(5) }),
        threshold:          5,
        evaluationPeriods:  1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData:   cloudwatch.TreatMissingData.NOT_BREACHING,
      }).addAlarmAction(alarmAction);
    });

    // ─── AI Lambda 専用: Bedrock タイムアウトアラーム ──────
    new cloudwatch.Alarm(this, 'AiFnTimeoutAlarm', {
      alarmName:          `devflow-ai-timeout-${props.appEnv}`,
      metric:             props.aiStack.aiFunction.metricErrors({ period: cdk.Duration.minutes(5) }),
      threshold:          3,
      evaluationPeriods:  1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData:   cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(alarmAction);

    // ─── Bedrockコスト爆発防止（DB-001 LLMセキュリティ ⑤対応）
    // カスタムメトリクスでBedrockInvokeModel呼び出し数を監視
    new cloudwatch.Alarm(this, 'BedrockCallAlarm', {
      alarmName: `devflow-bedrock-calls-${props.appEnv}`,
      metric: new cloudwatch.Metric({
        namespace:  'DevFlowAI',
        metricName: 'BedrockInvokeCount',
        statistic:  'Sum',
        period:     cdk.Duration.hours(1),
      }),
      threshold:          100,   // 1時間100回超でアラート
      evaluationPeriods:  1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData:   cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(alarmAction);

    // ─── GuardDuty（不正アクセス・異常行動検知: REQ-001 S-08） ──
    new guardduty.CfnDetector(this, 'GuardDuty', {
      enable: true,
      findingPublishingFrequency: 'SIX_HOURS',
    });

    new cdk.CfnOutput(this, 'AlertTopicArn', { value: alertTopic.topicArn });
  }
}
