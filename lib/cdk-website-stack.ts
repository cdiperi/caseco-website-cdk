import * as cdk from 'aws-cdk-lib';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as amplify from 'aws-cdk-lib/aws-amplify';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
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

    // Grant the CDK deployment role permission to read the GitHub token parameter
    // This assumes the CDK is being deployed with a role that has these permissions
    // If you're deploying with a user, this isn't needed
    const cdkDeploymentRoleName = 'cdk-hnb659fds-deploy-role-' + this.account + '-' + this.region;
    const cdkDeploymentRole = iam.Role.fromRoleName(this, 'CdkDeploymentRole', cdkDeploymentRoleName);

    // Add a policy statement granting access to the parameter
    const ssmParameterArn = `arn:aws:ssm:${this.region}:${this.account}:parameter/caseco/github/access-token`;
    const ssmPolicyStatement = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['ssm:GetParameter', 'ssm:GetParameters'],
      resources: [ssmParameterArn],
    });

    // Create a policy document with the statement
    const ssmPolicy = new iam.Policy(this, 'SsmParameterAccessPolicy', {
      statements: [ssmPolicyStatement],
    });

    // Attach the policy to the role
    ssmPolicy.attachToRole(cdkDeploymentRole);

    // Retrieve GitHub token from SSM Parameter Store
    const githubToken = ssm.StringParameter.fromSecureStringParameterAttributes(this, 'GitHubToken', {
      parameterName: '/caseco/github/access-token',
    }).stringValue;

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
        - npm ci
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: dist
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
      - .vite/**/*
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

    // Manually configure custom domain paths for each environment
    if (environment === 'prod') {
      new cdk.CfnOutput(this, 'DomainInstructions', {
        value: 'After deployment, go to Amplify Console and manually connect prod.diperidata.com to the main branch',
      });
    } else {
      new cdk.CfnOutput(this, 'DomainInstructions', {
        value: 'After deployment, go to Amplify Console and manually connect beta.diperidata.com to the beta branch',
      });
    }

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

    new cdk.CfnOutput(this, 'EnvironmentName', {
      value: environment,
      description: 'Environment Name'
    });
  }
}