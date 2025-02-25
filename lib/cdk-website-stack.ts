import * as cdk from 'aws-cdk-lib';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as amplify from 'aws-cdk-lib/aws-amplify';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface WebsiteStackProps extends cdk.StackProps {
  readonly environment?: string;
}

export class WebsiteStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: WebsiteStackProps) {
    super(scope, id, props);

    // Determine environment (default to 'beta' if not specified)
    const environment = props?.environment || 'beta';

    // Determine branch name (main for prod, beta for beta)
    const branchName = environment === 'prod' ? 'main' : 'beta';

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

    // Get GitHub token from context
    const githubToken = this.node.tryGetContext('github-token');
    if (!githubToken) {
      throw new Error('GitHub token not provided in context. Please provide it using --context github-token=<token>');
    }

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
      // GitHub repository configuration
      repository: 'https://github.com/cdiperi/caseco-website',
      accessToken: githubToken,
      buildSpec: `
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - echo "Installing dependencies..."
        - nvm install 20
        - nvm use 20
        - node --version
        - npm --version
        - echo "Using npm install instead of npm ci for dependency resolution"
        - NODE_ENV=development npm install
        - echo "Checking installed packages..."
        - npm list --depth=0
    build:
      commands:
        - echo "Building project..."
        - npm run build
  artifacts:
    baseDirectory: dist
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
      - .npm/**/*
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
          name: 'VITE_APP_ENVIRONMENT',
          value: environment
        },
        {
          name: 'NODE_OPTIONS',
          value: '--max_old_space_size=4096'
        }
      ]
    });

    // Create branch configuration
    const branch = new amplify.CfnBranch(this, `${environment}Branch`, {
      appId: amplifyApp.attrAppId,
      branchName: branchName,
      enableAutoBuild: true,
      environmentVariables: [
        {
          name: 'VITE_APP_ENVIRONMENT',
          value: environment
        }
      ]
    });

    // Ensure branch is created after app
    branch.addDependency(amplifyApp);

    // Add domain configuration
    const domain = new amplify.CfnDomain(this, 'AmplifyDomain', {
      appId: amplifyApp.attrAppId,
      domainName: 'diperidata.com',
      enableAutoSubDomain: false,
      subDomainSettings: [
        {
          branchName: branchName,
          prefix: environment
        }
      ]
    });

    // Ensure domain is created after branch
    domain.addDependency(branch);

    // Output the Amplify App ID and Console URL
    new cdk.CfnOutput(this, 'AmplifyAppId', {
      value: amplifyApp.attrAppId,
      description: 'Amplify App ID'
    });

    new cdk.CfnOutput(this, 'AmplifyConsoleUrl', {
      value: `https://${cdk.Stack.of(this).region}.console.aws.amazon.com/amplify/home?region=${cdk.Stack.of(this).region}#/${amplifyApp.attrAppId}`,
      description: 'Link to Amplify Console'
    });

    new cdk.CfnOutput(this, 'AmplifyBranchUrl', {
      value: `https://${branchName}.${amplifyApp.attrDefaultDomain}`,
      description: 'Default Amplify Branch URL'
    });

    new cdk.CfnOutput(this, 'CustomDomainUrl', {
      value: `https://${environment}.diperidata.com`,
      description: 'Custom Domain URL'
    });
  }
}