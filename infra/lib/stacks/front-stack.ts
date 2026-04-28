import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import { Construct } from 'constructs';
import type { DevFlowApiStack } from './api-stack';

interface Props extends cdk.StackProps {
  appEnv: string;
  apiStack: DevFlowApiStack;
}

export class DevFlowFrontStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    // ─── S3（静的コンテンツ: パブリックアクセス禁止） ────────
    const bucket = new s3.Bucket(this, 'FrontBucket', {
      bucketName:        `devflow-front-${props.appEnv}-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: props.appEnv === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: props.appEnv !== 'prod',
    });

    // ─── CloudFront（OAC: フロントエンドのみ。API Gatewayへの前置なし: BSD-001 C-02） ──
    const oac = new cloudfront.S3OriginAccessControl(this, 'OAC', {
      description: 'DevFlow Front OAC',
    });

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket, {
          originAccessControl: oac,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      defaultRootObject: 'index.html',
      // SPA: 全パスを index.html にフォールバック
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html' },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' },
      ],
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
    });

    new cdk.CfnOutput(this, 'DistributionUrl', { value: `https://${distribution.distributionDomainName}` });
    new cdk.CfnOutput(this, 'FrontBucketName', { value: bucket.bucketName });
  }
}
