import * as cdk from 'aws-cdk-lib';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as amplify from 'aws-cdk-lib/aws-amplify';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as targets from 'aws-cdk-lib/aws-route53-targets';

export class WebsiteStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

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

    // Create Amplify app
    const amplifyApp = new amplify.CfnApp(this, 'AmplifyApp', {
      name: 'caseco-website',
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
      ]
    });

    // Create main branch
    const mainBranch = new amplify.CfnBranch(this, 'MainBranch', {
      appId: amplifyApp.attrAppId,
      branchName: 'main',
      enableAutoBuild: true,
      framework: 'React',
      stage: 'PRODUCTION'
    });

    // Make sure the branch is created before the domain
    mainBranch.addDependency(amplifyApp);

    // Create Amplify Domain Association for dev subdomain
    const devDomain = new amplify.CfnDomain(this, 'AmplifyDomain', {
      appId: amplifyApp.attrAppId,
      domainName: 'diperidata.com',
      subDomainSettings: [
        {
          branchName: mainBranch.branchName,
          prefix: 'dev'
        }
      ],
      enableAutoSubDomain: true,
    });

    // Add explicit dependencies
    devDomain.addDependency(mainBranch);
    devDomain.addDependency(amplifyApp);

    // Output the Amplify App URL
    new cdk.CfnOutput(this, 'AmplifyDevURL', {
      value: `https://dev.diperidata.com`,
      description: 'Development URL for the Amplify app'
    });

    new cdk.CfnOutput(this, 'AmplifyAppId', {
      value: amplifyApp.attrAppId,
      description: 'Amplify App ID'
    });
  }
}