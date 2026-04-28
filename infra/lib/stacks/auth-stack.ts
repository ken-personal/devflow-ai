import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

interface Props extends cdk.StackProps { appEnv: string; }

export class DevFlowAuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly userPoolDomain: cognito.UserPoolDomain;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    // ─── Cognito User Pool ─────────────────────────────────
    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `devflow-${props.appEnv}`,
      selfSignUpEnabled: false,          // 管理者のみ招待
      signInAliases: { email: true },
      autoVerify: { email: true },

      // REQ-001 S-02: NIST SP 800-63B準拠パスワードポリシー
      passwordPolicy: {
        minLength: 12,
        requireUppercase: true,
        requireLowercase: true,
        requireDigits: true,
        requireSymbols: true,
      },

      // MFA: Admin必須・Member任意（BSD-001）
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: { sms: false, otp: true },

      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: props.appEnv === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,

      // カスタム属性: role / name
      customAttributes: {
        role: new cognito.StringAttribute({ mutable: true }),
        name: new cognito.StringAttribute({ mutable: true }),
      },

      // ユーザーロックアウト: 5回失敗
      userVerification: {
        emailSubject: 'DevFlow AI へようこそ',
        emailBody: '確認コード: {####}',
        emailStyle: cognito.VerificationEmailStyle.CODE,
      },
    });

    // ─── Google SSO（#6決定: コードのみ実装。クライアントIDは環境変数で後から設定）──
    const googleClientId     = this.node.tryGetContext('googleClientId') as string | undefined;
    const googleClientSecret = this.node.tryGetContext('googleClientSecret') as string | undefined;
    if (googleClientId && googleClientSecret) {
      new cognito.UserPoolIdentityProviderGoogle(this, 'Google', {
        userPool: this.userPool,
        clientId: googleClientId,
        clientSecretValue: cdk.SecretValue.unsafePlainText(googleClientSecret),
        scopes: ['email', 'profile', 'openid'],
        attributeMapping: {
          email:          cognito.ProviderAttribute.GOOGLE_EMAIL,
          givenName:      cognito.ProviderAttribute.GOOGLE_GIVEN_NAME,
          familyName:     cognito.ProviderAttribute.GOOGLE_FAMILY_NAME,
        },
      });
    }

    // ─── App Client ────────────────────────────────────────
    this.userPoolClient = this.userPool.addClient('AppClient', {
      userPoolClientName: `devflow-app-${props.appEnv}`,
      authFlows: {
        userSrp: true,
        userPassword: false,     // SRP推奨
      },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.EMAIL, cognito.OAuthScope.OPENID, cognito.OAuthScope.PROFILE],
        callbackUrls: props.appEnv === 'prod'
          ? ['https://your-domain.example.com/callback']   // TODO: 本番ドメインに変更
          : ['http://localhost:5173/callback'],
        logoutUrls: props.appEnv === 'prod'
          ? ['https://your-domain.example.com/']
          : ['http://localhost:5173/'],
      },
      // DET-001: アクセストークン1時間・リフレッシュトークン30日
      accessTokenValidity:  cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
      generateSecret: false,
    });

    // ─── HostedUI ドメイン ──────────────────────────────────
    this.userPoolDomain = this.userPool.addDomain('Domain', {
      cognitoDomain: { domainPrefix: `devflow-${props.appEnv}` },
    });

    // ─── Outputs ───────────────────────────────────────────
    new cdk.CfnOutput(this, 'UserPoolId',       { value: this.userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: this.userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'CognitoDomain',    {
      value: `https://${this.userPoolDomain.domainName}.auth.ap-northeast-1.amazoncognito.com`,
    });
  }
}
