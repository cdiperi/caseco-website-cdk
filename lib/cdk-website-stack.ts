import * as cdk from 'aws-cdk-lib';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as amplify from 'aws-cdk-lib/aws-amplify';
import * as iam from 'aws-cdk-lib/aws-iam';

export interface WebsiteStackProps extends cdk.StackProps {
  // Allow passing in environment name
  readonly environment?: string;
}

export class WebsiteStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: WebsiteStackProps) {
    super(scope, id, props);

    // Determine environment (default to 'beta' if not specified)
    const environment = props?.environment || 'beta';

    // Import existing Route53 hosted zone
    const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'Zone', {
      hostedZoneId: 'Z00755652O7ROSUDROQNF',
      zoneName: 'diperidata.com'
    });

    // Create wildcard certificate
    const wildcardCertificate = new acm.Certificate(this, 'WildcardCertificate', {
      domainName: 'diperidata.com',
      subjectAlternativeNames: ['*.diperidata.com'],
      validation: acm.CertificateValidation.fromDns(zone),
    });

    // Create Amplify IAM role
    const amplifyRole = new iam.Role(this, 'AmplifyServiceRole', {
      assumedBy: new iam.ServicePrincipal('amplify.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess-Amplify')
      ]
    });

    // Create Amplify app with environment in the name
    const amplifyApp = new amplify.CfnApp(this, 'AmplifyApp', {
      name: `caseco-website-${environment}`,
      iamServiceRole: amplifyRole.roleArn,
      buildSpec: `
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - npm ci
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: build
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
`,
      customRules: [
        {
          source: '/<*>',
          target: '/index.html',
          status: '404-200'
        }
      ],
      environmentVariables: [
        {
          name: 'NODE_ENV',
          value: 'production'
        },
        {
          name: 'REACT_APP_ENVIRONMENT',
          value: environment
        }
      ]
    });

    // Output the Amplify App ID and Console URL
    new cdk.CfnOutput(this, 'AmplifyAppId', {
      value: amplifyApp.attrAppId,
      description: 'Amplify App ID'
    });

    new cdk.CfnOutput(this, 'AmplifyConsoleUrl', {
      value: `https://${cdk.Stack.of(this).region}.console.aws.amazon.com/amplify/home?region=${cdk.Stack.of(this).region}#/${amplifyApp.attrAppId}`,
      description: 'Link to Amplify Console'
    });
  }
}